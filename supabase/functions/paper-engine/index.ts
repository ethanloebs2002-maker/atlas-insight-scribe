import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const VERSION_TAG = "v1.9.0";

// ─── HORIZON ROUTER ──────────────────────────────────────────────
type HorizonTF = "15m" | "30m" | "1h" | "4h" | "1d";
type Horizon = "4h" | "6h" | "12h" | "24h" | "72h";

const TF_TO_BASE_HORIZON: Record<HorizonTF, Horizon> = {
  "15m": "4h",
  "30m": "6h",
  "1h": "12h",
  "4h": "24h",
  "1d": "72h",
};
const HORIZON_ORDER: Horizon[] = ["4h", "6h", "12h", "24h", "72h"];

function routeHorizon(timeframe: string, regime?: string): Horizon {
  const base = TF_TO_BASE_HORIZON[timeframe as HorizonTF];
  if (!base) return "24h";
  const idx = HORIZON_ORDER.indexOf(base);
  if (!regime) return base;
  const r = regime.toUpperCase();
  if (r === "TRENDING") return HORIZON_ORDER[Math.min(idx + 1, HORIZON_ORDER.length - 1)];
  if (r === "CHOPPY") return HORIZON_ORDER[Math.max(idx - 1, 0)];
  return base;
}

// ─── GRADUATION THRESHOLDS ────────────────────────────────────────
const GRADUATION_GATES = {
  1: { minDecisions: 500, minTrades: 150, minDirAcc: 0.65, minAvgR: 0.00 },
  2: { minDecisions: 500, minTrades: 150, minDirAcc: 0.70, minAvgR: 0.10 },
  3: { minDecisions: 500, minTrades: 150, minDirAcc: 0.72, minAvgR: 0.15 },
};

const INFLUENCE_MODES: Record<number, string> = {
  0: "OFF",
  1: "Calibration",
  2: "Weights",
  3: "Sizing",
};

// ─── BUY & HOLD HORIZON CONFIGURATION ────────────────────────────
const PUBLIC_HORIZONS = ["6m", "1y", "3y", "5y"];
const LEARNING_HORIZONS = ["3m", "6m", "1y", "3y", "5y"];

const CADENCE_MAP: Record<string, string> = {
  "3m": "weekly",
  "6m": "monthly",
  "1y": "monthly",
  "3y": "monthly",
  "5y": "monthly",
};

const NEUTRAL_BAND_CONFIG: Record<string, { minBand: number; atrMultiplier: number }> = {
  "3m": { minBand: 0.01, atrMultiplier: 0.6 },
  "4h": { minBand: 0.001, atrMultiplier: 0.15 },
  "6h": { minBand: 0.001, atrMultiplier: 0.18 },
  "12h": { minBand: 0.0012, atrMultiplier: 0.2 },
  "6m": { minBand: 0.015, atrMultiplier: 0.25 },
  "1y": { minBand: 0.015, atrMultiplier: 0.25 },
  "3y": { minBand: 0.015, atrMultiplier: 0.25 },
  "5y": { minBand: 0.015, atrMultiplier: 0.25 },
  "24h": { minBand: 0.0015, atrMultiplier: 0.25 },
  "72h": { minBand: 0.002, atrMultiplier: 0.3 },
};

const BH_L1_FAST_GATES = {
  minDirAcc: 0.62,
  minEvBh: 0,
  minDecisions: 40,
};

// ─── DEBUG TRACE HELPER ──────────────────────────────────────────
async function trace(runId: string, assetId: string, timeframe: string, phase: string, eventType: string, message: string, payload: any = {}) {
  try {
    await supabase.from("debug_trace_events").insert({
      run_id: runId,
      asset_id: assetId,
      timeframe,
      phase,
      event_type: eventType,
      message,
      payload_json: payload,
    });
  } catch { /* non-critical */ }
}

// ─── TIMEFRAME NORMALIZATION ─────────────────────────────────────
function normalizeTimeframeKey(input: string): string {
  const lower = input.toLowerCase();
  const map: Record<string, string> = {
    "1h": "1H", "60m": "1H",
    "4h": "4H", "240m": "4H",
    "1d": "1D", "24h": "1D",
    "1w": "1W",
  };
  return map[lower] || input;
}

function timeframeClass(tf: string): string {
  const normalized = normalizeTimeframeKey(tf);
  if (["1m", "5m", "15m", "30m", "1H"].includes(normalized)) return "intraday";
  if (["4H", "8H", "12H"].includes(normalized)) return "swing";
  return "HTF";
}

// ─── RECORD DECISION ──────────────────────────────────────────────
async function recordDecision(body: any) {
  const { asset_id, timeframe, horizon, ref_price, direction_pred, probability_pred, agreement_score, consensus_score, completeness_score, evidence_snapshot_json } = body;

  const { data, error } = await supabase.from("paper_decisions").insert({
    asset_id, timeframe: timeframe || "4h", horizon: horizon || routeHorizon(timeframe || "4h"),
    ref_price, direction_pred, probability_pred,
    agreement_score: agreement_score || 0,
    consensus_score: consensus_score || 0,
    completeness_score: completeness_score || 0,
    evidence_snapshot_json,
  }).select().single();

  if (error) throw error;
  return data;
}

