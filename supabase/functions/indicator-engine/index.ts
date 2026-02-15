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

const FAVORABLE_THRESHOLD = 65;
const MIN_DECISIONS_DIRACC = 200;
const MIN_TRADES_EV = 100;
const MAX_PATTERNS_PER_CONTEXT = 10;
const MIN_PATTERN_DECISIONS = 300;
const MIN_PATTERN_UPLIFT = 0.03;

// ─── INDICATOR NAMES ──────────────────────────────────────────────
const INDICATOR_NAMES = [
  "EMA_20", "EMA_50", "RSI_14", "MACD", "ADX", "ATR",
  "BB", "VWAP", "OBV", "RVOL", "FibCluster", "MTF_Similarity", "WhaleBias",
];

// ─── RECORD SNAPSHOT ──────────────────────────────────────────────
async function recordSnapshot(body: any) {
  const {
    decision_id, asset_id, timeframe_primary, timeframe_confirm,
    regime_label, ts, indicators_json, role_scores_json,
    integrity_json, engine_outputs_json,
  } = body;

  const { data, error } = await supabase.from("indicator_snapshots").insert({
    decision_id,
    asset_id,
    timeframe_primary: timeframe_primary || "4h",
    timeframe_confirm: timeframe_confirm || null,
    regime_label: regime_label || "Unknown",
    ts: ts || new Date().toISOString(),
    indicators_json: indicators_json || {},
    role_scores_json: role_scores_json || {},
    integrity_json: integrity_json || {},
    engine_outputs_json: engine_outputs_json || {},
  }).select().single();

  if (error) throw error;
  return data;
}

// ─── LINK OUTCOMES ────────────────────────────────────────────────
async function linkOutcomes(asset_id?: string) {
  // Find evaluated decisions without an outcome link
  let query = supabase
    .from("paper_decisions")
    .select("id, asset_id, direction_pred, realized_dir, correct, realized_move_pct, horizon")
    .not("evaluated_at", "is", null);

  if (asset_id) query = query.eq("asset_id", asset_id);

  const { data: decisions, error } = await query.limit(500);
  if (error) throw error;
  if (!decisions?.length) return { linked: 0 };

  // Get existing links to avoid duplicates
  const decisionIds = decisions.map(d => d.id);
  const { data: existing } = await supabase
    .from("indicator_outcome_links")
    .select("decision_id")
    .in("decision_id", decisionIds);

  const existingSet = new Set((existing || []).map(e => e.decision_id));
  const toLink = decisions.filter(d => !existingSet.has(d.id));

  if (!toLink.length) return { linked: 0, message: "All evaluated decisions already linked" };

  let linked = 0;
  for (const d of toLink) {
    // Check if there's a trade for this decision
    const { data: trade } = await supabase
      .from("paper_trades")
      .select("id, return_r, mae_r, mfe_r, outcome_label, status")
      .eq("decision_id", d.id)
      .eq("status", "CLOSED")
      .limit(1)
      .maybeSingle();

    const { error: insertErr } = await supabase.from("indicator_outcome_links").insert({
      decision_id: d.id,
      trade_id: trade?.id || null,
      direction_correct: d.correct ? 1 : 0,
      return_r: trade?.return_r ?? null,
      mae_r: trade?.mae_r ?? null,
      mfe_r: trade?.mfe_r ?? null,
      outcome_label: trade?.outcome_label ?? null,
      horizon_realized_dir: d.realized_dir,
    });

    if (!insertErr) linked++;
  }

  return { linked };
}

