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

const TF_SET = ["1m", "5m", "15m", "1h", "4h", "1d"];
const MIN_TF_TRADES = 30;
const MAX_EVALS_PER_TICK = 6;
const EPSILON_INITIAL = 0.20;
const EPSILON_FLOOR = 0.05;

// ─── BEST TIMEFRAME SELECTION ─────────────────────────────────────
async function selectBestTimeframe(assetId: string, defaultTf: string): Promise<{ timeframe: string; mode: "EXPLOIT" | "EXPLORE"; score: number }> {
  // Fetch timeframe stats for this asset
  const { data: stats } = await supabase
    .from("timeframe_stats")
    .select("*")
    .eq("asset_id", assetId);

  const tfStats = stats || [];

  // Compute total trades across all TFs for epsilon decay
  const totalTrades = tfStats.reduce((s, t) => s + (t.trades_n || 0), 0);
  const epsilon = Math.max(EPSILON_FLOOR, EPSILON_INITIAL * Math.pow(0.5, totalTrades / 200));

  // Find best TF by success_likelihood_score
  const mature = tfStats.filter(t => (t.trades_n || 0) >= MIN_TF_TRADES);
  let bestTf = defaultTf;
  let bestScore = 0;

  if (mature.length > 0) {
    const sorted = [...mature].sort((a, b) => (b.success_likelihood_score || 0) - (a.success_likelihood_score || 0));
    bestTf = sorted[0].timeframe;
    bestScore = sorted[0].success_likelihood_score || 0;
  }

  // Exploration: with probability epsilon, pick a different TF
  if (Math.random() < epsilon) {
    // Pick least-sampled TF
    const existing = new Map(tfStats.map(t => [t.timeframe, t.trades_n || 0]));
    let minSamples = Infinity;
    let exploreTf = defaultTf;
    for (const tf of TF_SET) {
      const n = existing.get(tf) ?? 0;
      if (tf !== bestTf && n < minSamples) {
        minSamples = n;
        exploreTf = tf;
      }
    }
    return { timeframe: exploreTf, mode: "EXPLORE", score: bestScore };
  }

  return { timeframe: bestTf, mode: "EXPLOIT", score: bestScore };
}