// ─── DEDUPE HELPER ────────────────────────────────────────────────
function buildDuplicateKey(asset_id: string, direction: string, timeframe: string, horizon: string): string {
  return `${asset_id}|${direction}|${timeframe}|${horizon}`;
}

async function cancelOlderDuplicates(duplicate_key: string, keepId?: string) {
  let query = supabase
    .from("paper_trades")
    .select("id")
    .eq("duplicate_key", duplicate_key)
    .in("status", ["OPEN", "PENDING"])
    .order("created_at", { ascending: false });

  const { data: dupes } = await query;
  if (!dupes || dupes.length === 0) return 0;

  const idsToCancel = dupes.filter(d => d.id !== keepId).map(d => d.id);
  if (idsToCancel.length === 0) return 0;

  await supabase.from("paper_trades").update({
    status: "CANCELED_DEDUPE",
    ts_closed: new Date().toISOString(),
    close_reason: "duplicate_key replaced by newer trade",
  }).in("id", idsToCancel);

  return idsToCancel.length;
}

// ─── RECORD TRADE ─────────────────────────────────────────────────
async function recordTrade(body: any) {
  const { decision_id, asset_id, timeframe, regime_label, scenario_type, entry_zone_low, entry_zone_high, trigger_rule, stop_level, stop_rule, targets_json, time_window_end, evidence_snapshot_json } = body;

  // Determine direction from scenario_type for dedupe key
  const direction = scenario_type === "bullish" ? "UP" : scenario_type === "bearish" ? "DOWN" : "NEUTRAL";
  const horizon = body.horizon || "24h";
  const dupeKey = buildDuplicateKey(asset_id, direction, timeframe || "4h", horizon);

  const { data, error } = await supabase.from("paper_trades").insert({
    decision_id, asset_id, timeframe: timeframe || "4h",
    regime_label, scenario_type, entry_zone_low, entry_zone_high,
    trigger_rule, stop_level, stop_rule, targets_json,
    time_window_end, evidence_snapshot_json,
    status: "PENDING",
    duplicate_key: dupeKey,
  }).select().single();

  if (error) throw error;

  // Cancel older duplicates (KEEP_NEWEST policy)
  await cancelOlderDuplicates(dupeKey, data.id);

  return data;
}

