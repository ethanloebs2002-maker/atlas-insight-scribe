import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { insertWhaleContextSnapshot } from "../_shared/whale-context.ts";
import { buildAttributionPayload } from "../_shared/attribution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const VERSION_TAG = "v2.0.0";

// ─── HORIZON ROUTER ──────────────────────────────────────────────
type HorizonTF = "15m" | "30m" | "1h" | "4h" | "1d";
type Horizon = "4h" | "6h" | "12h" | "24h" | "72h";

const TF_TO_BASE_HORIZON: Record<HorizonTF, Horizon> = {
  "15m": "4h", "30m": "6h", "1h": "12h", "4h": "24h", "1d": "72h",
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
const INFLUENCE_MODES: Record<number, string> = { 0: "OFF", 1: "Calibration", 2: "Weights", 3: "Sizing" };

// ─── BUY & HOLD HORIZON CONFIGURATION ────────────────────────────
const PUBLIC_HORIZONS = ["6m", "1y", "3y", "5y"];
const LEARNING_HORIZONS = ["3m", "6m", "1y", "3y", "5y"];
const CADENCE_MAP: Record<string, string> = { "3m": "weekly", "6m": "monthly", "1y": "monthly", "3y": "monthly", "5y": "monthly" };

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
const BH_L1_FAST_GATES = { minDirAcc: 0.62, minEvBh: 0, minDecisions: 40 };

// ─── DEBUG TRACE HELPER ──────────────────────────────────────────
async function trace(runId: string, assetId: string, timeframe: string, phase: string, eventType: string, message: string, payload: any = {}) {
  try {
    await supabase.from("debug_trace_events").insert({
      run_id: runId, asset_id: assetId, timeframe, phase, event_type: eventType, message, payload_json: payload,
    });
  } catch { /* non-critical */ }
}

// ─── TIMEFRAME NORMALIZATION ─────────────────────────────────────
function normalizeTimeframeKey(input: string): string {
  const lower = input.toLowerCase();
  const map: Record<string, string> = { "1h": "1H", "60m": "1H", "4h": "4H", "240m": "4H", "1d": "1D", "24h": "1D", "1w": "1W" };
  return map[lower] || input;
}

// ─── EXCHANGE SIMULATION HELPERS ─────────────────────────────────
const TF_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "4h": 14_400_000, "8h": 28_800_000, "1d": 86_400_000,
};

async function emitEvent(runId: string | null, entityType: string, entityId: string | null, eventType: string, payload: any = {}) {
  try {
    await supabase.from("paper_engine_events").insert({
      run_id: runId, entity_type: entityType, entity_id: entityId,
      event_type: eventType, version_tag: VERSION_TAG, payload,
    });
  } catch { /* non-critical */ }
}

