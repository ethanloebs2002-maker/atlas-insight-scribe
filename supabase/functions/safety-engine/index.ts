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

// ─── THRESHOLDS ────────────────────────────────────────────────
const WARN_TH = 45;
const HALT_TH = 70;
const K_WARN = 2;
const K_HALT = 1;
const K_CLEAR = 3;
const EMA_ALPHA = 0.35;
const N_COOLDOWN_RT = 10; // RT intervals
const VOLATILITY_SPIKE_MULTIPLIER = 2.5;
const INTEGRITY_COLLAPSE_THRESHOLD = 0.3;
const DATA_GAP_HOURS = 6;
const PATTERN_VALIDATION_PASSES_FOR_VALIDATED = 3;
const PATTERN_VALIDATION_PASSES_FOR_PROMOTED = 5;
const PATTERN_FAILURE_THRESHOLD = 3;

// ─── ROOT CAUSE TYPES ──────────────────────────────────────────
type RootCause = "price_shock" | "vol_spike" | "liquidity_collapse" | "source_divergence" | "derivatives_stress";

// ─── LOOP A: REAL-TIME SENSING ─────────────────────────────────
async function rtSense(assetId: string): Promise<{
  score: number;
  proposedState: string;
  rootCauses: Array<{ cause: RootCause; contribution: number }>;
  metrics: Record<string, number>;
}> {
  const metrics: Record<string, number> = {};
  const causeScores: Record<RootCause, number> = {
    price_shock: 0,
    vol_spike: 0,
    liquidity_collapse: 0,
    source_divergence: 0,
    derivatives_stress: 0,
  };

  // 1) Volatility spike via ATR
  const { data: fingerprints } = await supabase
    .from("asset_fingerprints")
    .select("atr_normalized, volatility_rank, regime_label")
    .eq("asset_id", assetId)
    .order("computed_at", { ascending: false })
    .limit(10);

  if (fingerprints && fingerprints.length >= 2) {
    const latest = Number(fingerprints[0].atr_normalized);
    const avg = fingerprints.slice(1).reduce((s, f) => s + Number(f.atr_normalized), 0) / (fingerprints.length - 1);
    const ratio = avg > 0 ? latest / avg : 0;
    metrics.atr_ratio = ratio;
    metrics.volatility_rank = Number(fingerprints[0].volatility_rank);

    if (ratio > VOLATILITY_SPIKE_MULTIPLIER) {
      causeScores.vol_spike = Math.min(40, (ratio - VOLATILITY_SPIKE_MULTIPLIER) * 15);
    }
    if (ratio > 4) {
      causeScores.price_shock = Math.min(30, (ratio - 4) * 10);
    }
  }

  // 2) Integrity collapse via recent decisions
  const { data: decisions } = await supabase
    .from("paper_decisions")
    .select("consensus_score, agreement_score, completeness_score")
    .eq("asset_id", assetId)
    .order("ts", { ascending: false })
    .limit(5);

  if (decisions && decisions.length >= 3) {
    const avgConsensus = decisions.reduce((s, d) => s + Number(d.consensus_score), 0) / decisions.length;
    const avgAgreement = decisions.reduce((s, d) => s + Number(d.agreement_score), 0) / decisions.length;
    metrics.avg_consensus = avgConsensus;
    metrics.avg_agreement = avgAgreement;

    if (avgConsensus < INTEGRITY_COLLAPSE_THRESHOLD) {
      causeScores.source_divergence = Math.min(35, (INTEGRITY_COLLAPSE_THRESHOLD - avgConsensus) * 100);
    }
  }

  // 3) Data gap
  const { data: lastDecision } = await supabase
    .from("paper_decisions")
    .select("ts")
    .eq("asset_id", assetId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastDecision) {
    const hoursSince = (Date.now() - new Date(lastDecision.ts).getTime()) / (1000 * 60 * 60);
    metrics.hours_since_decision = hoursSince;
    if (hoursSince > DATA_GAP_HOURS) {
      causeScores.liquidity_collapse = Math.min(25, (hoursSince - DATA_GAP_HOURS) * 3);
    }
  }

  // 4) Anomaly events active count
  const { count } = await supabase
    .from("anomaly_events")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", assetId)
    .eq("resolved", false);
  metrics.active_anomalies = count || 0;
  if ((count || 0) >= 3) {
    causeScores.derivatives_stress = Math.min(20, (count || 0) * 5);
  }

  // Aggregate score (0–100)
  const rawScore = Object.values(causeScores).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.max(0, rawScore));

  // Proposed state
  let proposedState = "NORMAL";
  if (score >= HALT_TH) proposedState = "HALT";
  else if (score >= WARN_TH) proposedState = "WARN";

  // Top 3 root causes
  const rootCauses = (Object.entries(causeScores) as Array<[RootCause, number]>)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cause, contribution]) => ({ cause, contribution }));

  // Store RT sample
  await supabase.from("anomaly_rt_samples").insert({
    asset_id: assetId,
    anomaly_score: score,
    proposed_state: proposedState,
    root_causes_json: rootCauses,
    metrics_json: metrics,
  });

  return { score, proposedState, rootCauses, metrics };
}

