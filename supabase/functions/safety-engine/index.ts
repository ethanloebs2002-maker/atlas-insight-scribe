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

// ─── THRESHOLDS ───────────────────────────────────────────────────
const VOLATILITY_SPIKE_MULTIPLIER = 2.5; // ATR spike vs rolling avg
const INTEGRITY_COLLAPSE_THRESHOLD = 0.3; // consensus below this
const DATA_GAP_HOURS = 6; // no data for this long
const CAUTION_ANOMALY_COUNT = 2;
const ESCALATED_ANOMALY_COUNT = 4;
const PATTERN_VALIDATION_PASSES_FOR_VALIDATED = 3;
const PATTERN_VALIDATION_PASSES_FOR_PROMOTED = 5;
const PATTERN_FAILURE_THRESHOLD = 3;

// ─── GET SYSTEM STATUS ───────────────────────────────────────────
async function getStatus(asset_id = "GLOBAL") {
  const { data: status } = await supabase
    .from("system_status")
    .select("*")
    .eq("asset_id", asset_id)
    .maybeSingle();

  const { data: globalStatus } = asset_id !== "GLOBAL"
    ? await supabase.from("system_status").select("*").eq("asset_id", "GLOBAL").maybeSingle()
    : { data: null };

  const { data: recentAnomalies } = await supabase
    .from("anomaly_events")
    .select("*")
    .or(`asset_id.eq.${asset_id},asset_id.eq.GLOBAL`)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(20);

  // Effective mode: take the worse of global and asset-specific
  const modes = ["NORMAL", "CAUTION", "ESCALATED"];
  const assetMode = status?.output_mode || "NORMAL";
  const globalMode = globalStatus?.output_mode || "NORMAL";
  const effectiveMode = modes[Math.max(modes.indexOf(assetMode), modes.indexOf(globalMode))];

  return {
    status: status || { asset_id, output_mode: "NORMAL", anomaly_halt: false, learning_frozen: false },
    globalStatus: globalStatus || null,
    effectiveMode,
    activeAnomalies: recentAnomalies || [],
    learningFrozen: status?.learning_frozen || globalStatus?.learning_frozen || false,
  };
}

// ─── CHECK ANOMALIES ─────────────────────────────────────────────
async function checkAnomalies(assets: string[]) {
  const results: Array<{ asset_id: string; events: any[] }> = [];

  for (const asset_id of assets) {
    const events: any[] = [];

    // 1) Volatility spike: compare recent ATR to rolling average
    const { data: fingerprints } = await supabase
      .from("asset_fingerprints")
      .select("atr_normalized, volatility_rank, regime_label, computed_at")
      .eq("asset_id", asset_id)
      .order("computed_at", { ascending: false })
      .limit(10);

    if (fingerprints && fingerprints.length >= 2) {
      const latest = Number(fingerprints[0].atr_normalized);
      const avgATR = fingerprints.slice(1).reduce((s, f) => s + Number(f.atr_normalized), 0)
        / (fingerprints.length - 1);

      if (avgATR > 0 && latest / avgATR > VOLATILITY_SPIKE_MULTIPLIER) {
        events.push({
          event_type: "VOLATILITY_SPIKE",
          severity: latest / avgATR > 4 ? "critical" : "warn",
          description: `ATR spike: ${latest.toFixed(4)} vs avg ${avgATR.toFixed(4)} (${(latest / avgATR).toFixed(1)}x)`,
          metrics_json: { current_atr: latest, avg_atr: avgATR, ratio: latest / avgATR },
        });
      }

      // 2) Regime break: check if regime changed from previous
      if (fingerprints.length >= 2 && fingerprints[0].regime_label !== fingerprints[1].regime_label) {
        events.push({
          event_type: "REGIME_BREAK",
          severity: "warn",
          description: `Regime changed: ${fingerprints[1].regime_label} → ${fingerprints[0].regime_label}`,
          metrics_json: { from: fingerprints[1].regime_label, to: fingerprints[0].regime_label },
        });
      }
    }

    // 3) Data gap: check last decision timestamp
    const { data: lastDecision } = await supabase
      .from("paper_decisions")
      .select("ts")
      .eq("asset_id", asset_id)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastDecision) {
      const hoursSince = (Date.now() - new Date(lastDecision.ts).getTime()) / (1000 * 60 * 60);
      if (hoursSince > DATA_GAP_HOURS) {
        events.push({
          event_type: "DATA_GAP",
          severity: hoursSince > 24 ? "critical" : "warn",
          description: `No decisions for ${hoursSince.toFixed(1)}h (threshold: ${DATA_GAP_HOURS}h)`,
          metrics_json: { hours_since: hoursSince },
        });
      }
    }

    // 4) Integrity collapse: check recent decisions' consensus
    const { data: recentDecisions } = await supabase
      .from("paper_decisions")
      .select("consensus_score, agreement_score")
      .eq("asset_id", asset_id)
      .order("ts", { ascending: false })
      .limit(5);

    if (recentDecisions && recentDecisions.length >= 3) {
      const avgConsensus = recentDecisions.reduce((s, d) => s + Number(d.consensus_score), 0)
        / recentDecisions.length;
      if (avgConsensus < INTEGRITY_COLLAPSE_THRESHOLD) {
        events.push({
          event_type: "INTEGRITY_COLLAPSE",
          severity: "critical",
          description: `Avg consensus ${(avgConsensus * 100).toFixed(0)}% across last ${recentDecisions.length} decisions`,
          metrics_json: { avg_consensus: avgConsensus, sample: recentDecisions.length },
        });
      }
    }

    // Store events and update status
    if (events.length > 0) {
      for (const evt of events) {
        await supabase.from("anomaly_events").insert({ ...evt, asset_id });
      }
    }

    // Count active (unresolved) anomalies
    const { count } = await supabase
      .from("anomaly_events")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", asset_id)
      .eq("resolved", false);

    const activeCount = count || 0;

    // Determine output mode
    let newMode = "NORMAL";
    let halt = false;
    let frozen = false;

    if (activeCount >= ESCALATED_ANOMALY_COUNT) {
      newMode = "ESCALATED";
      frozen = true;
    } else if (activeCount >= CAUTION_ANOMALY_COUNT) {
      newMode = "CAUTION";
    }

    // Check for critical events → auto-halt
    const hasCritical = events.some(e => e.severity === "critical");
    if (hasCritical) {
      halt = true;
      frozen = true;
      newMode = "ESCALATED";
    }

    await supabase.from("system_status").upsert({
      asset_id,
      output_mode: newMode,
      anomaly_halt: halt,
      learning_frozen: frozen,
      last_anomaly_check: new Date().toISOString(),
      escalation_count: activeCount,
      reason: events.length > 0 ? events.map(e => e.event_type).join(", ") : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "asset_id" });

    results.push({ asset_id, events });
  }

  return results;
}