// ─── UPDATE TIMEFRAME STATS ──────────────────────────────────────
async function updateTimeframeStats(assetId: string, timeframe: string) {
  // Get closed trades for this asset + timeframe
  const { data: trades } = await supabase
    .from("paper_trades")
    .select("outcome_label, return_r, ts_closed")
    .eq("asset_id", assetId)
    .eq("timeframe", timeframe)
    .eq("status", "CLOSED");

  const all = trades || [];
  const tradesN = all.length;
  const winsN = all.filter(t => t.outcome_label === "WIN").length;
  const winRate = tradesN > 0 ? winsN / tradesN : 0;

  // Recent window: last 20 trades
  const sorted = [...all].sort((a, b) =>
    new Date(b.ts_closed || 0).getTime() - new Date(a.ts_closed || 0).getTime()
  );
  const recent = sorted.slice(0, 20);
  const recentWins = recent.filter(t => t.outcome_label === "WIN").length;
  const winRateRecent = recent.length > 0 ? recentWins / recent.length : 0;

  // EV mean
  const returns = all.filter(t => t.return_r !== null).map(t => Number(t.return_r));
  const evMean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

  // Drift flag: recent win rate significantly below lifetime
  const driftFlag = tradesN >= MIN_TF_TRADES && winRateRecent < winRate - 0.1;

  // Compute SuccessLikelihoodScore
  const samplePenalty = tradesN < MIN_TF_TRADES ? 0.3 : 0;
  const driftPenalty = driftFlag ? 0.15 : 0;
  const score = Math.max(0,
    (winRateRecent * 0.6 + winRate * 0.4)
    + (evMean > 0 ? Math.min(0.2, evMean * 0.1) : 0)
    - samplePenalty
    - driftPenalty
  );

  await supabase.from("timeframe_stats").upsert({
    asset_id: assetId,
    timeframe,
    trades_n: tradesN,
    wins_n: winsN,
    win_rate: winRate,
    win_rate_recent: winRateRecent,
    ev_mean: evMean,
    drift_flag: driftFlag,
    success_likelihood_score: score,
    last_updated_ts: new Date().toISOString(),
  }, { onConflict: "asset_id,timeframe" });

  return { tradesN, winsN, winRate, winRateRecent, evMean, score };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "tick";

    // ── TICK: Run auto-evaluation for incorporated assets ──
    if (action === "tick") {
      const { data: assets } = await supabase
        .from("incorporated_assets")
        .select("*")
        .eq("is_enabled", true);

      if (!assets?.length) {
        return new Response(JSON.stringify({ data: { message: "No enabled assets", evaluated: 0 } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: any[] = [];
      const batch = assets.slice(0, MAX_EVALS_PER_TICK);

      for (const asset of batch) {
        try {
          // 1. Update timeframe stats for all known TFs
          for (const tf of TF_SET) {
            await updateTimeframeStats(asset.asset_id, tf);
          }

          // 2. Select best timeframe
          const { timeframe, mode, score } = await selectBestTimeframe(asset.asset_id, asset.default_timeframe);

          // 3. Call paper-engine evaluate
          const evalRes = await fetch(
            `${supabaseUrl}/functions/v1/paper-engine?action=evaluate&asset=${asset.asset_id}&timeframe=${timeframe}&emitted_by=AUTO_EVAL`,
            {
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
            }
          );
          const evalJson = await evalRes.json();

          // 4. Update the evaluation_runs row with mode/tf metadata
          if (evalJson.data?.run_id) {
            await supabase.from("evaluation_runs").update({
              evaluation_mode: mode,
              chosen_timeframe: timeframe,
              best_tf_score: score,
            }).eq("run_id", evalJson.data.run_id);
          }

          results.push({
            asset_id: asset.asset_id,
            timeframe,
            mode,
            score,
            decision_type: evalJson.data?.decision_type,
            run_id: evalJson.data?.run_id,
          });
        } catch (err) {
          results.push({
            asset_id: asset.asset_id,
            error: (err as Error).message,
          });
        }
      }

      return new Response(JSON.stringify({ data: { evaluated: results.length, results } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STATS: Get timeframe stats for an asset ──
    if (action === "tf-stats") {
      const asset = url.searchParams.get("asset");
      let query = supabase.from("timeframe_stats").select("*").order("success_likelihood_score", { ascending: false });
      if (asset) query = query.eq("asset_id", asset);
      const { data } = await query;
      return new Response(JSON.stringify({ data: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── BEST-TF: Get best timeframe for an asset ──
    if (action === "best-tf") {
      const asset = url.searchParams.get("asset");
      if (!asset) throw new Error("asset parameter required");

      const { data: assetRow } = await supabase
        .from("incorporated_assets")
        .select("default_timeframe")
        .eq("asset_id", asset)
        .maybeSingle();

      const defaultTf = assetRow?.default_timeframe || "4h";
      const result = await selectBestTimeframe(asset, defaultTf);

      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ASSETS: List incorporated assets ──
    if (action === "assets") {
      const { data } = await supabase.from("incorporated_assets").select("*").order("asset_id");
      return new Response(JSON.stringify({ data: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE-TF-STATS: Manually trigger stats refresh ──
    if (action === "update-tf-stats") {
      const asset = url.searchParams.get("asset");
      if (!asset) throw new Error("asset parameter required");
      const results: any[] = [];
      for (const tf of TF_SET) {
        const r = await updateTimeframeStats(asset, tf);
        results.push({ timeframe: tf, ...r });
      }
      return new Response(JSON.stringify({ data: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-eval error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