// ─── STATE STABILIZATION (K-BAR SMOOTHING) ─────────────────────
async function stabilize(assetId: string, rtResult: {
  score: number;
  proposedState: string;
  rootCauses: Array<{ cause: string; contribution: number }>;
}): Promise<{
  stableState: string;
  stableScore: number;
  transitioned: boolean;
  previousState: string;
  cooldownActive: boolean;
}> {
  // Get or create stable state
  let { data: state } = await supabase
    .from("anomaly_stable_state")
    .select("*")
    .eq("asset_id", assetId)
    .maybeSingle();

  if (!state) {
    const { data: newState } = await supabase
      .from("anomaly_stable_state")
      .insert({ asset_id: assetId })
      .select()
      .single();
    state = newState;
  }

  if (!state) throw new Error("Failed to get/create stable state");

  const previousState = state.stable_state;
  const prevScore = Number(state.stable_score);

  // EMA smoothed score
  const stableScore = EMA_ALPHA * rtResult.score + (1 - EMA_ALPHA) * prevScore;

  // Update consecutive counters
  let cWarn = rtResult.proposedState === "WARN" || rtResult.proposedState === "HALT" ? state.consecutive_warn + 1 : 0;
  let cHalt = rtResult.proposedState === "HALT" ? state.consecutive_halt + 1 : 0;
  let cNormal = rtResult.proposedState === "NORMAL" ? state.consecutive_normal + 1 : 0;

  // Reset non-matching counters
  if (rtResult.proposedState === "NORMAL") { cWarn = 0; cHalt = 0; }
  if (rtResult.proposedState === "WARN") { cHalt = 0; cNormal = 0; }
  if (rtResult.proposedState === "HALT") { cNormal = 0; }

  // Check cooldown
  const now = new Date();
  const cooldownActive = state.cooldown_until && new Date(state.cooldown_until) > now;

  // Determine stable state with K-bar logic
  let newStableState = previousState;

  if (cooldownActive) {
    // During cooldown, treat as WARN
    newStableState = "WARN";
  } else {
    // Promotion logic
    if (previousState === "NORMAL" && cWarn >= K_WARN) {
      newStableState = "WARN";
    }
    if ((previousState === "NORMAL" || previousState === "WARN") && cHalt >= K_HALT) {
      newStableState = "HALT";
    }

    // Clearing logic
    if (previousState === "HALT" && cNormal >= K_CLEAR) {
      // Enter cooldown after HALT clears
      newStableState = "WARN";
      const cooldownEnd = new Date(now.getTime() + N_COOLDOWN_RT * 60 * 1000); // assuming 1min RT
      await supabase.from("anomaly_stable_state").update({
        cooldown_until: cooldownEnd.toISOString(),
        cooldown_reason: "HALT_CLEAR",
      }).eq("asset_id", assetId);
    }
    if (previousState === "WARN" && cNormal >= K_CLEAR) {
      newStableState = "NORMAL";
    }
  }

  const transitioned = newStableState !== previousState;

  // Compute policy adjustments
  const policyAdjustments: Record<string, unknown> = {};
  if (newStableState === "WARN") {
    policyAdjustments.agreement_min_delta = 5;
    policyAdjustments.consensus_min_delta = 5;
    policyAdjustments.completeness_min_delta = 5;
    policyAdjustments.learning_rate_multiplier = 0.5;
    policyAdjustments.max_boost_reduction = 1;
  } else if (newStableState === "HALT") {
    policyAdjustments.new_trades_paused = true;
    policyAdjustments.learning_frozen = true;
  }

  // Update stable state
  await supabase.from("anomaly_stable_state").update({
    stable_state: newStableState,
    stable_score: stableScore,
    consecutive_warn: cWarn,
    consecutive_halt: cHalt,
    consecutive_normal: cNormal,
    root_causes_json: rtResult.rootCauses,
    policy_adjustments_json: policyAdjustments,
    last_transition_at: transitioned ? now.toISOString() : state.last_transition_at,
    updated_at: now.toISOString(),
  }).eq("asset_id", assetId);

  // If HALT, apply instant system_status update
  if (newStableState === "HALT") {
    await supabase.from("system_status").upsert({
      asset_id: assetId,
      output_mode: "ESCALATED",
      anomaly_halt: true,
      learning_frozen: true,
      last_anomaly_check: now.toISOString(),
      reason: "HALT: " + rtResult.rootCauses.map(r => r.cause).join(", "),
      updated_at: now.toISOString(),
    }, { onConflict: "asset_id" });
  } else if (newStableState === "WARN") {
    await supabase.from("system_status").upsert({
      asset_id: assetId,
      output_mode: "CAUTION",
      anomaly_halt: false,
      learning_frozen: false,
      last_anomaly_check: now.toISOString(),
      reason: "WARN: " + rtResult.rootCauses.map(r => r.cause).join(", "),
      updated_at: now.toISOString(),
    }, { onConflict: "asset_id" });
  } else {
    await supabase.from("system_status").upsert({
      asset_id: assetId,
      output_mode: "NORMAL",
      anomaly_halt: false,
      learning_frozen: false,
      last_anomaly_check: now.toISOString(),
      reason: null,
      updated_at: now.toISOString(),
    }, { onConflict: "asset_id" });
  }

  return { stableState: newStableState, stableScore, transitioned, previousState, cooldownActive: !!cooldownActive };
}

