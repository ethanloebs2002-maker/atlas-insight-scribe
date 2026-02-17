// ═══════════════════════════════════════════════════════════════════════════
// ATLAS MARKET DATA READ — Read-only endpoint returning canonical data
// from latest_prices + latest_orderbook + staleness config.
// NO external API fetches allowed here.
//
// CANONICAL CONTRACT: This function reads ONLY from DB canonical tables.
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = sbAdmin();
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols");
  const requestedSymbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim().toUpperCase())
    : null;

  // Read config
  const { data: configRows } = await sb.from("market_data_config").select("*").limit(1);
  const config = configRows?.[0] ?? { stale_ms_exec: 1500, stale_ms_ui: 5000 };

  // Read prices
  let priceQuery = sb.from("latest_prices").select("*");
  if (requestedSymbols?.length) {
    priceQuery = priceQuery.in("symbol", requestedSymbols);
  }
  const { data: prices } = await priceQuery;

  // Read orderbook
  let obQuery = sb.from("latest_orderbook").select("*");
  if (requestedSymbols?.length) {
    obQuery = obQuery.in("symbol", requestedSymbols);
  }
  const { data: orderbooks } = await obQuery;

  const now = Date.now();
  const priceMap: Record<string, any> = {};
  for (const p of prices ?? []) {
    const ageMs = now - new Date(p.captured_at).getTime();
    priceMap[p.symbol] = {
      ...p,
      age_ms: ageMs,
      stale_for_exec: ageMs > config.stale_ms_exec,
      stale_for_ui: ageMs > config.stale_ms_ui,
    };
  }

  const obMap: Record<string, any> = {};
  for (const ob of orderbooks ?? []) {
    const ageMs = now - new Date(ob.captured_at).getTime();
    obMap[ob.symbol] = {
      ...ob,
      age_ms: ageMs,
      stale_for_exec: ageMs > config.stale_ms_exec,
      stale_for_ui: ageMs > config.stale_ms_ui,
    };
  }

  // Merge into unified response
  const allSymbols = new Set([...Object.keys(priceMap), ...Object.keys(obMap)]);
  const data = Array.from(allSymbols).map((symbol) => ({
    symbol,
    price: priceMap[symbol] ?? null,
    orderbook: obMap[symbol] ?? null,
  }));

  return new Response(
    JSON.stringify({
      ok: true,
      data,
      config: {
        stale_ms_exec: config.stale_ms_exec,
        stale_ms_ui: config.stale_ms_ui,
      },
      timestamp: now,
    }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
