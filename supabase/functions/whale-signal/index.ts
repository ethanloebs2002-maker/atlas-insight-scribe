import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Elite whale filters ─────────────────────────────────────────────────
const ELITE_CRITERIA = {
  min_win_rate: 0.58,
  min_trade_count: 50,
  min_integrity_score: 0.70,
  min_attribution_confidence: 0.75,
  max_hold_time_hours: 72,
  min_recent_activity_days: 30,
};

const TIMEFRAME_LOOKBACK: Record<string, number> = {
  "1m": 2, "5m": 6, "15m": 12, "1h": 24, "4h": 48,
  "24h": 168, "3d": 336, "1w": 720,
};

// ─── Types ───────────────────────────────────────────────────────────────
interface WhaleSignal {
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  whale_count: number;
  elite_whale_count: number;
  net_bias: number;
  avg_whale_win_rate: number;
  avg_whale_integrity: number;
  total_position_size_usd: number;
  long_position_size_usd: number;
  short_position_size_usd: number;
  top_whales: Array<{ wallet_id: string; side: string; size_usd: number; win_rate: number }>;
}

function neutralSignal(): WhaleSignal {
  return {
    direction: "NEUTRAL", confidence: 0, whale_count: 0, elite_whale_count: 0,
    net_bias: 0, avg_whale_win_rate: 0, avg_whale_integrity: 0,
    total_position_size_usd: 0, long_position_size_usd: 0, short_position_size_usd: 0,
    top_whales: [],
  };
}

// ─── Signal computation ──────────────────────────────────────────────────
async function computeWhaleSignal(assetId: string, timeframe: string): Promise<WhaleSignal> {
  console.log(`[WHALE_SIGNAL] Computing for ${assetId} ${timeframe}`);

  const { data: eliteWhales, error: whaleError } = await supabase
    .from("whale_wallets")
    .select("*")
    .eq("asset_id", assetId)
    .eq("is_active", true)
    .gte("lot_win_rate", ELITE_CRITERIA.min_win_rate)
    .gte("trade_count", ELITE_CRITERIA.min_trade_count)
    .gte("integrity_score", ELITE_CRITERIA.min_integrity_score)
    .gte("attribution_confidence", ELITE_CRITERIA.min_attribution_confidence);

  if (whaleError) {
    console.error("[WHALE_SIGNAL] Error fetching whales:", whaleError);
    return neutralSignal();
  }
  if (!eliteWhales || eliteWhales.length < 3) {
    console.log(`[WHALE_SIGNAL] Insufficient elite whales: ${eliteWhales?.length || 0}`);
    return neutralSignal();
  }

  const lookbackHours = TIMEFRAME_LOOKBACK[timeframe] || 24;
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const { data: positions, error: posError } = await supabase
    .from("whale_positions")
    .select("*")
    .in("whale_wallet_id", eliteWhales.map((w: any) => w.id))
    .eq("asset_id", assetId)
    .eq("status", "OPEN")
    .gte("opened_at", cutoff.toISOString());

  if (posError) {
    console.error("[WHALE_SIGNAL] Error fetching positions:", posError);
    return neutralSignal();
  }

  const avgWinRate = eliteWhales.reduce((s: number, w: any) => s + w.lot_win_rate, 0) / eliteWhales.length;
  const avgIntegrity = eliteWhales.reduce((s: number, w: any) => s + w.integrity_score, 0) / eliteWhales.length;

  if (!positions || positions.length === 0) {
    return {
      direction: "NEUTRAL", confidence: 0.5,
      whale_count: eliteWhales.length, elite_whale_count: eliteWhales.length,
      net_bias: 0, avg_whale_win_rate: avgWinRate, avg_whale_integrity: avgIntegrity,
      total_position_size_usd: 0, long_position_size_usd: 0, short_position_size_usd: 0,
      top_whales: [],
    };
  }

  let longSize = 0, shortSize = 0;
  const topWhales: Array<{ wallet_id: string; side: string; size_usd: number; win_rate: number }> = [];

  for (const pos of positions) {
    const whale = eliteWhales.find((w: any) => w.id === pos.whale_wallet_id);
    if (!whale) continue;
    if (pos.side === "LONG") longSize += pos.size_usd;
    else shortSize += pos.size_usd;
    topWhales.push({ wallet_id: pos.whale_wallet_id, side: pos.side, size_usd: pos.size_usd, win_rate: whale.lot_win_rate });
  }

  topWhales.sort((a, b) => b.size_usd - a.size_usd);

  const totalSize = longSize + shortSize;
  const netBias = totalSize > 0 ? (longSize - shortSize) / totalSize : 0;
  const direction = netBias > 0.1 ? "LONG" : netBias < -0.1 ? "SHORT" : "NEUTRAL";
  const agreement = Math.abs(netBias);

  const avgAgeMs = positions.reduce((s: number, p: any) => s + (Date.now() - new Date(p.opened_at).getTime()), 0) / positions.length;
  const recencyFactor = Math.exp(-avgAgeMs / (24 * 60 * 60 * 1000));
  const confidence = Math.min(0.95, agreement * avgWinRate * avgIntegrity * recencyFactor);

  console.log(`[WHALE_SIGNAL] Result:`, { direction, confidence, netBias, longSize, shortSize });

  await supabase.from("whale_signals").insert({
    asset_id: assetId, timeframe, direction, confidence,
    whale_count: eliteWhales.length, elite_whale_count: eliteWhales.length,
    net_bias: netBias, avg_whale_win_rate: avgWinRate, avg_whale_integrity: avgIntegrity,
    total_position_size_usd: totalSize, long_position_size_usd: longSize, short_position_size_usd: shortSize,
    top_whales_json: topWhales.slice(0, 5), computed_at: new Date().toISOString(), lookback_hours: lookbackHours,
  });

  return {
    direction, confidence,
    whale_count: eliteWhales.length, elite_whale_count: eliteWhales.length,
    net_bias: netBias, avg_whale_win_rate: avgWinRate, avg_whale_integrity: avgIntegrity,
    total_position_size_usd: totalSize, long_position_size_usd: longSize, short_position_size_usd: shortSize,
    top_whales: topWhales.slice(0, 5),
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const asset = url.searchParams.get("asset");
    const timeframe = url.searchParams.get("timeframe") || "4h";

    if (!asset) throw new Error("asset parameter required");

    const signal = await computeWhaleSignal(asset, timeframe);
    return new Response(JSON.stringify({ data: signal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WHALE_SIGNAL] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
