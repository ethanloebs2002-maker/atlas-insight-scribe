/**
 * ATLAS Strategy Feature Extraction — BACKBONE SAFE
 * Reads ONLY from canonical tables (latest_prices, latest_orderbook).
 * NO external API fetches.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface FeatureVector {
  symbol: string;
  mid: number | null;
  bid: number | null;
  ask: number | null;
  spread_bps: number | null;
  imbalance: number | null;
  price_age_ms: number;
  ob_age_ms: number;
  stale_for_exec: boolean;
  stale_for_ui: boolean;
  session_bucket: string;
  vol_regime: string | null;
  captured_at: string | null;
}

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function getSessionBucket(utcHour: number): string {
  if (utcHour >= 0 && utcHour < 8) return "asia";
  if (utcHour >= 7 && utcHour < 9) return "asia_europe_overlap";
  if (utcHour >= 8 && utcHour < 16) return "europe";
  if (utcHour >= 13 && utcHour < 17) return "overlap";
  if (utcHour >= 14 && utcHour < 21) return "us";
  return "off_hours";
}

export async function getMarketState(sb: ReturnType<typeof sbAdmin>, symbol: string): Promise<FeatureVector> {
  const now = Date.now();
  const utcHour = new Date().getUTCHours();

  const [priceRes, obRes, configRes] = await Promise.all([
    sb.from("latest_prices").select("*").eq("symbol", symbol).maybeSingle(),
    sb.from("latest_orderbook").select("*").eq("symbol", symbol).maybeSingle(),
    sb.from("market_data_config").select("stale_ms_exec,stale_ms_ui").limit(1).maybeSingle(),
  ]);

  const config = configRes.data ?? { stale_ms_exec: 1500, stale_ms_ui: 5000 };
  const p = priceRes.data;
  const ob = obRes.data;

  const priceAge = p ? now - new Date(p.captured_at).getTime() : Infinity;
  const obAge = ob ? now - new Date(ob.captured_at).getTime() : Infinity;

  // Try to get vol_regime from latest market_context_snapshots
  const mcRes = await sb.from("market_context_snapshots")
    .select("vol_regime")
    .eq("symbol", symbol)
    .order("snapshot_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    symbol,
    mid: p?.price ?? null,
    bid: ob?.bid_price ?? null,
    ask: ob?.ask_price ?? null,
    spread_bps: ob?.spread_bps ?? null,
    imbalance: ob?.imbalance ?? null,
    price_age_ms: priceAge === Infinity ? 999999 : priceAge,
    ob_age_ms: obAge === Infinity ? 999999 : obAge,
    stale_for_exec: priceAge > config.stale_ms_exec || obAge > config.stale_ms_exec,
    stale_for_ui: priceAge > config.stale_ms_ui || obAge > config.stale_ms_ui,
    session_bucket: getSessionBucket(utcHour),
    vol_regime: mcRes.data?.vol_regime ?? null,
    captured_at: p?.captured_at ?? ob?.captured_at ?? null,
  };
}

export function createSbAdmin() {
  return sbAdmin();
}