// ─── COMPUTE INDICATOR RELIABILITY ────────────────────────────────
async function computeReliability(asset_id: string, timeframe = "4h") {
  // Get all snapshots with linked outcomes for this asset
  const { data: snapshots, error: snapErr } = await supabase
    .from("indicator_snapshots")
    .select("id, decision_id, regime_label, indicators_json")
    .eq("asset_id", asset_id)
    .eq("timeframe_primary", timeframe)
    .limit(1000);

  if (snapErr) throw snapErr;
  if (!snapshots?.length) return { computed: 0 };

  const decisionIds = snapshots.map(s => s.decision_id);
  const { data: outcomes } = await supabase
    .from("indicator_outcome_links")
    .select("decision_id, direction_correct, return_r")
    .in("decision_id", decisionIds);

  if (!outcomes?.length) return { computed: 0, message: "No outcomes linked" };

  const outcomeMap = new Map(outcomes.map(o => [o.decision_id, o]));

  // Group by regime
  const regimeGroups: Record<string, typeof snapshots> = {};
  for (const s of snapshots) {
    const key = s.regime_label || "Unknown";
    if (!regimeGroups[key]) regimeGroups[key] = [];
    regimeGroups[key].push(s);
  }

  let computed = 0;

  for (const [regime, group] of Object.entries(regimeGroups)) {
    // Compute baseline DirAcc and EV for this regime
    const groupOutcomes = group
      .map(s => outcomeMap.get(s.decision_id))
      .filter(Boolean) as typeof outcomes;

    if (groupOutcomes.length < 10) continue;

    const baselineDirAcc = groupOutcomes.filter(o => o.direction_correct === 1).length / groupOutcomes.length;
    const tradesWithR = groupOutcomes.filter(o => o.return_r !== null);
    const baselineEv = tradesWithR.length > 0
      ? tradesWithR.reduce((s, o) => s + Number(o.return_r), 0) / tradesWithR.length
      : 0;

    for (const indicatorName of INDICATOR_NAMES) {
      // Split into favorable vs unfavorable
      const favorable: typeof outcomes = [];
      const unfavorable: typeof outcomes = [];

      for (const s of group) {
        const outcome = outcomeMap.get(s.decision_id);
        if (!outcome) continue;

        const indicators = s.indicators_json as Record<string, any>;
        const ind = indicators[indicatorName];
        if (!ind || ind.score_0_100 === undefined) continue;

        if (ind.score_0_100 >= FAVORABLE_THRESHOLD) {
          favorable.push(outcome);
        } else {
          unfavorable.push(outcome);
        }
      }

      const sampleN = favorable.length + unfavorable.length;
      if (sampleN < 10) continue;

      // DirAcc lift
      const favDirAcc = favorable.length > 0
        ? favorable.filter(o => o.direction_correct === 1).length / favorable.length
        : baselineDirAcc;
      const diraccLift = favDirAcc - baselineDirAcc;

      // EV lift (only from trades with return_r)
      const favTradesR = favorable.filter(o => o.return_r !== null);
      const favEv = favTradesR.length > 0
        ? favTradesR.reduce((s, o) => s + Number(o.return_r), 0) / favTradesR.length
        : baselineEv;
      const evLift = favEv - baselineEv;

      // False positive rate: favorable but direction wrong
      const falsePositives = favorable.filter(o => o.direction_correct === 0).length;
      const fpRate = favorable.length > 0 ? falsePositives / favorable.length : 0;

      await supabase.from("indicator_reliability").upsert({
        asset_id,
        timeframe,
        regime_label: regime,
        indicator_name: indicatorName,
        sample_n: sampleN,
        diracc_lift: diraccLift,
        ev_lift: evLift,
        false_positive_rate: fpRate,
        last_updated_ts: new Date().toISOString(),
      }, { onConflict: "asset_id,timeframe,regime_label,indicator_name" });

      computed++;
    }
  }

  return { computed };
}