// ─── CONTEXT SNAPSHOT HELPERS ────────────────────────────────────
async function fireContextSnapshots(opts: {
  symbol: string; position_id?: string | null; decision_id?: string | null;
  notional_usd?: number; side?: string; includeExecCost?: boolean;
}) {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` };
  const base = { symbol: opts.symbol, position_id: opts.position_id ?? null, decision_id: opts.decision_id ?? null };
  const calls: Promise<any>[] = [
    fetch(`${supabaseUrl}/functions/v1/market-context-snap`, { method: "POST", headers, body: JSON.stringify(base) }).catch(e => console.warn("[ctx-snap] market failed:", e.message)),
    fetch(`${supabaseUrl}/functions/v1/derivatives-context-snap`, { method: "POST", headers, body: JSON.stringify(base) }).catch(e => console.warn("[ctx-snap] deriv failed:", e.message)),
  ];
  if (opts.includeExecCost) {
    calls.push(
      fetch(`${supabaseUrl}/functions/v1/execution-cost-snap`, { method: "POST", headers, body: JSON.stringify({ ...base, notional_usd: opts.notional_usd ?? 50000, side: opts.side ?? "BUY" }) }).catch(e => console.warn("[ctx-snap] exec-cost failed:", e.message)),
    );
  }
  await Promise.allSettled(calls);
}

async function getActivePolicy(): Promise<any> {
  const { data } = await supabase.from("paper_policy").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

function getExpiryMinutes(policy: any, timeframe: string): number {
  const map = policy?.expiry_minutes_by_tf || {};
  return map[timeframe] || 4320;
}

async function getExposure(): Promise<{ open: number; pending: number }> {
  const { data } = await supabase.from("paper_positions").select("status").in("status", ["OPEN", "PENDING_ENTRY"]);
  const items = data || [];
  return {
    open: items.filter((p: any) => p.status === "OPEN").length,
    pending: items.filter((p: any) => p.status === "PENDING_ENTRY").length,
  };
}

// ─── RECORD DECISION ──────────────────────────────────────────────
async function recordDecision(body: any) {
  const { asset_id, timeframe, horizon, ref_price, direction_pred, probability_pred, agreement_score, consensus_score, completeness_score, evidence_snapshot_json } = body;
  const { data, error } = await supabase.from("paper_decisions").insert({
    asset_id, timeframe: timeframe || "4h", horizon: horizon || routeHorizon(timeframe || "4h"),
    ref_price, direction_pred, probability_pred,
    agreement_score: agreement_score || 0, consensus_score: consensus_score || 0, completeness_score: completeness_score || 0,
    evidence_snapshot_json, version_tag: VERSION_TAG,
  }).select().single();
  if (error) throw error;
  return data;
}

// ─── CADENCE GUARD ───────────────────────────────────────────────
async function checkCadenceGuard(emittedBy: string): Promise<{ allowed: boolean; reason?: string }> {
  if (emittedBy === "MANUAL_EVALUATE") return { allowed: true };
  const { data: settings } = await supabase.from("atlas_settings").select("*").eq("id", "global").maybeSingle();
  if (!settings) return { allowed: true };
  const cadenceMs = settings.eval_cadence_ms || 3600000;
  const lastAt = settings.last_auto_eval_at;
  if (lastAt) {
    const elapsed = Date.now() - new Date(lastAt).getTime();
    if (elapsed < cadenceMs) return { allowed: false, reason: `Cadence guard: ${elapsed}ms < ${cadenceMs}ms` };
  }
  await supabase.from("atlas_settings").update({ last_auto_eval_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", "global");
  return { allowed: true };
}

// ─── PROBABILITY CLAMPING ────────────────────────────────────────
function clampProbability(raw: unknown, source: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw as number)) { console.warn(`[clampProbability] Non-finite from ${source}`); return 0.5; }
  let v = raw as number;
  if (v > 1 && v <= 100) { console.warn(`[clampProbability] Auto-normalizing ${v} from ${source}`); v = v / 100; }
  if (v < 0 || v > 1) { console.error(`[clampProbability] Out of range from ${source}: ${v}`); v = Math.max(0, Math.min(1, v)); }
  return v;
}

// ─── STUCK PROBABILITY DETECTION ─────────────────────────────────
async function checkStuckProbability(assetId: string, currentProb: number) {
  try {
    const { data: recent } = await supabase.from("paper_decisions").select("probability_pred").eq("asset_id", assetId).order("ts", { ascending: false }).limit(20);
    if (!recent || recent.length < 10) return;
    const sameCount = recent.filter((r: any) => Math.abs(Number(r.probability_pred) - currentProb) < 0.001).length;
    if (sameCount > recent.length * 0.8) console.warn(`[STUCK_PROB] ${assetId}: ${currentProb} (${sameCount}/${recent.length} identical)`);
  } catch { /* non-critical */ }
}

// ─── DUPLICATE POSITION HANDLING ─────────────────────────────────
function buildDuplicateKey(symbol: string, side: string, timeframe: string, horizon: string): string {
  return `${symbol}|${side}|${timeframe}|${horizon}`;
}

async function cancelDuplicatePositions(duplicateKey: string, keepId?: string) {
  const { data: dupes } = await supabase.from("paper_positions").select("id")
    .eq("duplicate_key", duplicateKey).in("status", ["PENDING_ENTRY", "OPEN"]).order("created_at", { ascending: false });
  if (!dupes?.length) return 0;
  const idsToCancel = dupes.filter((d: any) => d.id !== keepId).map((d: any) => d.id);
  if (idsToCancel.length === 0) return 0;
  for (const id of idsToCancel) {
    await supabase.from("paper_positions").update({ status: "CANCELED", close_reason: "CANCELED", closed_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("paper_orders").update({ status: "CANCELED" }).eq("position_id", id).in("status", ["NEW", "PARTIAL"]);
    await emitEvent(null, "POSITION", id, "POSITION_CANCELED", { reason: "duplicate_replaced" });
  }
  return idsToCancel.length;
}

// ─── EMIT DECISION (GUARANTEED) ──────────────────────────────────
async function emitDecision(
  runId: string, assetId: string, timeframe: string,
  context: { currentPrice: number | null; scenarios: any[]; agreementScore: number; consensusScore: number; completenessScore: number; anomalyHalt: boolean; haltReason: string | null; evaluatedDecisions: number; evaluatedTrades: number; error: string | null; regime?: string; },
  emittedBy: string = "UNKNOWN"
) {
  const horizon = routeHorizon(timeframe, context.regime);
  const emitRunId = crypto.randomUUID();
  const emittedAt = new Date().toISOString();
  const provenance = { emitted_by: emittedBy, emit_run_id: emitRunId, emitted_at: emittedAt };

  context.agreementScore = clampProbability(context.agreementScore, "emitDecision/agreementScore");
  context.consensusScore = clampProbability(context.consensusScore, "emitDecision/consensusScore");
  context.completenessScore = clampProbability(context.completenessScore, "emitDecision/completenessScore");

  await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "emitDecision called", { ...context, routed_horizon: horizon, emittedBy });

  // A) PAUSED
  if (context.anomalyHalt) {
    const decision = await supabase.from("paper_decisions").insert({
      asset_id: assetId, timeframe, horizon, ref_price: context.currentPrice || 0,
      direction_pred: "NEUTRAL", probability_pred: 0.5, probability_raw: 0.5,
      probability_source: "paused_fallback", probability_components: { fallbackUsed: true, reason: "anomaly_halt" },
      agreement_score: 0, consensus_score: 0, completeness_score: 0,
      evidence_snapshot_json: { run_id: runId, decision_type: "PAUSED", blockers: [context.haltReason || "System in HALT state"], version_tag: VERSION_TAG },
      decision_type: "PAUSED", version_tag: VERSION_TAG, ...provenance,
    }).select().single();
    await emitEvent(runId, "DECISION", decision.data?.id, "DECISION_EMITTED", { type: "PAUSED" });
    if (decision.data?.id) insertWhaleContextSnapshot({ symbol: assetId, snapshotTimeIso: emittedAt, decisionId: decision.data.id }).catch(e => console.warn("[whale-context] PAUSED snapshot failed:", e.message));
    return { decision_type: "PAUSED", decision: decision.data };
  }

  // B) ERROR
  if (context.error) {
    const decision = await supabase.from("paper_decisions").insert({
      asset_id: assetId, timeframe, horizon, ref_price: context.currentPrice || 0,
      direction_pred: "NEUTRAL", probability_pred: 0.5, probability_raw: 0.5,
      probability_source: "error_fallback", probability_components: { fallbackUsed: true, reason: "error", error: context.error },
      agreement_score: 0, consensus_score: 0, completeness_score: 0,
      evidence_snapshot_json: { run_id: runId, decision_type: "ERROR", blockers: [context.error], version_tag: VERSION_TAG },
      decision_type: "ERROR", version_tag: VERSION_TAG, ...provenance,
    }).select().single();
    await emitEvent(runId, "DECISION", decision.data?.id, "DECISION_EMITTED", { type: "ERROR" });
    if (decision.data?.id) insertWhaleContextSnapshot({ symbol: assetId, snapshotTimeIso: emittedAt, decisionId: decision.data.id }).catch(e => console.warn("[whale-context] ERROR snapshot failed:", e.message));
    return { decision_type: "ERROR", decision: decision.data };
  }

  // C) TRADE_CANDIDATE — with Scenario 1 consensus authority
  if (context.currentPrice && context.scenarios?.length > 0) {
    const best = context.scenarios[0];
    const evidence = best.evidence || [];
    let direction = "NEUTRAL";
    if (best.type === "bullish") direction = "UP";
    else if (best.type === "bearish") direction = "DOWN";

    const rawProbability = best.probability;
    const probability = clampProbability(rawProbability, "indicator-engine");
    const confidence = Math.round(probability * 100);
    await checkStuckProbability(assetId, probability);

    // ── Scenario 1 Authority ──────────────────────────────────────
    // When probability is fallback-level, use consensus_score as the
    // effective probability for gating decisions into execution.
    const isFallback = probability <= 0.31 || confidence < 40;
    const consensusAuthority = context.consensusScore >= 0.4;
    const policyProbability = isFallback && consensusAuthority
      ? context.consensusScore
      : probability;
    const scenarioBias = best.type || "neutral";
    const scenarioConfidence = policyProbability;

    // Accept if: original confidence >= 40, OR consensus authority applies with a direction
    const tradable = (confidence >= 40 || (isFallback && consensusAuthority)) && direction !== "NEUTRAL";

    if (tradable) {
      // ── Synthetic entry/sl/tp when indicator doesn't provide them ──
      let entryZone = best.entryZones?.[0];
      let stopLoss = best.stopLoss;
      let targets = best.targets || [];
      const syntheticLevels = !entryZone || !stopLoss;

      if (!entryZone) {
        const offset = context.currentPrice * 0.005; // 0.5% entry zone
        entryZone = {
          priceRange: direction === "UP"
            ? [context.currentPrice * 0.998, context.currentPrice * 1.003]
            : [context.currentPrice * 0.997, context.currentPrice * 1.002],
        };
      }
      if (!stopLoss) {
        const riskPct = 0.025; // 2.5% risk
        stopLoss = {
          level: direction === "UP"
            ? context.currentPrice * (1 - riskPct)
            : context.currentPrice * (1 + riskPct),
        };
      }
      if (!targets.length) {
        const rewardPct = 0.04; // 4% reward (~1.6 R:R)
        targets = [{
          price: direction === "UP"
            ? context.currentPrice * (1 + rewardPct)
            : context.currentPrice * (1 - rewardPct),
          label: "T1-synthetic",
        }];
      }

      const decision = await supabase.from("paper_decisions").insert({
        asset_id: assetId, timeframe, horizon, ref_price: context.currentPrice,
        direction_pred: direction, probability_pred: probability, probability_raw: rawProbability,
        probability_source: isFallback ? "consensus_authority" : "indicator-engine",
        probability_components: {
          bestProbRaw: rawProbability, bestProbNormalized: probability,
          policyProbability, scenarioBias, scenarioConfidence,
          agreementScore: context.agreementScore, consensusScore: context.consensusScore,
          completenessScore: context.completenessScore, evidenceCount: evidence.length,
          fallbackUsed: isFallback, consensusAuthorityUsed: isFallback && consensusAuthority,
          syntheticLevels,
          source_agreement: context.agreementScore,
          signal_agreement: context.consensusScore,
          structure_agreement: context.completenessScore,
          data_completeness: context.completenessScore,
        },
        agreement_score: context.agreementScore, consensus_score: context.consensusScore, completeness_score: context.completenessScore,
        entry_price: (entryZone.priceRange[0] + entryZone.priceRange[1]) / 2,
        stop_loss: stopLoss.level,
        take_profit: targets[targets.length - 1]?.price,
        evidence_snapshot_json: {
          run_id: runId, decision_type: "TRADE_CANDIDATE", direction, confidence,
          entry_zone: entryZone ? { low: entryZone.priceRange?.[0], high: entryZone.priceRange?.[1] } : null,
          stop_loss: stopLoss, targets: targets.map((t: any) => ({ price: t.price, label: t.label })),
          rationale: isFallback
            ? `${direction} signal via consensus authority (consensus=${(context.consensusScore * 100).toFixed(0)}%, prob=${confidence}%).`
            : `${direction} signal with ${confidence}% confidence.`,
          gates_snapshot: { agreement: context.agreementScore, consensus: context.consensusScore, completeness: context.completenessScore, anomaly_halt: false, policyProbability, consensusAuthorityUsed: isFallback && consensusAuthority },
          version_tag: VERSION_TAG,
        },
        decision_type: "TRADE_CANDIDATE", version_tag: VERSION_TAG, ...provenance,
      }).select().single();

      await emitEvent(runId, "DECISION", decision.data?.id, "DECISION_EMITTED", { type: "TRADE_CANDIDATE", direction, probability, policyProbability, consensusAuthorityUsed: isFallback && consensusAuthority });

      // ── Hook A: Context snapshots on decision emission ──
      if (decision.data?.id) {
        fireContextSnapshots({ symbol: assetId, decision_id: decision.data.id }).catch(e => console.warn("[ctx-snap] decision hook failed:", e.message));
      }

      // ── CREATE POSITION + ENTRY ORDER (uses policyProbability for gating) ──
      if (decision.data) {
        const policy = await getActivePolicy();
        const side = direction === "UP" ? "LONG" : "SHORT";
        const rejectionReasons: string[] = [];

        // ── Market-context entry clamping ──────────────────────────
        let entryPrice = (entryZone.priceRange[0] + entryZone.priceRange[1]) / 2;
        {
          const { data: mktSnap } = await supabase
            .from("market_context_snapshots")
            .select("mid_price, vol_regime, spread_bps")
            .eq("symbol", assetId)
            .order("snapshot_time", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!mktSnap?.mid_price) {
            rejectionReasons.push("NO_MARKET_CONTEXT");
          } else {
            const mid = Number(mktSnap.mid_price);
            const volRegime = mktSnap.vol_regime as string | null;
            const spreadBps = Number(mktSnap.spread_bps ?? 0) / 10_000; // spread_bps → fraction

            const maxDistPct =
              volRegime === "compression" ? 0.003 :
              volRegime === "normal"      ? 0.0045 :
                                            0.0015;
            const minDistPct = Math.max(maxDistPct, 2 * spreadBps);

            if (side === "LONG") {
              const floor = mid * (1 - minDistPct);
              if (entryPrice < floor) {
                await trace(runId, assetId, timeframe, "ENTRY_CLAMP", "INFO",
                  `LONG entry clamped from ${entryPrice.toFixed(4)} to ${floor.toFixed(4)}`,
                  { mid, volRegime, spreadBps, minDistPct, originalEntry: entryPrice });
                entryPrice = floor;
              }
            } else {
              const ceiling = mid * (1 + minDistPct);
              if (entryPrice > ceiling) {
                await trace(runId, assetId, timeframe, "ENTRY_CLAMP", "INFO",
                  `SHORT entry clamped from ${entryPrice.toFixed(4)} to ${ceiling.toFixed(4)}`,
                  { mid, volRegime, spreadBps, minDistPct, originalEntry: entryPrice });
                entryPrice = ceiling;
              }
            }

            // Propagate clamped entry back to entryZone
            const halfSpread = Math.abs(entryZone.priceRange[1] - entryZone.priceRange[0]) / 2;
            entryZone.priceRange = [entryPrice - halfSpread, entryPrice + halfSpread];
          }
        }

        if (policy) {
          if (policyProbability < (policy.min_prob || 0.35)) rejectionReasons.push(`policy_prob ${policyProbability.toFixed(3)} < min_prob ${policy.min_prob}`);
          if (!policy.allow_shorts && side === "SHORT") rejectionReasons.push("shorts disabled by policy");
          const exposure = await getExposure();
          if (exposure.open >= (policy.max_open || 10)) rejectionReasons.push(`max_open reached: ${exposure.open}`);
          if (exposure.pending >= (policy.max_pending || 20)) rejectionReasons.push(`max_pending reached: ${exposure.pending}`);

          const stopLevel = stopLoss.level;
          const tpLevel = targets[targets.length - 1]?.price;
          const riskDist = Math.abs(entryPrice - stopLevel);
          const rewardDist = Math.abs(tpLevel - entryPrice);
          const rr = riskDist > 0 ? rewardDist / riskDist : 0;
          if (rr < (policy.min_rr || 1.2)) rejectionReasons.push(`R:R ${rr.toFixed(2)} < min_rr ${policy.min_rr}`);

          // EV check using policyProbability
          if (policy.require_ev_positive) {
            const ev = policyProbability * rr - (1 - policyProbability);
            if (ev <= 0) rejectionReasons.push(`EV ${ev.toFixed(3)} <= 0 (policy_prob=${policyProbability.toFixed(3)}, rr=${rr.toFixed(2)})`);
          }
        }

        if (rejectionReasons.length > 0) {
          await supabase.from("paper_decisions").update({
            engine_status: "REJECTED",
            probability_components: {
              ...(decision.data.probability_components as any || {}),
              rejection_reasons: rejectionReasons,
              gate_values: { policyProbability, min_prob: policy?.min_prob, min_rr: policy?.min_rr },
            },
          }).eq("id", decision.data.id);
          await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "Position blocked by policy", { rejectionReasons, policyProbability });
          await emitEvent(runId, "ENGINE", null, "POSITION_BLOCKED", { decision_id: decision.data.id, blockers: rejectionReasons, policyProbability });
        } else {
          // APPROVED — create position + entry order; persist clamped entry on decision
          await supabase.from("paper_decisions").update({
            engine_status: "APPROVED",
            entry_price: entryPrice,
          }).eq("id", decision.data.id);

          const entryLow = entryZone.priceRange[0];
          const entryHigh = entryZone.priceRange[1];
          const limitPrice = side === "LONG" ? entryHigh : entryLow;
          const stopLevel = stopLoss.level;
          const tpLevel = targets[targets.length - 1]?.price;
          const duplicateKey = buildDuplicateKey(assetId, side, timeframe, horizon);
          const expiryMinutes = getExpiryMinutes(policy, timeframe);
          const latencyMs = policy?.latency_ms || 250;

          const { data: position } = await supabase.from("paper_positions").insert({
            run_id: runId, policy_id: policy?.id, decision_id: decision.data.id,
            symbol: assetId, side, timeframe, horizon, status: "PENDING_ENTRY", qty: 1,
            stop_price: stopLevel, tp_price: tpLevel,
            initial_probability_pred: policyProbability, initial_probability_source: isFallback ? "consensus_authority" : "indicator-engine",
            regime_label: best.regime || "Unknown", duplicate_key: duplicateKey,
            expires_at: new Date(Date.now() + expiryMinutes * 60_000).toISOString(),
            meta: { run_id: runId, entry_zone: { low: entryLow, high: entryHigh }, consensusAuthorityUsed: isFallback && consensusAuthority, syntheticLevels },
          }).select().single();

          if (position) {
            const { data: entryOrder } = await supabase.from("paper_orders").insert({
              run_id: runId, policy_id: policy?.id, symbol: assetId, side,
              order_type: "LIMIT", qty: 1, limit_price: limitPrice, status: "NEW",
              eligible_fill_at: new Date(Date.now() + latencyMs).toISOString(),
              position_id: position.id, meta: { decision_id: decision.data.id },
            }).select().single();

            if (entryOrder) {
              await supabase.from("paper_positions").update({ entry_order_id: entryOrder.id }).eq("id", position.id);
            }
            await cancelDuplicatePositions(duplicateKey, position.id);
            await supabase.from("paper_decisions").update({ engine_status: "EXECUTING" }).eq("id", decision.data.id);
            await emitEvent(runId, "POSITION", position.id, "POSITION_CREATED", { symbol: assetId, side, policyProbability, consensusAuthorityUsed: isFallback && consensusAuthority });
            if (entryOrder) await emitEvent(runId, "ORDER", entryOrder.id, "ORDER_PLACED", { type: "ENTRY", limit_price: limitPrice });

            // ── Hook: Populate trade_scenario_attribution ──
            try {
              const attributionScenarios = buildAttributionPayload(context.scenarios ?? []);
              const scenarioRows = attributionScenarios.map((s) => ({
                position_id: position.id,
                decision_id: decision.data!.id,
                symbol: assetId,
                timeframe,
                scenario_key: s.scenario_key,
                contributed_direction: s.contributed_direction ?? "NEUTRAL",
                contributed_confidence: s.contributed_confidence != null ? clampProbability(s.contributed_confidence, "scenario_attribution") : null,
                regime: best.regime || null,
                metadata: { horizon, run_id: runId, ...(s.metadata ?? {}) },
              }));
              if (scenarioRows.length > 0) {
                await supabase.from("trade_scenario_attribution").upsert(scenarioRows, { onConflict: "position_id,scenario_key" });
              }
              // Persist attribution on decision metadata
              await supabase.from("paper_decisions").update({
                probability_components: {
                  ...(decision.data!.probability_components as any ?? {}),
                  attribution_scenarios: attributionScenarios,
                  attribution_version: "v3.0",
                },
              }).eq("id", decision.data!.id);
            } catch (e) { console.warn("[scenario-attribution] insert failed:", (e as Error).message); }
          }
        }
      }

      await trace(runId, assetId, timeframe, "FINALIZE", "INFO", "TRADE_CANDIDATE written", { id: decision.data?.id, direction, confidence, policyProbability, consensusAuthorityUsed: isFallback && consensusAuthority });
      if (decision.data?.id) insertWhaleContextSnapshot({ symbol: assetId, snapshotTimeIso: emittedAt, decisionId: decision.data.id }).catch(e => console.warn("[whale-context] TRADE_CANDIDATE snapshot failed:", e.message));
      return { decision_type: "TRADE_CANDIDATE", decision: decision.data };
    }
  }

  // D) NO_TRADE fallback — only when consensus authority also insufficient
  const blockers: string[] = [];
  if (context.agreementScore < 0.5) blockers.push(`Low agreement: ${(context.agreementScore * 100).toFixed(0)}%`);
  if (context.consensusScore < 0.4) blockers.push(`Low consensus: ${(context.consensusScore * 100).toFixed(0)}%`);
  if (context.completenessScore < 0.5) blockers.push(`Low completeness: ${(context.completenessScore * 100).toFixed(0)}%`);
  if (!context.currentPrice) blockers.push("No current price");
  if (!context.scenarios?.length) blockers.push("No scenarios");
  const bestScenario = context.scenarios?.[0];
  const noDirection = !bestScenario || (bestScenario.type !== "bullish" && bestScenario.type !== "bearish");
  if (noDirection) blockers.push("No directional bias in scenarios");
  if (blockers.length === 0) blockers.push("Insufficient signal confidence");

  const decision = await supabase.from("paper_decisions").insert({
    asset_id: assetId, timeframe, horizon, ref_price: context.currentPrice || 0,
    direction_pred: "NEUTRAL", probability_pred: 0.3, probability_raw: 0.3,
    probability_source: "no_trade_fallback",
    probability_components: { fallbackUsed: true, reason: "insufficient_signal", blockers, consensusScore: context.consensusScore, agreementScore: context.agreementScore },
    agreement_score: context.agreementScore, consensus_score: context.consensusScore, completeness_score: context.completenessScore,
    evidence_snapshot_json: { run_id: runId, decision_type: "NO_TRADE", blockers, version_tag: VERSION_TAG },
    decision_type: "NO_TRADE", version_tag: VERSION_TAG, ...provenance,
  }).select().single();

  await emitEvent(runId, "DECISION", decision.data?.id, "DECISION_EMITTED", { type: "NO_TRADE", blockers });
  if (decision.data?.id) insertWhaleContextSnapshot({ symbol: assetId, snapshotTimeIso: emittedAt, decisionId: decision.data.id }).catch(e => console.warn("[whale-context] NO_TRADE snapshot failed:", e.message));
  return { decision_type: "NO_TRADE", decision: decision.data };
}

// ─── PROCESS EXECUTION (EXCHANGE SIMULATOR) ──────────────────────
async function processExecution(assetId: string) {
  const policy = await getActivePolicy();
  const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${assetId}`);
  const priceJson = await priceRes.json();
  const currentPrice = priceJson.data?.[0]?.price;
  if (!currentPrice) return { filled: 0, closed: 0, expired: 0 };

  const now = new Date();
  const feeBps = policy?.fee_bps || 6;
  const slippageBps = policy?.slippage_bps || 4;
  const worstCase = policy?.worst_case_same_candle ?? true;
  let filled = 0, closed = 0, expired = 0;

  // ── 1) Process PENDING_ENTRY positions ──────────────────────
  const { data: pendingPositions } = await supabase.from("paper_positions").select("*")
    .eq("symbol", assetId).eq("status", "PENDING_ENTRY").limit(50);

  for (const pos of pendingPositions || []) {
    // Check expiry
    if (pos.expires_at && now > new Date(pos.expires_at)) {
      await supabase.from("paper_positions").update({ status: "EXPIRED", close_reason: "EXPIRY", closed_at: now.toISOString() }).eq("id", pos.id);
      if (pos.entry_order_id) await supabase.from("paper_orders").update({ status: "EXPIRED" }).eq("id", pos.entry_order_id);
      await emitEvent(pos.run_id, "POSITION", pos.id, "POSITION_EXPIRED", { reason: "entry_window" });
      expired++;
      continue;
    }

    if (!pos.entry_order_id) continue;
    const { data: entryOrder } = await supabase.from("paper_orders").select("*").eq("id", pos.entry_order_id).single();
    if (!entryOrder || entryOrder.status !== "NEW") continue;
    if (now < new Date(entryOrder.eligible_fill_at)) continue;

    const isLong = pos.side === "LONG";
    const fillable = isLong ? currentPrice <= entryOrder.limit_price : currentPrice >= entryOrder.limit_price;
    if (!fillable) continue;

    // Simulate fill with slippage + fees
    const slippage = currentPrice * slippageBps / 10000;
    const effectivePrice = isLong ? currentPrice + slippage : currentPrice - slippage;
    const fee = effectivePrice * feeBps / 10000;

    await supabase.from("paper_fills").insert({
      order_id: entryOrder.id, position_id: pos.id, filled_qty: 1,
      fill_price: effectivePrice, fee_paid: fee, slippage_paid: slippage,
    });
    await supabase.from("paper_orders").update({ status: "FILLED", filled_qty: 1, avg_fill_price: effectivePrice }).eq("id", entryOrder.id);

    // eligible_close_at = next candle boundary (no same-candle close)
    const tfMs = TF_MS[pos.timeframe] || TF_MS["4h"];
    const eligibleCloseAt = new Date(now.getTime() + tfMs);

    // Create OCO bracket (TP + SL)
    const ocoGroupId = crypto.randomUUID();
    const { data: tpOrder } = await supabase.from("paper_orders").insert({
      run_id: pos.run_id, policy_id: pos.policy_id, symbol: pos.symbol, side: pos.side,
      order_type: "TAKE_PROFIT", qty: 1, limit_price: pos.tp_price, status: "NEW",
      oco_group_id: ocoGroupId, reduce_only: true, position_id: pos.id,
    }).select().single();
    const { data: slOrder } = await supabase.from("paper_orders").insert({
      run_id: pos.run_id, policy_id: pos.policy_id, symbol: pos.symbol, side: pos.side,
      order_type: "STOP_LOSS", qty: 1, stop_price: pos.stop_price, status: "NEW",
      oco_group_id: ocoGroupId, reduce_only: true, position_id: pos.id,
    }).select().single();

    // Update position to OPEN
    await supabase.from("paper_positions").update({
      status: "OPEN", entry_price: effectivePrice, filled_at: now.toISOString(),
      eligible_close_at: eligibleCloseAt.toISOString(),
      tp_order_id: tpOrder?.id, sl_order_id: slOrder?.id,
    }).eq("id", pos.id);

    filled++;
    await emitEvent(pos.run_id, "ORDER", entryOrder.id, "ORDER_FILLED", { price: effectivePrice, fee, slippage });
    await emitEvent(pos.run_id, "POSITION", pos.id, "POSITION_OPENED", { entry_price: effectivePrice, eligible_close_at: eligibleCloseAt.toISOString() });

    // ── Hook B: Context snapshots on position fill ──
    fireContextSnapshots({
      symbol: pos.symbol, position_id: pos.id, decision_id: pos.decision_id,
      notional_usd: effectivePrice * (pos.qty || 1), side: pos.side === "LONG" ? "BUY" : "SELL",
      includeExecCost: true,
    }).catch(e => console.warn("[ctx-snap] fill hook failed:", e.message));

    if (tpOrder) await emitEvent(pos.run_id, "ORDER", tpOrder.id, "TP_PLACED", { price: pos.tp_price });
    if (slOrder) await emitEvent(pos.run_id, "ORDER", slOrder.id, "SL_PLACED", { price: pos.stop_price });
  }

  // ── 2) Process OPEN positions (TP/SL/EXPIRY) ───────────────
  const { data: openPositions } = await supabase.from("paper_positions").select("*")
    .eq("symbol", assetId).eq("status", "OPEN").limit(50);

  for (const pos of openPositions || []) {
    // Enforce eligible_close_at (no same-candle close)
    if (pos.eligible_close_at && now < new Date(pos.eligible_close_at)) continue;

    const isLong = pos.side === "LONG";
    const riskR = Math.abs(pos.entry_price - pos.stop_price);
    if (riskR === 0) continue;

    const stopped = isLong ? currentPrice <= pos.stop_price : currentPrice >= pos.stop_price;
    const tpHit = pos.tp_price && (isLong ? currentPrice >= pos.tp_price : currentPrice <= pos.tp_price);
    const expiredPos = pos.expires_at && now > new Date(pos.expires_at);

    if (!stopped && !tpHit && !expiredPos) continue;

    // Determine close reason (worst-case for same-candle TP+SL)
    let closeReason: string;
    let exitPrice: number;
    if (stopped && tpHit) {
      closeReason = worstCase ? "SL" : "TP";
      exitPrice = worstCase ? pos.stop_price : pos.tp_price;
    } else if (stopped) {
      closeReason = "SL"; exitPrice = pos.stop_price;
    } else if (tpHit) {
      closeReason = "TP"; exitPrice = pos.tp_price;
    } else {
      closeReason = "EXPIRY"; exitPrice = currentPrice;
    }

    // Apply exit slippage + fees
    const exitSlippage = exitPrice * slippageBps / 10000;
    const effectiveExit = isLong ? exitPrice - exitSlippage : exitPrice + exitSlippage;
    const exitFee = effectiveExit * feeBps / 10000;

    // Side-aware P&L
    const pnl = isLong
      ? (effectiveExit - pos.entry_price) - exitFee
      : (pos.entry_price - effectiveExit) - exitFee;
    const pnlPct = isLong
      ? ((effectiveExit - pos.entry_price) / pos.entry_price) * 100
      : ((pos.entry_price - effectiveExit) / pos.entry_price) * 100;
    const realizedR = isLong
      ? (effectiveExit - pos.entry_price) / riskR
      : (pos.entry_price - effectiveExit) / riskR;

    let outcome: string;
    if (closeReason === "SL") outcome = "LOSS";
    else if (closeReason === "TP") outcome = "WIN";
    else outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";

    // Create exit fill for the triggered order
    const exitOrderId = closeReason === "TP" ? pos.tp_order_id : closeReason === "SL" ? pos.sl_order_id : null;
    if (exitOrderId) {
      await supabase.from("paper_fills").insert({
        order_id: exitOrderId, position_id: pos.id, filled_qty: 1,
        fill_price: effectiveExit, fee_paid: exitFee, slippage_paid: exitSlippage,
      });
      await supabase.from("paper_orders").update({ status: "FILLED", filled_qty: 1, avg_fill_price: effectiveExit }).eq("id", exitOrderId);
    }

    // Cancel OCO counterpart
    const cancelId = closeReason === "TP" ? pos.sl_order_id : closeReason === "SL" ? pos.tp_order_id : null;
    if (cancelId) {
      await supabase.from("paper_orders").update({ status: "CANCELED" }).eq("id", cancelId);
      await emitEvent(pos.run_id, "ORDER", cancelId, "ORDER_CANCELED", { reason: "oco_counterpart" });
    }
    if (closeReason === "EXPIRY") {
      if (pos.tp_order_id) await supabase.from("paper_orders").update({ status: "CANCELED" }).eq("id", pos.tp_order_id);
      if (pos.sl_order_id) await supabase.from("paper_orders").update({ status: "CANCELED" }).eq("id", pos.sl_order_id);
    }

    // Close position
    await supabase.from("paper_positions").update({
      status: "CLOSED", close_reason: closeReason, exit_price: effectiveExit,
      closed_at: now.toISOString(), realized_pnl: pnl, realized_r: realizedR,
      realized_pct: pnlPct, outcome_label: outcome,
    }).eq("id", pos.id);

    closed++;
    await emitEvent(pos.run_id, "POSITION", pos.id, "POSITION_CLOSED", {
      close_reason: closeReason, exit_price: effectiveExit, realized_pnl: pnl, realized_r: realizedR, outcome,
    });
  }

  // Diagnostics event
  const exposure = await getExposure();
  await emitEvent(null, "ENGINE", null, "ENGINE_TICK", {
    asset: assetId, filled, closed, expired,
    open_positions: exposure.open, pending_positions: exposure.pending,
  });

  if (closed > 0) await updateGraduation(assetId);
  return { filled, closed, expired };
}