// ─── CADENCE GUARD ───────────────────────────────────────────────
async function checkCadenceGuard(emittedBy: string): Promise<{ allowed: boolean; reason?: string }> {
  // Manual evaluations bypass the cadence guard
  if (emittedBy === "MANUAL_EVALUATE") return { allowed: true };

  const { data: settings } = await supabase
    .from("atlas_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (!settings) return { allowed: true }; // no settings row = allow

  const cadenceMs = settings.eval_cadence_ms || 3600000;
  const lastAt = settings.last_auto_eval_at;

  if (lastAt) {
    const elapsed = Date.now() - new Date(lastAt).getTime();
    if (elapsed < cadenceMs) {
      return { allowed: false, reason: `Cadence guard: ${elapsed}ms elapsed < ${cadenceMs}ms cadence` };
    }
  }

  // Atomically stamp last_auto_eval_at
  await supabase.from("atlas_settings").update({
    last_auto_eval_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", "global");

  return { allowed: true };
}

// ─── PROBABILITY CLAMPING ────────────────────────────────────────
function clampProbability(raw: unknown, source: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw as number)) {
    console.warn(`[clampProbability] Non-finite from ${source}, defaulting to 0.5`);
    return 0.5;
  }
  let v = raw as number;
  // Auto-normalize percent-scale values (1–100] → [0.01–1]
  if (v > 1 && v <= 100) {
    console.warn(`[clampProbability] Auto-normalizing ${v} from ${source} (assumed %)`);
    v = v / 100;
  }
  if (v < 0 || v > 1) {
    console.error(`[clampProbability] Out of range from ${source}: ${v}, clamping`);
    v = Math.max(0, Math.min(1, v));
  }
  return v;
}

// ─── STUCK PROBABILITY DETECTION ─────────────────────────────────
async function checkStuckProbability(assetId: string, currentProb: number) {
  try {
    const { data: recent } = await supabase
      .from("paper_decisions")
      .select("probability_pred")
      .eq("asset_id", assetId)
      .order("ts", { ascending: false })
      .limit(20);

    if (!recent || recent.length < 10) return;

    const sameCount = recent.filter(
      (r: any) => Math.abs(Number(r.probability_pred) - currentProb) < 0.001
    ).length;

    if (sameCount > recent.length * 0.8) {
      console.warn(`[STUCK_PROB] Probability appears stuck for ${assetId}: ${currentProb} (${sameCount}/${recent.length} identical)`);
    }
  } catch { /* non-critical */ }
}

// ─── EMIT DECISION (GUARANTEED) ──────────────────────────────────
async function emitDecision(
  runId: string,
  assetId: string,
  timeframe: string,
  context: {
    currentPrice: number | null;
    scenarios: any[];
    agreementScore: number;
    consensusScore: number;
    completenessScore: number;
    anomalyHalt: boolean;
    haltReason: string | null;
    evaluatedDecisions: number;
    evaluatedTrades: number;
    error: string | null;
    regime?: string;
  },
  emittedBy: string = "UNKNOWN"
) {
  const horizon = routeHorizon(timeframe, context.regime);
  const emitRunId = crypto.randomUUID();
  const emittedAt = new Date().toISOString();
  const provenance = { emitted_by: emittedBy, emit_run_id: emitRunId, emitted_at: emittedAt };

  // ── CANONICAL NORMALIZATION GATE ──────────────────────────────
  // All score inputs are normalized once here so no downstream path can write invalid values.
  context.agreementScore = clampProbability(context.agreementScore, "emitDecision/agreementScore");
  context.consensusScore = clampProbability(context.consensusScore, "emitDecision/consensusScore");
  context.completenessScore = clampProbability(context.completenessScore, "emitDecision/completenessScore");

  await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "emitDecision called", { ...context, routed_horizon: horizon, emittedBy });

  // A) If anomaly halt => PAUSED decision
  if (context.anomalyHalt) {
    const decision = await supabase.from("paper_decisions").insert({
      asset_id: assetId,
      timeframe,
      horizon,
      ref_price: context.currentPrice || 0,
      direction_pred: "NEUTRAL",
      probability_pred: 0.5,
      probability_raw: 0.5,
      probability_source: "paused_fallback",
      probability_components: { fallbackUsed: true, reason: "anomaly_halt" },
      agreement_score: 0,
      consensus_score: 0,
      completeness_score: 0,
      evidence_snapshot_json: {
        run_id: runId,
        decision_type: "PAUSED",
        blockers: [context.haltReason || "System in HALT state"],
        version_tag: VERSION_TAG,
      },
      ...provenance,
    }).select().single();

    await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "PAUSED decision written", { id: decision.data?.id });
    return { decision_type: "PAUSED", decision: decision.data };
  }

  // B) If error
  if (context.error) {
    const decision = await supabase.from("paper_decisions").insert({
      asset_id: assetId,
      timeframe,
      horizon,
      ref_price: context.currentPrice || 0,
      direction_pred: "NEUTRAL",
      probability_pred: 0.5,
      probability_raw: 0.5,
      probability_source: "error_fallback",
      probability_components: { fallbackUsed: true, reason: "error", error: context.error },
      agreement_score: 0,
      consensus_score: 0,
      completeness_score: 0,
      evidence_snapshot_json: {
        run_id: runId,
        decision_type: "ERROR",
        blockers: [context.error],
        version_tag: VERSION_TAG,
      },
      ...provenance,
    }).select().single();

    await trace(runId, assetId, timeframe, "FINALIZE", "ERROR", "ERROR decision written", { id: decision.data?.id });
    return { decision_type: "ERROR", decision: decision.data };
  }

  // C) Try to build a trade candidate from analysis data
  if (context.currentPrice && context.scenarios?.length > 0) {
    const best = context.scenarios[0];
    const evidence = best.evidence || [];
    const hasBullish = evidence.some((e: any) => e.interpretation?.toLowerCase().includes("bullish"));
    const hasBearish = evidence.some((e: any) => e.interpretation?.toLowerCase().includes("bearish"));

    // Determine direction from scenario
    let direction = "NEUTRAL";
    if (best.type === "bullish") direction = "UP";
    else if (best.type === "bearish") direction = "DOWN";

    const rawProbability = best.probability;
    const probability = clampProbability(rawProbability, "indicator-engine");
    const confidence = Math.round(probability * 100);

    // Stuck probability detection
    await checkStuckProbability(assetId, probability);

    if (confidence >= 40 && direction !== "NEUTRAL") {
      // TRADE_CANDIDATE
      const entryZone = best.entryZones?.[0];
      const stopLoss = best.stopLoss;
      const targets = best.targets || [];

      const decision = await supabase.from("paper_decisions").insert({
        asset_id: assetId,
        timeframe,
        horizon,
        ref_price: context.currentPrice,
        direction_pred: direction,
        probability_pred: probability,
        probability_raw: rawProbability,
        probability_source: "indicator-engine",
        probability_components: { bestProbRaw: rawProbability, bestProbNormalized: probability, agreementScore: context.agreementScore, consensusScore: context.consensusScore, completenessScore: context.completenessScore, evidenceCount: evidence.length, fallbackUsed: false },
        agreement_score: context.agreementScore,
        consensus_score: context.consensusScore,
        completeness_score: context.completenessScore,
        evidence_snapshot_json: {
          run_id: runId,
          decision_type: "TRADE_CANDIDATE",
          direction,
          confidence,
          entry_zone: entryZone ? { low: entryZone.priceRange?.[0], high: entryZone.priceRange?.[1] } : null,
          stop_loss: stopLoss,
          targets: targets.map((t: any) => ({ price: t.price, label: t.label })),
          rationale: `${direction} signal with ${confidence}% confidence. Agreement: ${(context.agreementScore * 100).toFixed(0)}%, Consensus: ${(context.consensusScore * 100).toFixed(0)}%.`,
          gates_snapshot: {
            agreement: context.agreementScore,
            consensus: context.consensusScore,
            completeness: context.completenessScore,
            anomaly_halt: false,
          },
          version_tag: VERSION_TAG,
        },
        ...provenance,
      }).select().single();

      // Also create a paper trade
      if (entryZone && stopLoss && decision.data) {
        const tradeDirection = direction;
        const tradeHorizon = horizon;
        const tradeDupeKey = buildDuplicateKey(assetId, tradeDirection, timeframe, tradeHorizon);

        const { data: tradeRow } = await supabase.from("paper_trades").insert({
          decision_id: decision.data.id,
          asset_id: assetId,
          timeframe,
          scenario_type: best.type || "bullish",
          regime_label: best.regime || "Unknown",
          entry_zone_low: entryZone.priceRange?.[0] || context.currentPrice * 0.99,
          entry_zone_high: entryZone.priceRange?.[1] || context.currentPrice * 1.01,
          trigger_rule: entryZone.trigger || "Price enters zone",
          stop_level: stopLoss.level || context.currentPrice * 0.95,
          stop_rule: stopLoss.condition || "Break below stop",
          targets_json: targets.map((t: any) => ({ price: t.price })),
          status: "PENDING",
          evidence_snapshot_json: { run_id: runId },
          duplicate_key: tradeDupeKey,
          initial_probability_pred: probability,
          initial_probability_source: "indicator-engine",
        }).select().single();

        // Cancel older duplicates (KEEP_NEWEST)
        if (tradeRow) {
          await cancelOlderDuplicates(tradeDupeKey, tradeRow.id);
        }
      }

      await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "TRADE_CANDIDATE decision written", { id: decision.data?.id, direction, confidence });
      return { decision_type: "TRADE_CANDIDATE", decision: decision.data };
    }
  }

  // D) NO_TRADE fallback — always emit
  const blockers: string[] = [];
  if (context.agreementScore < 0.5) blockers.push(`Low agreement score: ${(context.agreementScore * 100).toFixed(0)}%`);
  if (context.consensusScore < 0.5) blockers.push(`Low consensus score: ${(context.consensusScore * 100).toFixed(0)}%`);
  if (context.completenessScore < 0.5) blockers.push(`Low data completeness: ${(context.completenessScore * 100).toFixed(0)}%`);
  if (!context.currentPrice) blockers.push("Could not fetch current price");
  if (!context.scenarios?.length) blockers.push("No scenarios generated from analysis");
  if (blockers.length === 0) blockers.push("Insufficient signal confidence for trade entry");

  const decision = await supabase.from("paper_decisions").insert({
    asset_id: assetId,
    timeframe,
    horizon,
    ref_price: context.currentPrice || 0,
    direction_pred: "NEUTRAL",
    probability_pred: 0.3,
    probability_raw: 0.3,
    probability_source: "no_trade_fallback",
    probability_components: { fallbackUsed: true, reason: "insufficient_signal", agreementScore: context.agreementScore, consensusScore: context.consensusScore, completenessScore: context.completenessScore, blockers },
    agreement_score: context.agreementScore,
    consensus_score: context.consensusScore,
    completeness_score: context.completenessScore,
    evidence_snapshot_json: {
      run_id: runId,
      decision_type: "NO_TRADE",
      direction: "NONE",
      confidence: 30,
      rationale: `No trade: ${blockers.slice(0, 3).join(". ")}.`,
      blockers,
      gates_snapshot: {
        agreement: context.agreementScore,
        consensus: context.consensusScore,
        completeness: context.completenessScore,
        anomaly_halt: false,
      },
      version_tag: VERSION_TAG,
    },
    ...provenance,
  }).select().single();

  await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "NO_TRADE decision written", { id: decision.data?.id, blockers });
  return { decision_type: "NO_TRADE", decision: decision.data };
}