// ─── PATTERN MINER ────────────────────────────────────────────────
async function minePatterns(asset_id: string, timeframe = "4h") {
  const { data: snapshots } = await supabase
    .from("indicator_snapshots")
    .select("id, decision_id, regime_label, indicators_json, integrity_json, role_scores_json")
    .eq("asset_id", asset_id)
    .eq("timeframe_primary", timeframe)
    .limit(1000);

  if (!snapshots?.length) return { patterns: 0 };

  const decisionIds = snapshots.map(s => s.decision_id);
  const { data: outcomes } = await supabase
    .from("indicator_outcome_links")
    .select("decision_id, direction_correct, return_r, trade_id")
    .in("decision_id", decisionIds);

  if (!outcomes?.length) return { patterns: 0 };

  const outcomeMap = new Map(outcomes.map(o => [o.decision_id, o]));

  // Baseline stats
  const allOutcomes = snapshots
    .map(s => outcomeMap.get(s.decision_id))
    .filter(Boolean) as typeof outcomes;

  if (allOutcomes.length < MIN_PATTERN_DECISIONS) {
    return { patterns: 0, message: `Need ${MIN_PATTERN_DECISIONS} decisions, have ${allOutcomes.length}` };
  }

  const baselineDirAcc = allOutcomes.filter(o => o.direction_correct === 1).length / allOutcomes.length;
  const baselineTradesR = allOutcomes.filter(o => o.return_r !== null);
  const baselineEv = baselineTradesR.length > 0
    ? baselineTradesR.reduce((s, o) => s + Number(o.return_r), 0) / baselineTradesR.length
    : 0;

  // Generate candidate patterns: single-indicator thresholds
  const candidatePatterns: Array<{
    conditions: any[];
    matching: typeof outcomes;
    regime: string;
  }> = [];

  const regimes = [...new Set(snapshots.map(s => s.regime_label || "Unknown"))];

  for (const regime of regimes) {
    const regimeSnapshots = snapshots.filter(s => (s.regime_label || "Unknown") === regime);

    for (const indName of INDICATOR_NAMES) {
      // High score pattern
      const highScoreMatching: typeof outcomes = [];
      for (const s of regimeSnapshots) {
        const ind = (s.indicators_json as any)?.[indName];
        if (!ind || ind.score_0_100 === undefined) continue;
        if (ind.score_0_100 >= 75) {
          const o = outcomeMap.get(s.decision_id);
          if (o) highScoreMatching.push(o);
        }
      }

      if (highScoreMatching.length >= 30) {
        candidatePatterns.push({
          conditions: [{ indicator: indName, field: "score_0_100", op: ">=", value: 75 }],
          matching: highScoreMatching,
          regime,
        });
      }

      // Positive slope pattern
      const slopeMatching: typeof outcomes = [];
      for (const s of regimeSnapshots) {
        const ind = (s.indicators_json as any)?.[indName];
        if (!ind || ind.slope === undefined) continue;
        if (ind.slope > 0 && ind.score_0_100 >= 60) {
          const o = outcomeMap.get(s.decision_id);
          if (o) slopeMatching.push(o);
        }
      }

      if (slopeMatching.length >= 30) {
        candidatePatterns.push({
          conditions: [
            { indicator: indName, field: "slope", op: ">", value: 0 },
            { indicator: indName, field: "score_0_100", op: ">=", value: 60 },
          ],
          matching: slopeMatching,
          regime,
        });
      }
    }

    // Two-indicator combo patterns (top 3 indicators by reliability)
    const { data: reliability } = await supabase
      .from("indicator_reliability")
      .select("indicator_name, diracc_lift")
      .eq("asset_id", asset_id)
      .eq("timeframe", timeframe)
      .eq("regime_label", regime)
      .order("diracc_lift", { ascending: false })
      .limit(3);

    if (reliability && reliability.length >= 2) {
      const [ind1, ind2] = reliability;
      const comboMatching: typeof outcomes = [];

      for (const s of regimeSnapshots) {
        const indicators = s.indicators_json as any;
        const i1 = indicators?.[ind1.indicator_name];
        const i2 = indicators?.[ind2.indicator_name];
        if (!i1 || !i2) continue;
        if ((i1.score_0_100 ?? 0) >= 65 && (i2.score_0_100 ?? 0) >= 65) {
          const o = outcomeMap.get(s.decision_id);
          if (o) comboMatching.push(o);
        }
      }

      if (comboMatching.length >= 30) {
        candidatePatterns.push({
          conditions: [
            { indicator: ind1.indicator_name, field: "score_0_100", op: ">=", value: 65 },
            { indicator: ind2.indicator_name, field: "score_0_100", op: ">=", value: 65 },
          ],
          matching: comboMatching,
          regime,
        });
      }
    }
  }

  // Evaluate and store patterns
  let stored = 0;
  const patternsByRegime: Record<string, Array<{ uplift: number; conditions: any[] }>> = {};

  for (const candidate of candidatePatterns) {
    const dirAcc = candidate.matching.filter(o => o.direction_correct === 1).length / candidate.matching.length;
    const diraccUplift = dirAcc - baselineDirAcc;

    const tradesR = candidate.matching.filter(o => o.return_r !== null);
    const ev = tradesR.length > 0
      ? tradesR.reduce((s, o) => s + Number(o.return_r), 0) / tradesR.length
      : 0;
    const evUplift = ev - baselineEv;

    if (diraccUplift < MIN_PATTERN_UPLIFT && evUplift < MIN_PATTERN_UPLIFT) continue;

    const key = candidate.regime;
    if (!patternsByRegime[key]) patternsByRegime[key] = [];
    if (patternsByRegime[key].length >= MAX_PATTERNS_PER_CONTEXT) continue;

    // Stability: check if uplift is consistent across halves
    const half = Math.floor(candidate.matching.length / 2);
    const firstHalf = candidate.matching.slice(0, half);
    const secondHalf = candidate.matching.slice(half);
    const firstDirAcc = firstHalf.filter(o => o.direction_correct === 1).length / firstHalf.length;
    const secondDirAcc = secondHalf.filter(o => o.direction_correct === 1).length / secondHalf.length;
    const stability = 1 - Math.abs(firstDirAcc - secondDirAcc);

    const confidenceTier = diraccUplift > 0.08 && stability > 0.85 ? "high"
      : diraccUplift > 0.05 && stability > 0.7 ? "medium" : "low";

    const nTrades = candidate.matching.filter(o => o.return_r !== null).length;

    await supabase.from("indicator_patterns").upsert({
      asset_id,
      timeframe,
      regime_label: candidate.regime,
      conditions_json: candidate.conditions,
      support_n_decisions: candidate.matching.length,
      support_n_trades: nTrades,
      diracc_uplift: diraccUplift,
      ev_uplift: evUplift,
      stability_score: stability,
      confidence_tier: confidenceTier,
      is_active: true,
      last_validated_ts: new Date().toISOString(),
    }, { onConflict: "asset_id,timeframe,regime_label,conditions_json" });

    patternsByRegime[key].push({ uplift: diraccUplift, conditions: candidate.conditions });
    stored++;
  }

  return { patterns: stored };
}