// ─── EVALUATE DECISIONS ───────────────────────────────────────────
async function evaluateDecisions(asset_id: string, horizon?: string) {
  let query = supabase.from("paper_decisions").select("*").eq("asset_id", asset_id)
    .is("evaluated_at", null).order("ts", { ascending: true }).limit(100);
  if (horizon) query = query.eq("horizon", horizon);
  const { data: decisions, error } = await query;
  if (error) throw error;
  if (!decisions?.length) return { evaluated: 0 };

  const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
  const priceJson = await priceRes.json();
  const currentPrice = priceJson.data?.[0]?.price;
  if (!currentPrice) return { evaluated: 0, error: "No current price" };

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
      realized_dir: realizedDir, realized_move_pct: movePct * 100,
      evaluated_at: now.toISOString(), correct,
    }).eq("id", d.id);
    evaluated++;
  }

  const horizonsToUpdate = horizon ? [horizon] : [...new Set(decisions.map(d => d.horizon))];
  for (const h of horizonsToUpdate) {
    await updateGraduation(asset_id, decisions[0]?.timeframe || "4h", h);
  }
  return { evaluated };
}

// ─── UPDATE GRADUATION ───────────────────────────────────────────
// Queries paper_trades VIEW (which bridges legacy + new positions)
async function updateGraduation(asset_id: string, timeframe = "4h", horizon = "24h") {
  const { count: nDecisions } = await supabase.from("paper_decisions").select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id).eq("timeframe", timeframe).eq("horizon", horizon);
  const { count: nCorrect } = await supabase.from("paper_decisions").select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id).eq("timeframe", timeframe).eq("horizon", horizon).not("evaluated_at", "is", null).eq("correct", true);
  const { count: nEvaluated } = await supabase.from("paper_decisions").select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id).eq("timeframe", timeframe).eq("horizon", horizon).not("evaluated_at", "is", null);

  const dirAcc = (nEvaluated || 0) > 0 ? (nCorrect || 0) / (nEvaluated || 1) : 0;

  // Query paper_trades VIEW for closed trade stats (includes both legacy + positions)
  const { data: closedTrades } = await supabase.from("paper_trades").select("return_r")
    .eq("asset_id", asset_id).eq("timeframe", timeframe).eq("status", "CLOSED").not("return_r", "is", null);
  const { count: nOpened } = await supabase.from("paper_trades").select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id).eq("timeframe", timeframe).in("status", ["OPEN", "CLOSED"]);

  const returns = (closedTrades || []).map(t => t.return_r as number).filter(r => r !== null);
  const avgR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const medianR = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

  let level = 0;
  const isBhHorizon = LEARNING_HORIZONS.includes(horizon);
  if (isBhHorizon && horizon === "3m") {
    if (dirAcc >= BH_L1_FAST_GATES.minDirAcc && avgR > BH_L1_FAST_GATES.minEvBh && (nDecisions || 0) >= BH_L1_FAST_GATES.minDecisions) level = 1;
  }
  for (let l = 3; l >= 1; l--) {
    const gate = GRADUATION_GATES[l as 1 | 2 | 3];
    if ((nDecisions || 0) >= gate.minDecisions && (nOpened || 0) >= gate.minTrades && dirAcc >= gate.minDirAcc && avgR >= gate.minAvgR) {
      level = Math.max(level, l); break;
    }
  }
  if (horizon === "3m" && level > 1) level = 1;

  await supabase.from("graduation_status").upsert({
    asset_id, timeframe, horizon, n_decisions: nDecisions || 0, n_opened_trades: nOpened || 0,
    dir_acc: dirAcc, avg_return_r: avgR, median_r: medianR, graduation_level: level,
    influence_mode: INFLUENCE_MODES[level], last_drift_check: new Date().toISOString(),
    integrity_gating_pass: dirAcc >= 0.55, updated_at: new Date().toISOString(),
  }, { onConflict: "asset_id,timeframe,horizon" });

  return { level, dirAcc, avgR, medianR, nDecisions, nOpened, horizon };
}