// ─── FULL RT CYCLE ──────────────────────────────────────────────
async function runRTCycle(assetId: string) {
  const rtResult = await rtSense(assetId);
  const stabilized = await stabilize(assetId, rtResult);

  // Log anomaly events for new detections
  if (stabilized.transitioned && stabilized.stableState !== "NORMAL") {
    await supabase.from("anomaly_events").insert({
      asset_id: assetId,
      event_type: `STATE_${stabilized.stableState}`,
      severity: stabilized.stableState === "HALT" ? "critical" : "warn",
      description: `State transition: ${stabilized.previousState} → ${stabilized.stableState} (score: ${rtResult.score.toFixed(1)})`,
      metrics_json: { ...rtResult.metrics, root_causes: rtResult.rootCauses },
    });
  }

  return {
    rt: rtResult,
    stable: stabilized,
  };
}

// ─── GET STABLE STATUS (enhanced) ──────────────────────────────
async function getStatus(asset_id = "GLOBAL") {
  const { data: status } = await supabase
    .from("system_status")
    .select("*")
    .eq("asset_id", asset_id)
    .maybeSingle();

  const { data: globalStatus } = asset_id !== "GLOBAL"
    ? await supabase.from("system_status").select("*").eq("asset_id", "GLOBAL").maybeSingle()
    : { data: null };

  const { data: stableState } = asset_id !== "GLOBAL"
    ? await supabase.from("anomaly_stable_state").select("*").eq("asset_id", asset_id).maybeSingle()
    : { data: null };

  const { data: recentAnomalies } = await supabase
    .from("anomaly_events")
    .select("*")
    .or(`asset_id.eq.${asset_id},asset_id.eq.GLOBAL`)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(20);

  // Effective mode
  const modes = ["NORMAL", "CAUTION", "ESCALATED"];
  const assetMode = status?.output_mode || "NORMAL";
  const globalMode = globalStatus?.output_mode || "NORMAL";
  const effectiveMode = modes[Math.max(modes.indexOf(assetMode), modes.indexOf(globalMode))];

  // Map stable state to display state
  let displayState = stableState?.stable_state || "NORMAL";
  const cooldownUntil = stableState?.cooldown_until;
  const cooldownActive = cooldownUntil && new Date(cooldownUntil) > new Date();
  if (cooldownActive) displayState = "COOLDOWN";

  return {
    status: status || { asset_id, output_mode: "NORMAL", anomaly_halt: false, learning_frozen: false },
    globalStatus: globalStatus || null,
    effectiveMode,
    activeAnomalies: recentAnomalies || [],
    learningFrozen: status?.learning_frozen || globalStatus?.learning_frozen || false,
    // v1.6.1a additions
    stableState: stableState || null,
    displayState,
    stableScore: stableState ? Number(stableState.stable_score) : 0,
    rootCauses: stableState?.root_causes_json || [],
    policyAdjustments: stableState?.policy_adjustments_json || {},
    cooldownActive: !!cooldownActive,
    cooldownUntil: cooldownUntil || null,
  };
}