// ─── RESOLVE ANOMALY ─────────────────────────────────────────────
async function resolveAnomaly(anomalyId: string) {
  const { error } = await supabase.from("anomaly_events").update({
    resolved: true,
    resolved_at: new Date().toISOString(),
  }).eq("id", anomalyId);

  if (error) throw error;
  return { resolved: true };
}

// ─── PROMOTE PATTERNS ────────────────────────────────────────────
async function promotePatterns(asset_id: string, timeframe = "4h") {
  // Get all active patterns for this asset
  const { data: patterns } = await supabase
    .from("indicator_patterns")
    .select("id, asset_id, timeframe, regime_label, diracc_uplift, ev_uplift, stability_score, confidence_tier, is_active, support_n_decisions")
    .eq("asset_id", asset_id)
    .eq("timeframe", timeframe)
    .eq("is_active", true);

  if (!patterns?.length) return { promoted: 0, validated: 0, expired: 0 };

  let promoted = 0, validated = 0, expired = 0;

  for (const pattern of patterns) {
    // Get or create tier record
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

    // Validate: check if pattern still performs well
    const stillValid = pattern.stability_score >= 0.7 && pattern.diracc_uplift > 0.03;

    if (stillValid) {
      const newPasses = tier.validation_passes + 1;

      if (newPasses >= PATTERN_VALIDATION_PASSES_FOR_PROMOTED && tier.tier !== "promoted") {
        await supabase.from("pattern_tiers").update({
          tier: "promoted",
          promoted_at: new Date().toISOString(),
          validation_passes: newPasses,
          last_check_ts: new Date().toISOString(),
        }).eq("id", tier.id);
        promoted++;
      } else if (newPasses >= PATTERN_VALIDATION_PASSES_FOR_VALIDATED && tier.tier === "candidate") {
        await supabase.from("pattern_tiers").update({
          tier: "validated",
          validated_at: new Date().toISOString(),
          validation_passes: newPasses,
          last_check_ts: new Date().toISOString(),
        }).eq("id", tier.id);
        validated++;
      } else {
        await supabase.from("pattern_tiers").update({
          validation_passes: newPasses,
          last_check_ts: new Date().toISOString(),
        }).eq("id", tier.id);
      }
    } else {
      const newFailures = tier.validation_failures + 1;
      if (newFailures >= PATTERN_FAILURE_THRESHOLD) {
        await supabase.from("pattern_tiers").update({
          tier: "expired",
          expired_at: new Date().toISOString(),
          validation_failures: newFailures,
          last_check_ts: new Date().toISOString(),
        }).eq("id", tier.id);

        // Also deactivate the pattern
        await supabase.from("indicator_patterns").update({ is_active: false }).eq("id", pattern.id);
        expired++;
      } else {
        await supabase.from("pattern_tiers").update({
          validation_failures: newFailures,
          last_check_ts: new Date().toISOString(),
        }).eq("id", tier.id);
      }
    }
  }

  return { promoted, validated, expired };
}

// ─── FETCH PATTERN TIERS ─────────────────────────────────────────
async function fetchPatternTiers(asset_id?: string) {
  let query = supabase
    .from("pattern_tiers")
    .select("*, indicator_patterns(*)")
    .order("created_at", { ascending: false });

  if (asset_id) query = query.eq("asset_id", asset_id);

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data || [];
}

// ─── FETCH ANOMALY HISTORY ───────────────────────────────────────
async function fetchAnomalyHistory(asset_id?: string, limit = 50) {
  let query = supabase
    .from("anomaly_events")
    .select("*")
    .order("created_at", { ascending: false });

  if (asset_id) query = query.eq("asset_id", asset_id);

  const { data, error } = await query.limit(limit);
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
    const action = url.searchParams.get("action") || "status";
    const asset = url.searchParams.get("asset");
    const timeframe = url.searchParams.get("timeframe") || "4h";

    if (action === "status") {
      const result = await getStatus(asset || "GLOBAL");
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check-anomalies") {
      const assets = asset ? [asset] : ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];
      const result = await checkAnomalies(assets);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resolve-anomaly") {
      const anomalyId = url.searchParams.get("anomaly_id");
      if (!anomalyId) throw new Error("anomaly_id parameter required");
      const result = await resolveAnomaly(anomalyId);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "promote-patterns") {
      if (!asset) throw new Error("asset parameter required");
      const result = await promotePatterns(asset, timeframe);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "pattern-tiers") {
      const result = await fetchPatternTiers(asset || undefined);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "anomaly-history") {
      const result = await fetchAnomalyHistory(asset || undefined);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Safety engine error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