// ─── FETCH STATS ──────────────────────────────────────────────────
async function fetchStats(asset_id?: string, includeLearning = false) {
  let decisionsQuery = supabase.from("paper_decisions").select("*").order("ts", { ascending: false }).limit(200);
  // paper_trades is now a VIEW bridging legacy + positions
  let tradesQuery = supabase.from("paper_trades").select("*").order("ts_created", { ascending: false }).limit(200);
  let gradQuery = supabase.from("graduation_status").select("*");

  if (asset_id) {
    decisionsQuery = decisionsQuery.eq("asset_id", asset_id);
    tradesQuery = tradesQuery.eq("asset_id", asset_id);
    gradQuery = gradQuery.eq("asset_id", asset_id);
  }

  // Fetch positions (new system) + events + policy
  let positionsQuery = supabase.from("paper_positions").select("*").order("created_at", { ascending: false }).limit(200);
  let eventsQuery = supabase.from("paper_engine_events").select("*").order("ts", { ascending: false }).limit(100);
  if (asset_id) positionsQuery = positionsQuery.eq("symbol", asset_id);

  const [decisions, trades, graduation, positions, events] = await Promise.all([
    decisionsQuery, tradesQuery, gradQuery, positionsQuery, eventsQuery,
  ]);

  const { data: policyData } = await supabase.from("paper_policy").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1);

  const evaluated = (decisions.data || []).filter(d => d.evaluated_at);
  const confusionMatrix = { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };
  for (const d of evaluated) {
    if (d.direction_pred && d.realized_dir) {
      confusionMatrix[d.direction_pred as keyof typeof confusionMatrix][d.realized_dir as "UP" | "DOWN" | "NEUTRAL"]++;
    }
  }

  const closedTradesData = (trades.data || []).filter(t => t.status === "CLOSED" && t.mae_r !== null);
  const maeDistribution = closedTradesData.map(t => t.mae_r);

  const bhHorizonStats: Record<string, any> = {};
  for (const h of LEARNING_HORIZONS) {
    const hDecisions = (decisions.data || []).filter(d => d.horizon === h);
    const hEvaluated = hDecisions.filter(d => d.evaluated_at);
    const hCorrect = hEvaluated.filter(d => d.correct);
    const hDirAcc = hEvaluated.length > 0 ? hCorrect.length / hEvaluated.length : 0;
    const hGrad = (graduation.data || []).find(g => g.horizon === h);
    bhHorizonStats[h] = {
      totalDecisions: hDecisions.length, evaluatedDecisions: hEvaluated.length, correctDecisions: hCorrect.length,
      dirAcc: hDirAcc, avgReturnR: hGrad?.avg_return_r ?? 0, graduationLevel: hGrad?.graduation_level ?? 0,
      cadence: CADENCE_MAP[h] || "monthly", isLearningOnly: !PUBLIC_HORIZONS.includes(h),
      contributedToL1: h === "3m" && hGrad?.graduation_level === 1 && hDirAcc >= BH_L1_FAST_GATES.minDirAcc && hDecisions.length >= BH_L1_FAST_GATES.minDecisions,
    };
  }

  let lastRunQuery = supabase.from("evaluation_runs").select("*").order("created_at", { ascending: false }).limit(1);
  if (asset_id) lastRunQuery = lastRunQuery.eq("asset_id", asset_id);
  const { data: lastRunData } = await lastRunQuery;

  let tfStatsQuery = supabase.from("timeframe_stats").select("*").order("success_likelihood_score", { ascending: false });
  if (asset_id) tfStatsQuery = tfStatsQuery.eq("asset_id", asset_id);
  const { data: tfStatsData } = await tfStatsQuery;

  const matureTfs = (tfStatsData || []).filter(t => (t.trades_n || 0) >= 30);
  const bestTf = matureTfs.length > 0 ? matureTfs[0].timeframe : null;

  return {
    decisions: decisions.data || [], trades: trades.data || [], graduation: graduation.data || [],
    confusionMatrix, maeDistribution, bhHorizonStats,
    lastRun: lastRunData?.[0] || null, timeframeStats: tfStatsData || [], bestTimeframe: bestTf,
    config: { publicHorizons: PUBLIC_HORIZONS, learningHorizons: LEARNING_HORIZONS, cadenceMap: CADENCE_MAP },
    // New exchange fields
    positions: positions.data || [],
    events: events.data || [],
    policy: policyData?.[0] || null,
  };
}