// ─── EVALUATE DECISIONS ───────────────────────────────────────────
async function evaluateDecisions(asset_id: string, horizon?: string) {
  let query = supabase
    .from("paper_decisions")
    .select("*")
    .eq("asset_id", asset_id)
    .is("evaluated_at", null)
    .order("ts", { ascending: true })
    .limit(100);

  if (horizon) query = query.eq("horizon", horizon);

  const { data: decisions, error } = await query;
  if (error) throw error;
  if (!decisions?.length) return { evaluated: 0 };

  const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
  const priceJson = await priceRes.json();
  const currentPrice = priceJson.data?.[0]?.price;
  if (!currentPrice) return { evaluated: 0, error: "Could not fetch current price" };

  const klinesRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=analysis&symbols=${asset_id}`);
  const klinesJson = await klinesRes.json();
  const atrSignal = klinesJson.data?.scenarios?.[0]?.evidence?.find((e: any) => e.signal === "ATR");
  const atrValue = atrSignal ? parseFloat(atrSignal.value.replace("$", "").replace(",", "")) : 0;
  const atrPct = atrValue / currentPrice;

  let evaluated = 0;
  const now = new Date();

  for (const d of decisions) {
    const horizonHours = parseHorizon(d.horizon);
    const decisionTime = new Date(d.ts);
    const evalTime = new Date(decisionTime.getTime() + horizonHours * 60 * 60 * 1000);
    if (now < evalTime) continue;

    const bandCfg = NEUTRAL_BAND_CONFIG[d.horizon] || NEUTRAL_BAND_CONFIG["24h"];
    const neutralBand = Math.max(bandCfg.minBand, bandCfg.atrMultiplier * atrPct);
    const movePct = (currentPrice - d.ref_price) / d.ref_price;

    let realizedDir: string;
    if (movePct > neutralBand) realizedDir = "UP";
    else if (movePct < -neutralBand) realizedDir = "DOWN";
    else realizedDir = "NEUTRAL";

    const correct = d.direction_pred === realizedDir;

    await supabase.from("paper_decisions").update({
      realized_dir: realizedDir,
      realized_move_pct: movePct * 100,
      evaluated_at: now.toISOString(),
      correct,
    }).eq("id", d.id);

    evaluated++;
  }

  const horizonsToUpdate = horizon ? [horizon] : [...new Set(decisions.map(d => d.horizon))];
  for (const h of horizonsToUpdate) {
    await updateGraduation(asset_id, decisions[0]?.timeframe || "4h", h);
  }

  return { evaluated };
}

// ─── EVALUATE TRADES ──────────────────────────────────────────────
async function evaluateTrades(asset_id: string) {
  const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
  const priceJson = await priceRes.json();
  const currentPrice = priceJson.data?.[0]?.price;
  if (!currentPrice) return { evaluated: 0 };

  const { data: pending } = await supabase
    .from("paper_trades")
    .select("*")
    .eq("asset_id", asset_id)
    .eq("status", "PENDING")
    .limit(50);

  let filled = 0, closed = 0;

  for (const t of pending || []) {
    if (currentPrice >= t.entry_zone_low && currentPrice <= t.entry_zone_high) {
      await supabase.from("paper_trades").update({
        status: "OPEN",
        fill_price: currentPrice,
        ts_opened: new Date().toISOString(),
      }).eq("id", t.id);
      filled++;
    } else if (t.time_window_end && new Date() > new Date(t.time_window_end)) {
      await supabase.from("paper_trades").update({
        status: "CLOSED",
        ts_closed: new Date().toISOString(),
        outcome_label: "EXPIRED",
        return_pct: 0,
        return_r: 0,
      }).eq("id", t.id);
      closed++;
    }
  }

  const { data: open } = await supabase
    .from("paper_trades")
    .select("*")
    .eq("asset_id", asset_id)
    .eq("status", "OPEN")
    .limit(50);

  for (const t of open || []) {
    const isBull = t.scenario_type === "bullish";
    const riskR = Math.abs(t.fill_price - t.stop_level);
    if (riskR === 0) continue;

    const currentR = isBull
      ? (currentPrice - t.fill_price) / riskR
      : (t.fill_price - currentPrice) / riskR;

    const stopped = isBull ? currentPrice <= t.stop_level : currentPrice >= t.stop_level;
    const targets = (t.targets_json || []) as { price: number }[];
    const lastTarget = targets[targets.length - 1];
    const targetHit = lastTarget && (isBull ? currentPrice >= lastTarget.price : currentPrice <= lastTarget.price);
    const expired = t.time_window_end && new Date() > new Date(t.time_window_end);

    if (stopped || targetHit || expired) {
      const returnPct = isBull
        ? ((currentPrice - t.fill_price) / t.fill_price) * 100
        : ((t.fill_price - currentPrice) / t.fill_price) * 100;

      let outcome: string;
      if (stopped) outcome = "LOSS";
      else if (targetHit) outcome = "WIN";
      else if (Math.abs(returnPct) < 0.1) outcome = "BREAKEVEN";
      else outcome = returnPct > 0 ? "WIN" : "LOSS";

      await supabase.from("paper_trades").update({
        status: "CLOSED",
        ts_closed: new Date().toISOString(),
        exit_price: currentPrice,
        outcome_label: outcome,
        return_pct: returnPct,
        return_r: currentR,
        mae_r: Math.min(0, currentR),
        mfe_r: Math.max(0, currentR),
      }).eq("id", t.id);
      closed++;
    }
  }

  if (closed > 0) await updateGraduation(asset_id);
  return { filled, closed };
}

// ─── UPDATE GRADUATION ───────────────────────────────────────────
async function updateGraduation(asset_id: string, timeframe = "4h", horizon = "24h") {
  const { count: nDecisions } = await supabase
    .from("paper_decisions")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("horizon", horizon);

  const { count: nCorrect } = await supabase
    .from("paper_decisions")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("horizon", horizon)
    .not("evaluated_at", "is", null)
    .eq("correct", true);

  const { count: nEvaluated } = await supabase
    .from("paper_decisions")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("horizon", horizon)
    .not("evaluated_at", "is", null);

  const dirAcc = (nEvaluated || 0) > 0 ? (nCorrect || 0) / (nEvaluated || 1) : 0;

  const { data: closedTrades } = await supabase
    .from("paper_trades")
    .select("return_r")
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("status", "CLOSED")
    .not("return_r", "is", null);

  const { count: nOpened } = await supabase
    .from("paper_trades")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .in("status", ["OPEN", "CLOSED"]);

  const returns = (closedTrades || []).map(t => t.return_r as number).filter(r => r !== null);
  const avgR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const medianR = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

  let level = 0;

  const isBhHorizon = LEARNING_HORIZONS.includes(horizon);
  if (isBhHorizon && horizon === "3m") {
    if (
      dirAcc >= BH_L1_FAST_GATES.minDirAcc &&
      avgR > BH_L1_FAST_GATES.minEvBh &&
      (nDecisions || 0) >= BH_L1_FAST_GATES.minDecisions
    ) {
      level = 1;
    }
  }

  for (let l = 3; l >= 1; l--) {
    const gate = GRADUATION_GATES[l as 1 | 2 | 3];
    if (
      (nDecisions || 0) >= gate.minDecisions &&
      (nOpened || 0) >= gate.minTrades &&
      dirAcc >= gate.minDirAcc &&
      avgR >= gate.minAvgR
    ) {
      level = Math.max(level, l);
      break;
    }
  }

  if (horizon === "3m" && level > 1) {
    level = 1;
  }

  await supabase.from("graduation_status").upsert({
    asset_id, timeframe, horizon,
    n_decisions: nDecisions || 0,
    n_opened_trades: nOpened || 0,
    dir_acc: dirAcc,
    avg_return_r: avgR,
    median_r: medianR,
    graduation_level: level,
    influence_mode: INFLUENCE_MODES[level],
    last_drift_check: new Date().toISOString(),
    integrity_gating_pass: dirAcc >= 0.55,
    updated_at: new Date().toISOString(),
  }, { onConflict: "asset_id,timeframe,horizon" });

  return { level, dirAcc, avgR, medianR, nDecisions, nOpened, horizon };
}

// ─── FETCH STATS ──────────────────────────────────────────────────
async function fetchStats(asset_id?: string, includeLearning = false) {
  let decisionsQuery = supabase.from("paper_decisions").select("*").order("ts", { ascending: false }).limit(200);
  let tradesQuery = supabase.from("paper_trades").select("*").order("ts_created", { ascending: false }).limit(200);
  let gradQuery = supabase.from("graduation_status").select("*");

  if (asset_id) {
    decisionsQuery = decisionsQuery.eq("asset_id", asset_id);
    tradesQuery = tradesQuery.eq("asset_id", asset_id);
    gradQuery = gradQuery.eq("asset_id", asset_id);
  }

  const [decisions, trades, graduation] = await Promise.all([
    decisionsQuery, tradesQuery, gradQuery,
  ]);

  const evaluated = (decisions.data || []).filter(d => d.evaluated_at);
  const confusionMatrix = { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };
  for (const d of evaluated) {
    if (d.direction_pred && d.realized_dir) {
      confusionMatrix[d.direction_pred as keyof typeof confusionMatrix][d.realized_dir as "UP" | "DOWN" | "NEUTRAL"]++;
    }
  }

  const closedTrades = (trades.data || []).filter(t => t.status === "CLOSED" && t.mae_r !== null);
  const maeDistribution = closedTrades.map(t => t.mae_r);

  const bhHorizonStats: Record<string, any> = {};
  for (const h of LEARNING_HORIZONS) {
    const hDecisions = (decisions.data || []).filter(d => d.horizon === h);
    const hEvaluated = hDecisions.filter(d => d.evaluated_at);
    const hCorrect = hEvaluated.filter(d => d.correct);
    const hDirAcc = hEvaluated.length > 0 ? hCorrect.length / hEvaluated.length : 0;
    const hGrad = (graduation.data || []).find(g => g.horizon === h);

    bhHorizonStats[h] = {
      totalDecisions: hDecisions.length,
      evaluatedDecisions: hEvaluated.length,
      correctDecisions: hCorrect.length,
      dirAcc: hDirAcc,
      avgReturnR: hGrad?.avg_return_r ?? 0,
      graduationLevel: hGrad?.graduation_level ?? 0,
      cadence: CADENCE_MAP[h] || "monthly",
      isLearningOnly: !PUBLIC_HORIZONS.includes(h),
      contributedToL1: h === "3m" && hGrad?.graduation_level === 1 &&
        hDirAcc >= BH_L1_FAST_GATES.minDirAcc &&
        hDecisions.length >= BH_L1_FAST_GATES.minDecisions,
    };
  }

  // Fetch latest evaluation run
  let lastRunQuery = supabase.from("evaluation_runs").select("*").order("created_at", { ascending: false }).limit(1);
  if (asset_id) lastRunQuery = lastRunQuery.eq("asset_id", asset_id);
  const { data: lastRunData } = await lastRunQuery;

  // Fetch timeframe stats for this asset
  let tfStatsQuery = supabase.from("timeframe_stats").select("*").order("success_likelihood_score", { ascending: false });
  if (asset_id) tfStatsQuery = tfStatsQuery.eq("asset_id", asset_id);
  const { data: tfStatsData } = await tfStatsQuery;

  // Get best timeframe
  const matureTfs = (tfStatsData || []).filter(t => (t.trades_n || 0) >= 30);
  const bestTf = matureTfs.length > 0 ? matureTfs[0].timeframe : null;

  return {
    decisions: decisions.data || [],
    trades: trades.data || [],
    graduation: graduation.data || [],
    confusionMatrix,
    maeDistribution,
    bhHorizonStats,
    lastRun: lastRunData?.[0] || null,
    timeframeStats: tfStatsData || [],
    bestTimeframe: bestTf,
    config: {
      publicHorizons: PUBLIC_HORIZONS,
      learningHorizons: LEARNING_HORIZONS,
      cadenceMap: CADENCE_MAP,
    },
  };
}

// ─── FULL EVALUATE PIPELINE (WITH DECISION EMISSION) ──────────────
async function runFullEvaluation(asset_id: string, timeframe: string, horizon?: string, emittedBy: string = "UNKNOWN") {
  // Cadence guard: block if too soon (except MANUAL)
  const guard = await checkCadenceGuard(emittedBy);
  if (!guard.allowed) {
    console.log(`[ATLAS] Cadence guard blocked: ${guard.reason}`);
    return {
      run_id: null,
      status: "CADENCE_BLOCKED",
      decision_type: "SKIPPED",
      reason: guard.reason,
    };
  }
  // Create evaluation run
  const { data: runRow } = await supabase.from("evaluation_runs").insert({
    asset_id,
    timeframe,
    status: "STARTED",
    progress_0_100: 0,
  }).select().single();

  const runId = runRow?.run_id || crypto.randomUUID();

  await trace(runId, asset_id, timeframe, "BOOTSTRAP", "INFO", "Evaluation started", { horizon, version: VERSION_TAG });

  let currentPrice: number | null = null;
  let scenarios: any[] = [];
  let agreementScore = 0;
  let consensusScore = 0;
  let completenessScore = 0;
  let anomalyHalt = false;
  let haltReason: string | null = null;
  let evalError: string | null = null;

  try {
    // Phase: DATA_FETCH
    await trace(runId, asset_id, timeframe, "DATA_FETCH", "INFO", "Fetching market data");
    const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
    const priceJson = await priceRes.json();
    currentPrice = priceJson.data?.[0]?.price || null;
    await trace(runId, asset_id, timeframe, "DATA_FETCH", "INFO", "Market data fetched", { price: currentPrice });

    // Phase: DATA_CLEAN - check system status
    await trace(runId, asset_id, timeframe, "DATA_CLEAN", "INFO", "Checking system status");
    const { data: sysStatus } = await supabase.from("system_status").select("*").eq("asset_id", asset_id).maybeSingle();
    if (sysStatus?.anomaly_halt) {
      anomalyHalt = true;
      haltReason = sysStatus.reason || "System in HALT state";
    }

    // Phase: INDICATORS - fetch analysis
    await trace(runId, asset_id, timeframe, "INDICATORS", "INFO", "Running analysis");
    const analysisRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=analysis&symbols=${asset_id}`);
    const analysisJson = await analysisRes.json();
    scenarios = analysisJson.data?.scenarios || [];
    await trace(runId, asset_id, timeframe, "INDICATORS", "INFO", "Analysis complete", { scenarioCount: scenarios.length });
    // Detect regime from best scenario
    const detectedRegime = scenarios[0]?.regime || undefined;

    if (scenarios.length > 0) {
      const best = scenarios[0];
      const evidenceCount = best.evidence?.length || 0;
      completenessScore = Math.min(1, evidenceCount / 8);

      // Simple agreement: how many evidence items agree with scenario direction
      const agreeCount = (best.evidence || []).filter((e: any) => {
        const interp = (e.interpretation || "").toLowerCase();
        if (best.type === "bullish") return interp.includes("bullish") || interp.includes("positive");
        if (best.type === "bearish") return interp.includes("bearish") || interp.includes("negative");
        return interp.includes("neutral");
      }).length;
      agreementScore = evidenceCount > 0 ? agreeCount / evidenceCount : 0;
      consensusScore = clampProbability(best.probability, "CONSENSUS_BUILD/best.probability");
    }
    await trace(runId, asset_id, timeframe, "CONSENSUS_BUILD", "INFO", "Consensus computed", { agreementScore, consensusScore, completenessScore });

    // Evaluate existing pending decisions
    const [decResult, tradeResult] = await Promise.all([
      evaluateDecisions(asset_id, horizon),
      evaluateTrades(asset_id),
    ]);
    await trace(runId, asset_id, timeframe, "CROSS_REFERENCE", "INFO", "Existing decisions/trades evaluated", { decisions: decResult, trades: tradeResult });

    // Phase: FINALIZE - emit guaranteed decision
    const emitResult = await emitDecision(runId, asset_id, timeframe, {
      currentPrice,
      scenarios,
      agreementScore,
      consensusScore,
      completenessScore,
      anomalyHalt,
      haltReason,
      evaluatedDecisions: decResult.evaluated,
      evaluatedTrades: (tradeResult as any).filled + (tradeResult as any).closed,
      error: null,
      regime: detectedRegime,
    }, emittedBy);

    // Update run as completed
    await supabase.from("evaluation_runs").update({
      status: "COMPLETED",
      progress_0_100: 100,
      final_phase: "FINALIZE",
      decisions_written_n: 1,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    await trace(runId, asset_id, timeframe, "FINALIZE", "INFO", "Evaluation completed", { decision_type: emitResult.decision_type });

    return {
      run_id: runId,
      status: "COMPLETED",
      decisions_written: 1,
      decision_type: emitResult.decision_type,
      decision: emitResult.decision,
      evaluated_existing: {
        decisions: decResult,
        trades: tradeResult,
      },
    };

  } catch (err) {
    evalError = (err as Error).message;
    await trace(runId, asset_id, timeframe, "FINALIZE", "ERROR", `Evaluation error: ${evalError}`);

    // Still emit an ERROR decision
    const emitResult = await emitDecision(runId, asset_id, timeframe, {
      currentPrice,
      scenarios,
      agreementScore,
      consensusScore,
      completenessScore,
      anomalyHalt,
      haltReason,
      evaluatedDecisions: 0,
      evaluatedTrades: 0,
      error: evalError,
      regime: undefined,
    }, emittedBy);

    await supabase.from("evaluation_runs").update({
      status: "ERROR",
      progress_0_100: 0,
      error_text: evalError,
      decisions_written_n: 1,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    return {
      run_id: runId,
      status: "ERROR",
      decisions_written: 1,
      decision_type: emitResult.decision_type,
      error: evalError,
    };
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────
function parseHorizon(horizon: string): number {
  const match = horizon.match(/(\d+)(h|d|m|y)/);
  if (!match) return 24;
  const [, val, unit] = match;
  const n = parseInt(val);
  if (unit === "h") return n;
  if (unit === "d") return n * 24;
  if (unit === "m") return n * 30 * 24;
  if (unit === "y") return n * 365 * 24;
  return 24;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "stats";
    const asset = url.searchParams.get("asset");
    const includeLearning = url.searchParams.get("learning") === "true";

    if (action === "stats") {
      const stats = await fetchStats(asset || undefined, includeLearning);
      return new Response(JSON.stringify({ data: stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "record-decision") {
      const body = await req.json();
      const result = await recordDecision(body);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "record-trade") {
      const body = await req.json();
      const result = await recordTrade(body);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "evaluate") {
      if (!asset) throw new Error("asset parameter required");
      const horizon = url.searchParams.get("horizon") || undefined;
      const timeframe = url.searchParams.get("timeframe") || "4h";
      const emittedBy = url.searchParams.get("emitted_by") || "UNKNOWN";
      const result = await runFullEvaluation(asset, timeframe, horizon, emittedBy);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "graduation") {
      if (!asset) throw new Error("asset parameter required");
      const horizon = url.searchParams.get("horizon") || "24h";
      const result = await updateGraduation(asset, "4h", horizon);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "last-run") {
      let query = supabase.from("evaluation_runs").select("*").order("created_at", { ascending: false }).limit(1);
      if (asset) query = query.eq("asset_id", asset);
      const { data } = await query;
      return new Response(JSON.stringify({ data: data?.[0] || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "trace") {
      const runId = url.searchParams.get("run_id");
      if (!runId) throw new Error("run_id parameter required");
      const { data } = await supabase.from("debug_trace_events").select("*").eq("run_id", runId).order("ts", { ascending: true }).limit(100);
      return new Response(JSON.stringify({ data: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Paper engine error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
