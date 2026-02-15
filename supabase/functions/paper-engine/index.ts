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

// ─── RECORD DECISION ──────────────────────────────────────────────
async function recordDecision(body: any) {
  const { asset_id, timeframe, horizon, ref_price, direction_pred, probability_pred, agreement_score, consensus_score, completeness_score, evidence_snapshot_json } = body;

  const { data, error } = await supabase.from("paper_decisions").insert({
    asset_id, timeframe: timeframe || "4h", horizon: horizon || "24h",
    ref_price, direction_pred, probability_pred,
    agreement_score: agreement_score || 0,
    consensus_score: consensus_score || 0,
    completeness_score: completeness_score || 0,
    evidence_snapshot_json,
  }).select().single();

  if (error) throw error;
  return data;
}

// ─── RECORD TRADE ─────────────────────────────────────────────────
async function recordTrade(body: any) {
  const { decision_id, asset_id, timeframe, regime_label, scenario_type, entry_zone_low, entry_zone_high, trigger_rule, stop_level, stop_rule, targets_json, time_window_end, evidence_snapshot_json } = body;

  const { data, error } = await supabase.from("paper_trades").insert({
    decision_id, asset_id, timeframe: timeframe || "4h",
    regime_label, scenario_type, entry_zone_low, entry_zone_high,
    trigger_rule, stop_level, stop_rule, targets_json,
    time_window_end, evidence_snapshot_json,
    status: "PENDING",
  }).select().single();

  if (error) throw error;
  return data;
}

// ─── EVALUATE DECISIONS ───────────────────────────────────────────
async function evaluateDecisions(asset_id: string) {
  // Fetch unevaluated decisions older than their horizon
  const { data: decisions, error } = await supabase
    .from("paper_decisions")
    .select("*")
    .eq("asset_id", asset_id)
    .is("evaluated_at", null)
    .order("ts", { ascending: true })
    .limit(100);

  if (error) throw error;
  if (!decisions?.length) return { evaluated: 0 };

  // Fetch current price from crypto-data edge function
  const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
  const priceJson = await priceRes.json();
  const currentPrice = priceJson.data?.[0]?.price;
  if (!currentPrice) return { evaluated: 0, error: "Could not fetch current price" };

  // Also fetch ATR for neutral band
  const klinesRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=analysis&symbols=${asset_id}`);
  const klinesJson = await klinesRes.json();
  const atrSignal = klinesJson.data?.scenarios?.[0]?.evidence?.find((e: any) => e.signal === "ATR");
  const atrValue = atrSignal ? parseFloat(atrSignal.value.replace("$", "").replace(",", "")) : 0;
  const atrPct = atrValue / currentPrice;

  let evaluated = 0;
  const now = new Date();

  for (const d of decisions) {
    // Check if horizon has elapsed
    const horizonHours = parseHorizon(d.horizon);
    const decisionTime = new Date(d.ts);
    const evalTime = new Date(decisionTime.getTime() + horizonHours * 60 * 60 * 1000);
    
    if (now < evalTime) continue;

    const movePct = (currentPrice - d.ref_price) / d.ref_price;
    const neutralBand = Math.max(0.0015, 0.25 * atrPct);

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

  // Update graduation status
  await updateGraduation(asset_id);

  return { evaluated };
}

// ─── EVALUATE TRADES ──────────────────────────────────────────────
async function evaluateTrades(asset_id: string) {
  const priceRes = await fetch(`${supabaseUrl}/functions/v1/crypto-data?action=market&symbols=${asset_id}`);
  const priceJson = await priceRes.json();
  const currentPrice = priceJson.data?.[0]?.price;
  if (!currentPrice) return { evaluated: 0 };

  // Check PENDING trades for fill
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

  // Check OPEN trades for stop/target/expiry
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

    // Check stop
    const stopped = isBull ? currentPrice <= t.stop_level : currentPrice >= t.stop_level;

    // Check targets
    const targets = (t.targets_json || []) as { price: number }[];
    const lastTarget = targets[targets.length - 1];
    const targetHit = lastTarget && (isBull ? currentPrice >= lastTarget.price : currentPrice <= lastTarget.price);

    // Check time expiry
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
        mae_r: Math.min(0, currentR), // simplified
        mfe_r: Math.max(0, currentR), // simplified
      }).eq("id", t.id);
      closed++;
    }
  }

  if (closed > 0) await updateGraduation(asset_id);
  return { filled, closed };
}

// ─── UPDATE GRADUATION ───────────────────────────────────────────
async function updateGraduation(asset_id: string, timeframe = "4h", horizon = "24h") {
  // Count decisions
  const { count: nDecisions } = await supabase
    .from("paper_decisions")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("horizon", horizon);

  // Count correct decisions
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

  // Get trade stats
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

  // Determine graduation level
  let level = 0;
  for (let l = 3; l >= 1; l--) {
    const gate = GRADUATION_GATES[l as 1 | 2 | 3];
    if (
      (nDecisions || 0) >= gate.minDecisions &&
      (nOpened || 0) >= gate.minTrades &&
      dirAcc >= gate.minDirAcc &&
      avgR >= gate.minAvgR
    ) {
      level = l;
      break;
    }
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

  return { level, dirAcc, avgR, medianR, nDecisions, nOpened };
}

// ─── FETCH STATS ──────────────────────────────────────────────────
async function fetchStats(asset_id?: string) {
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

  // Compute confusion matrix from evaluated decisions
  const evaluated = (decisions.data || []).filter(d => d.evaluated_at);
  const confusionMatrix = { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };
  for (const d of evaluated) {
    if (d.direction_pred && d.realized_dir) {
      confusionMatrix[d.direction_pred as keyof typeof confusionMatrix][d.realized_dir as "UP" | "DOWN" | "NEUTRAL"]++;
    }
  }

  // MAE_R distribution
  const closedTrades = (trades.data || []).filter(t => t.status === "CLOSED" && t.mae_r !== null);
  const maeDistribution = closedTrades.map(t => t.mae_r);

  return {
    decisions: decisions.data || [],
    trades: trades.data || [],
    graduation: graduation.data || [],
    confusionMatrix,
    maeDistribution,
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────
function parseHorizon(horizon: string): number {
  const match = horizon.match(/(\d+)(h|d|m)/);
  if (!match) return 24;
  const [, val, unit] = match;
  const n = parseInt(val);
  if (unit === "h") return n;
  if (unit === "d") return n * 24;
  if (unit === "m") return n / 60;
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

    if (action === "stats") {
      const stats = await fetchStats(asset || undefined);
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
      const [decResult, tradeResult] = await Promise.all([
        evaluateDecisions(asset),
        evaluateTrades(asset),
      ]);
      return new Response(JSON.stringify({ data: { decisions: decResult, trades: tradeResult } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "graduation") {
      if (!asset) throw new Error("asset parameter required");
      const result = await updateGraduation(asset);
      return new Response(JSON.stringify({ data: result }), {
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