// ─── GET RT TIMELINE ────────────────────────────────────────────
async function getRTTimeline(assetId: string, limit = 30) {
  const { data, error } = await supabase
    .from("anomaly_rt_samples")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── LEGACY: CHECK ANOMALIES ────────────────────────────────────
async function checkAnomalies(assets: string[]) {
  const results = [];
  for (const asset of assets) {
    const cycleResult = await runRTCycle(asset);
    results.push({ asset_id: asset, ...cycleResult });
  }
  return results;
}

// ─── RESOLVE ANOMALY ────────────────────────────────────────────
async function resolveAnomaly(anomalyId: string) {
  const { error } = await supabase.from("anomaly_events").update({
    resolved: true,
    resolved_at: new Date().toISOString(),
  }).eq("id", anomalyId);
  if (error) throw error;
  return { resolved: true };
}

// ─── PROMOTE PATTERNS ───────────────────────────────────────────
async function promotePatterns(asset_id: string, timeframe = "4h") {
  const { data: patterns } = await supabase
    .from("indicator_patterns")
    .select("id, asset_id, timeframe, regime_label, diracc_uplift, ev_uplift, stability_score, confidence_tier, is_active, support_n_decisions")
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("is_active", true);

  if (!patterns?.length) return { promoted: 0, validated: 0, expired: 0 };

  let promoted = 0, validated = 0, expired = 0;

  for (const pattern of patterns) {
    let { data: tier } = await supabase
      .from("pattern_tiers")
      .select("*")
      .eq("pattern_id", pattern.id)
      .maybeSingle();

    if (!tier) {
      const { data: newTier } = await supabase.from("pattern_tiers").insert({
        pattern_id: pattern.id,
        asset_id: pattern.asset_id,
        tier: "candidate",
        regime_context: pattern.regime_label,
      }).select().single();
      tier = newTier;
    }

    if (!tier) continue;

    const stillValid = pattern.stability_score >= 0.7 && pattern.diracc_uplift > 0.03;

    if (stillValid) {
      const newPasses = tier.validation_passes + 1;
      if (newPasses >= PATTERN_VALIDATION_PASSES_FOR_PROMOTED && tier.tier !== "promoted") {
        await supabase.from("pattern_tiers").update({ tier: "promoted", promoted_at: new Date().toISOString(), validation_passes: newPasses, last_check_ts: new Date().toISOString() }).eq("id", tier.id);
        promoted++;
      } else if (newPasses >= PATTERN_VALIDATION_PASSES_FOR_VALIDATED && tier.tier === "candidate") {
        await supabase.from("pattern_tiers").update({ tier: "validated", validated_at: new Date().toISOString(), validation_passes: newPasses, last_check_ts: new Date().toISOString() }).eq("id", tier.id);
        validated++;
      } else {
        await supabase.from("pattern_tiers").update({ validation_passes: newPasses, last_check_ts: new Date().toISOString() }).eq("id", tier.id);
      }
    } else {
      const newFailures = tier.validation_failures + 1;
      if (newFailures >= PATTERN_FAILURE_THRESHOLD) {
        await supabase.from("pattern_tiers").update({ tier: "expired", expired_at: new Date().toISOString(), validation_failures: newFailures, last_check_ts: new Date().toISOString() }).eq("id", tier.id);
        await supabase.from("indicator_patterns").update({ is_active: false }).eq("id", pattern.id);
        expired++;
      } else {
        await supabase.from("pattern_tiers").update({ validation_failures: newFailures, last_check_ts: new Date().toISOString() }).eq("id", tier.id);
      }
    }
  }

  return { promoted, validated, expired };
}

// ─── FETCH PATTERN TIERS ────────────────────────────────────────
async function fetchPatternTiers(asset_id?: string) {
  let query = supabase.from("pattern_tiers").select("*, indicator_patterns(*)").order("created_at", { ascending: false });
  if (asset_id) query = query.eq("asset_id", asset_id);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data || [];
}

// ─── FETCH ANOMALY HISTORY ──────────────────────────────────────
async function fetchAnomalyHistory(asset_id?: string, limit = 50) {
  let query = supabase.from("anomaly_events").select("*").order("created_at", { ascending: false });
  if (asset_id) query = query.eq("asset_id", asset_id);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── MAIN HANDLER ───────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";
    const asset = url.searchParams.get("asset");
    const timeframe = url.searchParams.get("timeframe") || "4h";

    let result: unknown;

    switch (action) {
      case "status":
        result = await getStatus(asset || "GLOBAL");
        break;

      case "rt-sense":
        if (!asset) throw new Error("asset required");
        result = await runRTCycle(asset);
        break;

      case "rt-timeline":
        if (!asset) throw new Error("asset required");
        result = await getRTTimeline(asset, parseInt(url.searchParams.get("limit") || "30"));
        break;

      case "check-anomalies": {
        const assets = asset ? [asset] : ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];
        result = await checkAnomalies(assets);
        break;
      }

      case "resolve-anomaly": {
        const anomalyId = url.searchParams.get("anomaly_id");
        if (!anomalyId) throw new Error("anomaly_id required");
        result = await resolveAnomaly(anomalyId);
        break;
      }

      case "promote-patterns":
        if (!asset) throw new Error("asset required");
        result = await promotePatterns(asset, timeframe);
        break;

      case "pattern-tiers":
        result = await fetchPatternTiers(asset || undefined);
        break;

      case "anomaly-history":
        result = await fetchAnomalyHistory(asset || undefined);
        break;

      default:
        throw new Error("Unknown action: " + action);
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Safety engine error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
