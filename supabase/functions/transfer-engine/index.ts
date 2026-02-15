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

const SIMILARITY_THRESHOLD = 0.80;
const TRANSFER_WEIGHT_FACTOR = 0.3;
const MAX_CONTRADICTION_COUNT = 3;
const CONFIDENCE_CAP = 0.85;

// ─── COMPUTE FINGERPRINT ────────────────────────────────────────
async function computeFingerprint(asset_id: string, timeframe = "4h") {
  // Fetch klines + analysis from crypto-data
  const res = await fetch(
    `${supabaseUrl}/functions/v1/crypto-data?action=analysis&symbols=${asset_id}`,
    { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")! } }
  );
  if (!res.ok) throw new Error(`Failed to fetch analysis for ${asset_id}`);
  const json = await res.json();
  const data = json.data;
  if (!data) throw new Error(`No analysis data for ${asset_id}`);

  const evidence = data.scenarios?.[0]?.evidence || [];
  const findSignal = (name: string) => evidence.find((e: any) => e.signal === name);

  const rsiSignal = findSignal("RSI");
  const macdSignal = findSignal("MACD");
  const atrSignal = findSignal("ATR");
  const bbSignal = findSignal("Bollinger Width");
  const volSignal = findSignal("Relative Volume");
  const regimeSignal = findSignal("Trend Regime");

  const rsiVal = rsiSignal ? parseFloat(rsiSignal.value) : 50;
  const macdVal = macdSignal ? parseFloat(macdSignal.value.replace("+", "").replace("$", "")) : 0;
  const atrVal = atrSignal ? parseFloat(atrSignal.value.replace("$", "").replace(",", "")) : 0;
  const volVal = volSignal ? parseFloat(volSignal.value.replace("x", "")) : 1;
  const regime = regimeSignal?.value || "Unknown";

  const price = data.asset?.price || 1;
  const atrNorm = atrVal / price;
  const change24h = data.asset?.change24h || 0;

  // Normalize features to 0-1 range
  const volatilityRank = Math.min(1, atrNorm / 0.05);
  const momentumScore = (rsiVal - 30) / 40; // 30-70 → 0-1
  const trendStrength = Math.min(1, Math.abs(change24h) / 5);
  const volumeProfile = Math.min(1, volVal / 2);
  const meanReversionScore = rsiVal < 35 || rsiVal > 65 ? 1 - Math.abs(rsiVal - 50) / 50 : 0.5;
  const macdTrend = Math.tanh(macdVal / (price * 0.001));
  const bbWidth = bbSignal?.value === "Narrow" ? 0.2 : bbSignal?.value === "Wide" ? 0.8 : 0.5;

  const fingerprint = [
    volatilityRank, momentumScore, trendStrength,
    volumeProfile, meanReversionScore, macdTrend,
    bbWidth, atrNorm * 10, rsiVal / 100
  ];

  const { error } = await supabase.from("asset_fingerprints").upsert({
    asset_id, timeframe,
    volatility_rank: volatilityRank,
    momentum_score: momentumScore,
    trend_strength: trendStrength,
    volume_profile: volumeProfile,
    mean_reversion_score: meanReversionScore,
    correlation_btc: 0, // Would need BTC correlation data
    regime_label: regime,
    atr_normalized: atrNorm,
    rsi_avg: rsiVal,
    macd_trend: macdTrend,
    fingerprint_vector: fingerprint,
    computed_at: new Date().toISOString(),
  }, { onConflict: "asset_id,timeframe" });

  if (error) throw error;
  return { asset_id, fingerprint, regime };
}

// ─── COMPUTE ALL FINGERPRINTS ───────────────────────────────────
async function computeAllFingerprints(assets: string[], timeframe = "4h") {
  const results = [];
  for (const asset of assets) {
    try {
      const fp = await computeFingerprint(asset, timeframe);
      results.push(fp);
    } catch (e) {
      console.error(`Fingerprint error for ${asset}:`, e);
      results.push({ asset_id: asset, error: (e as Error).message });
    }
  }
  return results;
}

// ─── FIND DONORS ────────────────────────────────────────────────
async function findDonors(target_asset: string, timeframe = "4h") {
  const { data, error } = await supabase.rpc("find_similar_assets", {
    p_asset_id: target_asset,
    p_timeframe: timeframe,
    p_threshold: SIMILARITY_THRESHOLD,
  });
  if (error) throw error;
  
  // Filter: only graduated + stable donors
  return (data || []).filter((d: any) => d.graduation_level >= 1 && d.is_stable);
}

// ─── APPLY TRANSFER ─────────────────────────────────────────────
async function applyTransfer(target_asset: string, timeframe = "4h") {
  // Safety: check target's integrity gating
  const { data: targetGrad } = await supabase
    .from("graduation_status")
    .select("*")
    .eq("asset_id", target_asset)
    .eq("timeframe", timeframe)
    .limit(1);

  const targetStatus = targetGrad?.[0];
  if (targetStatus && !targetStatus.integrity_gating_pass) {
    return { error: "Transfer disabled: integrity gating failed for target", target_asset };
  }

  const donors = await findDonors(target_asset, timeframe);
  if (!donors.length) {
    return { donors: 0, message: "No eligible donors found above threshold" };
  }

  // Get target's local decision count
  const { count: localDecisions } = await supabase
    .from("paper_decisions")
    .select("*", { count: "exact", head: true })
    .eq("asset_id", target_asset);

  const applied = [];
  for (const donor of donors) {
    // Compute initial transfer weight
    const initialWeight = TRANSFER_WEIGHT_FACTOR * donor.similarity;
    
    // Get donor's graduation data for signal weights
    const { data: donorGrad } = await supabase
      .from("graduation_status")
      .select("*")
      .eq("asset_id", donor.asset_id)
      .eq("timeframe", timeframe);

    const donorStatus = donorGrad?.[0];
    if (!donorStatus) continue;

    // Build transfer priors from donor's performance
    const signalWeights = {
      ema_cross: 0.8 * initialWeight,
      rsi: 0.6 * initialWeight,
      macd: 0.7 * initialWeight,
      volume: 0.5 * initialWeight,
      atr: 0.5 * initialWeight,
    };

    const regimeMap = {
      Trending: { weight_boost: 1.1 * initialWeight },
      Ranging: { weight_boost: 0.9 * initialWeight },
      Choppy: { weight_boost: 0.7 * initialWeight },
    };

    // Apply confidence cap
    const cappedWeight = Math.min(initialWeight, CONFIDENCE_CAP);

    const { error } = await supabase.from("transfer_priors").upsert({
      target_asset,
      donor_asset: donor.asset_id,
      timeframe,
      similarity_score: donor.similarity,
      transfer_weight: cappedWeight,
      initial_transfer_weight: cappedWeight,
      local_decisions_at_transfer: localDecisions || 0,
      current_local_decisions: localDecisions || 0,
      signal_weights_json: signalWeights,
      regime_map_json: regimeMap,
      atr_sizing_json: { scale_factor: cappedWeight },
      calibration_shape_json: { dir_acc: donorStatus.dir_acc, avg_r: donorStatus.avg_return_r },
      integrity_pass: true,
      discarded: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "target_asset,donor_asset,timeframe" });

    if (error) {
      console.error("Transfer upsert error:", error);
      continue;
    }

    applied.push({
      donor: donor.asset_id,
      similarity: donor.similarity,
      transfer_weight: cappedWeight,
    });
  }

  return { donors: applied.length, applied };
}

// ─── DECAY TRANSFER WEIGHTS ────────────────────────────────────
async function decayTransfers(target_asset?: string) {
  let query = supabase
    .from("transfer_priors")
    .select("*")
    .eq("discarded", false);
  
  if (target_asset) query = query.eq("target_asset", target_asset);

  const { data: priors, error } = await query;
  if (error) throw error;
  if (!priors?.length) return { decayed: 0 };

  let decayed = 0;
  for (const prior of priors) {
    // Get current local decision count
    const { count: currentLocal } = await supabase
      .from("paper_decisions")
      .select("*", { count: "exact", head: true })
      .eq("asset_id", prior.target_asset);

    // Compute decayed weight using DB function
    const { data: decayResult } = await supabase.rpc("compute_transfer_decay", {
      initial_weight: prior.initial_transfer_weight,
      local_decisions_at_transfer: prior.local_decisions_at_transfer,
      current_local_decisions: currentLocal || 0,
    });

    const newWeight = decayResult || 0;

    // Discard if weight is negligible
    if (newWeight < 0.01) {
      await supabase.from("transfer_priors").update({
        discarded: true,
        discard_reason: "Weight decayed below threshold",
        transfer_weight: 0,
        current_local_decisions: currentLocal || 0,
        updated_at: new Date().toISOString(),
      }).eq("id", prior.id);
    } else {
      await supabase.from("transfer_priors").update({
        transfer_weight: newWeight,
        current_local_decisions: currentLocal || 0,
        last_decay_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", prior.id);
    }
    decayed++;
  }

  return { decayed };
}

// ─── CHECK CONTRADICTIONS ───────────────────────────────────────
async function checkContradictions(target_asset: string, timeframe = "4h") {
  const { data: priors } = await supabase
    .from("transfer_priors")
    .select("*")
    .eq("target_asset", target_asset)
    .eq("timeframe", timeframe)
    .eq("discarded", false);

  if (!priors?.length) return { checked: 0 };

  // Get recent local decisions that were evaluated
  const { data: localDecisions } = await supabase
    .from("paper_decisions")
    .select("*")
    .eq("asset_id", target_asset)
    .not("evaluated_at", "is", null)
    .order("ts", { ascending: false })
    .limit(20);

  if (!localDecisions?.length) return { checked: 0, message: "No evaluated local decisions" };

  const localDirAcc = localDecisions.filter(d => d.correct).length / localDecisions.length;
  let discarded = 0;

  for (const prior of priors) {
    const donorCalibration = prior.calibration_shape_json as any;
    if (!donorCalibration?.dir_acc) continue;

    // Contradiction: local outcomes significantly disagree with donor's calibration
    const donorDirAcc = Number(donorCalibration.dir_acc);
    const disagreement = Math.abs(localDirAcc - donorDirAcc);

    if (disagreement > 0.15) {
      const newCount = (prior.contradiction_count || 0) + 1;
      if (newCount >= MAX_CONTRADICTION_COUNT) {
        await supabase.from("transfer_priors").update({
          discarded: true,
          discard_reason: `Contradiction with local outcomes (local DirAcc: ${(localDirAcc * 100).toFixed(1)}%, donor: ${(donorDirAcc * 100).toFixed(1)}%)`,
          contradiction_count: newCount,
          updated_at: new Date().toISOString(),
        }).eq("id", prior.id);
        discarded++;
      } else {
        await supabase.from("transfer_priors").update({
          contradiction_count: newCount,
          updated_at: new Date().toISOString(),
        }).eq("id", prior.id);
      }
    }
  }

  return { checked: priors.length, discarded };
}

// ─── FETCH TRANSFER STATUS ─────────────────────────────────────
async function fetchTransferStatus(target_asset?: string) {
  let priorsQuery = supabase.from("transfer_priors").select("*").order("updated_at", { ascending: false });
  let fingerprintsQuery = supabase.from("asset_fingerprints").select("*");

  if (target_asset) {
    priorsQuery = priorsQuery.eq("target_asset", target_asset);
  }

  const [priors, fingerprints] = await Promise.all([priorsQuery, fingerprintsQuery]);

  // Compute local vs transfer influence per asset
  const influenceMap: Record<string, any> = {};
  for (const prior of priors.data || []) {
    if (!influenceMap[prior.target_asset]) {
      influenceMap[prior.target_asset] = { localWeight: 1, transferWeight: 0, donors: [] };
    }
    if (!prior.discarded) {
      influenceMap[prior.target_asset].transferWeight += prior.transfer_weight;
      influenceMap[prior.target_asset].donors.push({
        donor: prior.donor_asset,
        similarity: prior.similarity_score,
        weight: prior.transfer_weight,
        initialWeight: prior.initial_transfer_weight,
        decay: prior.initial_transfer_weight > 0 ? prior.transfer_weight / prior.initial_transfer_weight : 0,
        contradictions: prior.contradiction_count,
        discarded: prior.discarded,
        discardReason: prior.discard_reason,
      });
    }
  }

  // Normalize influence
  for (const asset in influenceMap) {
    const total = influenceMap[asset].localWeight + influenceMap[asset].transferWeight;
    influenceMap[asset].localPct = (influenceMap[asset].localWeight / total) * 100;
    influenceMap[asset].transferPct = (influenceMap[asset].transferWeight / total) * 100;
  }

  return {
    priors: priors.data || [],
    fingerprints: fingerprints.data || [],
    influenceMap,
  };
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

    if (action === "compute-fingerprints") {
      const assets = (url.searchParams.get("assets") || "BTC,ETH,SOL,DOGE,AVAX,LINK").split(",");
      const results = await computeAllFingerprints(assets);
      return new Response(JSON.stringify({ data: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "find-donors") {
      if (!asset) throw new Error("asset parameter required");
      const donors = await findDonors(asset);
      return new Response(JSON.stringify({ data: donors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "apply-transfer") {
      if (!asset) throw new Error("asset parameter required");
      const result = await applyTransfer(asset);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decay") {
      const result = await decayTransfers(asset || undefined);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check-contradictions") {
      if (!asset) throw new Error("asset parameter required");
      const result = await checkContradictions(asset);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const result = await fetchTransferStatus(asset || undefined);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Transfer engine error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