// ─── FETCH SNAPSHOT FOR TRADE ─────────────────────────────────────
async function fetchTradeSnapshot(decisionId: string) {
  const { data: snapshot } = await supabase
    .from("indicator_snapshots")
    .select("*")
    .eq("decision_id", decisionId)
    .maybeSingle();

  const { data: outcome } = await supabase
    .from("indicator_outcome_links")
    .select("*")
    .eq("decision_id", decisionId)
    .maybeSingle();

  // Get reliability for context
  if (snapshot) {
    const { data: reliability } = await supabase
      .from("indicator_reliability")
      .select("*")
      .eq("asset_id", snapshot.asset_id)
      .eq("timeframe", snapshot.timeframe_primary)
      .eq("regime_label", snapshot.regime_label);

    return { snapshot, outcome, reliability: reliability || [] };
  }

  return { snapshot: null, outcome, reliability: [] };
}

// ─── FETCH RELIABILITY DASHBOARD ──────────────────────────────────
async function fetchReliability(asset_id?: string, timeframe = "4h") {
  let query = supabase
    .from("indicator_reliability")
    .select("*")
    .order("diracc_lift", { ascending: false });

  if (asset_id) query = query.eq("asset_id", asset_id);
  query = query.eq("timeframe", timeframe);

  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data || [];
}

// ─── FETCH PATTERNS ───────────────────────────────────────────────
async function fetchPatterns(asset_id?: string, timeframe = "4h", activeOnly = true) {
  let query = supabase
    .from("indicator_patterns")
    .select("*")
    .order("diracc_uplift", { ascending: false });

  if (asset_id) query = query.eq("asset_id", asset_id);
  query = query.eq("timeframe", timeframe);
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data || [];
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "reliability";
    const asset = url.searchParams.get("asset");
    const timeframe = url.searchParams.get("timeframe") || "4h";

    if (action === "record-snapshot") {
      const body = await req.json();
      const result = await recordSnapshot(body);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "link-outcomes") {
      const result = await linkOutcomes(asset || undefined);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "compute-reliability") {
      if (!asset) throw new Error("asset parameter required");
      const result = await computeReliability(asset, timeframe);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "mine-patterns") {
      if (!asset) throw new Error("asset parameter required");
      const result = await minePatterns(asset, timeframe);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "trade-snapshot") {
      const decisionId = url.searchParams.get("decision_id");
      if (!decisionId) throw new Error("decision_id parameter required");
      const result = await fetchTradeSnapshot(decisionId);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reliability") {
      const result = await fetchReliability(asset || undefined, timeframe);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "patterns") {
      const activeOnly = url.searchParams.get("active") !== "false";
      const result = await fetchPatterns(asset || undefined, timeframe, activeOnly);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Indicator engine error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