// ─── FULL EVALUATE PIPELINE ──────────────────────────────────────
async function runFullEvaluation(asset_id: string, timeframe: string, horizon?: string, emittedBy: string = "UNKNOWN") {
  const guard = await checkCadenceGuard(emittedBy);
  if (!guard.allowed) {
    return { run_id: null, status: "CADENCE_BLOCKED", decision_type: "SKIPPED", reason: guard.reason };
  }

  const { data: runRow } = await supabase.from("evaluation_runs").insert({
    asset_id, timeframe, status: "STARTED", progress_0_100: 0,
  }).select().single();
  const runId = runRow?.run_id || crypto.randomUUID();

  await trace(runId, asset_id, timeframe, "BOOTSTRAP", "INFO", "Evaluation started", { horizon, version: VERSION_TAG });

  let currentPrice: number | null = null;
  let scenarios: any[] = [];
  let agreementScore = 0, consensusScore = 0, completenessScore = 0;
  let anomalyHalt = false, haltReason: string | null = null, evalError: string | null = null;

  try {
    await trace(runId, asset_id, timeframe, "DATA_FETCH", "INFO", "Fetching market data");
    const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
    const priceJson = await priceRes.json();
    currentPrice = priceJson.data?.[0]?.price || null;

    await trace(runId, asset_id, timeframe, "DATA_CLEAN", "INFO", "Checking system status");
    const { data: sysStatus } = await supabase.from("system_status").select("*").eq("asset_id", asset_id).maybeSingle();
    if (sysStatus?.anomaly_halt) { anomalyHalt = true; haltReason = sysStatus.reason || "System in HALT state"; }

    await trace(runId, asset_id, timeframe, "INDICATORS", "INFO", "Running analysis");
    const analysisRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=analysis&symbols=${asset_id}`);
    const analysisJson = await analysisRes.json();
    scenarios = analysisJson.data?.scenarios || [];
    const detectedRegime = scenarios[0]?.regime || undefined;

    if (scenarios.length > 0) {
      // Select scenario with MAX probability, not just first one
      const best = scenarios.reduce((acc: any, s: any) => {
        const accProb = Number(acc?.probability ?? -1);
        const sProb = Number(s?.probability ?? -1);
        return sProb > accProb ? s : acc;
      }, scenarios[0]);

      const evidenceCount = best.evidence?.length || 0;
      completenessScore = Math.min(1, evidenceCount / 8);
      const agreeCount = (best.evidence || []).filter((e: any) => {
        const interp = (e.interpretation || "").toLowerCase();
        if (best.type === "bullish") return interp.includes("bullish") || interp.includes("positive");
        if (best.type === "bearish") return interp.includes("bearish") || interp.includes("negative");
        return interp.includes("neutral");
      }).length;
      agreementScore = evidenceCount > 0 ? agreeCount / evidenceCount : 0;
      consensusScore = clampProbability(best.probability, "CONSENSUS_BUILD/best.probability");

      console.log(`[PROBABILITY_DEBUG] ${asset_id}:`, {
        scenarios_count: scenarios.length,
        best_type: best.type,
        best_probability_raw: best.probability,
        consensus_score: consensusScore,
        all_probabilities: scenarios.map((s: any) => ({ type: s.type, prob: s.probability })),
      });
    }

    // Evaluate existing decisions + process execution (fills/exits)
    const [decResult, execResult] = await Promise.all([
      evaluateDecisions(asset_id, horizon),
      processExecution(asset_id),
    ]);
    await trace(runId, asset_id, timeframe, "CROSS_REFERENCE", "INFO", "Evaluated + executed", { decisions: decResult, execution: execResult });

    // Emit guaranteed decision
    const emitResult = await emitDecision(runId, asset_id, timeframe, {
      currentPrice, scenarios, agreementScore, consensusScore, completenessScore,
      anomalyHalt, haltReason, evaluatedDecisions: decResult.evaluated,
      evaluatedTrades: (execResult.filled || 0) + (execResult.closed || 0),
      error: null, regime: detectedRegime,
    }, emittedBy);

    await supabase.from("evaluation_runs").update({
      status: "COMPLETED", progress_0_100: 100, final_phase: "FINALIZE",
      decisions_written_n: 1, updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    return {
      run_id: runId, status: "COMPLETED", decisions_written: 1,
      decision_type: emitResult.decision_type, decision: emitResult.decision,
      evaluated_existing: { decisions: decResult, execution: execResult },
    };

  } catch (err) {
    evalError = (err as Error).message;
    await trace(runId, asset_id, timeframe, "FINALIZE", "ERROR", `Error: ${evalError}`);

    const emitResult = await emitDecision(runId, asset_id, timeframe, {
      currentPrice, scenarios, agreementScore, consensusScore, completenessScore,
      anomalyHalt, haltReason, evaluatedDecisions: 0, evaluatedTrades: 0,
      error: evalError, regime: undefined,
    }, emittedBy);

    await supabase.from("evaluation_runs").update({
      status: "ERROR", progress_0_100: 0, error_text: evalError,
      decisions_written_n: 1, updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    return { run_id: runId, status: "ERROR", decisions_written: 1, decision_type: emitResult.decision_type, error: evalError };
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "stats";
    const asset = url.searchParams.get("asset");
    const includeLearning = url.searchParams.get("learning") === "true";

    if (action === "stats") {
      const stats = await fetchStats(asset || undefined, includeLearning);
      return new Response(JSON.stringify({ data: stats }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "record-decision") {
      const body = await req.json();
      const result = await recordDecision(body);
      return new Response(JSON.stringify({ data: result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "evaluate") {
      if (!asset) throw new Error("asset parameter required");
      const horizon = url.searchParams.get("horizon") || undefined;
      const timeframe = url.searchParams.get("timeframe") || "4h";
      const emittedBy = url.searchParams.get("emitted_by") || "UNKNOWN";
      const result = await runFullEvaluation(asset, timeframe, horizon, emittedBy);
      return new Response(JSON.stringify({ data: result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "graduation") {
      if (!asset) throw new Error("asset parameter required");
      const horizon = url.searchParams.get("horizon") || "24h";
      const result = await updateGraduation(asset, "4h", horizon);
      return new Response(JSON.stringify({ data: result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "last-run") {
      let query = supabase.from("evaluation_runs").select("*").order("created_at", { ascending: false }).limit(1);
      if (asset) query = query.eq("asset_id", asset);
      const { data } = await query;
      return new Response(JSON.stringify({ data: data?.[0] || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "trace") {
      const runId = url.searchParams.get("run_id");
      if (!runId) throw new Error("run_id parameter required");
      const { data } = await supabase.from("debug_trace_events").select("*").eq("run_id", runId).order("ts", { ascending: true }).limit(100);
      return new Response(JSON.stringify({ data: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "events") {
      let query = supabase.from("paper_engine_events").select("*").order("ts", { ascending: false }).limit(200);
      const entityType = url.searchParams.get("entity_type");
      const entityId = url.searchParams.get("entity_id");
      const runId = url.searchParams.get("run_id");
      if (entityType) query = query.eq("entity_type", entityType);
      if (entityId) query = query.eq("entity_id", entityId);
      if (runId) query = query.eq("run_id", runId);
      const { data } = await query;
      return new Response(JSON.stringify({ data: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "positions") {
      let query = supabase.from("paper_positions").select("*").order("created_at", { ascending: false }).limit(200);
      if (asset) query = query.eq("symbol", asset);
      const statusFilter = url.searchParams.get("status");
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data } = await query;
      return new Response(JSON.stringify({ data: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "policy") {
      const policy = await getActivePolicy();
      return new Response(JSON.stringify({ data: policy }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
