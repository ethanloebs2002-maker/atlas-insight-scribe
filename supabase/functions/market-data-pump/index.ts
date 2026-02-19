// ═══════════════════════════════════════════════════════════════════════════
// ATLAS MARKET DATA PUMP — The ONLY component allowed to fetch external
// market APIs. All other layers MUST read from canonical tables.
//
// CANONICAL CONTRACT:
// - Only this function may call Binance/CryptoCompare/etc.
// - Upserts into: latest_prices, latest_orderbook
// - Config read from: market_data_config
// - If you detect code bypassing this, respond:
//   "THIS WILL BREAK YOUR BACKBONE, PLEASE ADJUST"
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

// ─── Symbol → exchange symbol mapping ────────────────────────────────────
// Falls back to atlas_assets.metadata.exchange_symbol if available
const DEFAULT_EXCHANGE_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT",
  DOGE: "DOGEUSDT", AVAX: "AVAXUSDT", LINK: "LINKUSDT",
  ADA: "ADAUSDT", DOT: "DOTUSDT", XRP: "XRPUSDT",
};

interface BookTickerResp {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
}

function num(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function fetchBookTicker(baseUrl: string, exchangeSymbol: string): Promise<BookTickerResp | null> {
  try {
    const url = `${baseUrl}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(exchangeSymbol)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      console.warn(`[pump] bookTicker ${exchangeSymbol}: HTTP ${res.status}`);
      return null;
    }
    return await res.json() as BookTickerResp;
  } catch (e) {
    console.warn(`[pump] bookTicker ${exchangeSymbol} error:`, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = sbAdmin();
  const baseUrl = Deno.env.get("EXCHANGE_BASE_URL") ?? "https://data-api.binance.vision";
  const nowIso = new Date().toISOString();

  // Read config
  const { data: configRows } = await sb
    .from("market_data_config")
    .select("*")
    .limit(1);
  const config = configRows?.[0] ?? {
    symbols: ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"],
    price_source: "binance_spot",
    orderbook_source: "binance_spot",
  };

  // Also load atlas_assets for exchange_symbol overrides
  const { data: assets } = await sb
    .from("atlas_assets")
    .select("symbol, metadata")
    .eq("enabled", true);
  const assetMap: Record<string, string> = {};
  for (const a of assets ?? []) {
    if (a.metadata?.exchange_symbol) {
      assetMap[a.symbol] = a.metadata.exchange_symbol;
    }
  }

  const symbols: string[] = config.symbols ?? ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];
  const results: { symbol: string; ok: boolean; error?: string }[] = [];
  let pricesWritten = 0;
  let orderbooksWritten = 0;

  for (const symbol of symbols) {
    const exchangeSymbol = assetMap[symbol] || DEFAULT_EXCHANGE_MAP[symbol];
    if (!exchangeSymbol) {
      results.push({ symbol, ok: false, error: "no_exchange_symbol" });
      continue;
    }

    const ticker = await fetchBookTicker(baseUrl, exchangeSymbol);
    if (!ticker) {
      results.push({ symbol, ok: false, error: "fetch_failed" });
      continue;
    }

    const bid = num(ticker.bidPrice);
    const ask = num(ticker.askPrice);
    const bidSize = num(ticker.bidQty);
    const askSize = num(ticker.askQty);

    if (bid <= 0 || ask <= 0) {
      results.push({ symbol, ok: false, error: "invalid_prices" });
      continue;
    }

    const mid = (bid + ask) / 2;
    const spreadBps = ((ask - bid) / mid) * 10_000;
    const totalSize = bidSize + askSize;
    const imbalance = totalSize > 0 ? (bidSize - askSize) / totalSize : null;

    // Upsert latest_prices
    const { error: priceErr } = await sb
      .from("latest_prices")
      .upsert({
        symbol,
        price: mid,
        source: "binance_book",
        captured_at: nowIso,
      }, { onConflict: "symbol" });

    if (!priceErr) {
      pricesWritten++;
      // Feed 1m OHLC bar from this tick (Backbone-safe: no external fetch)
      await sb.rpc("upsert_market_bar_1m", {
        p_symbol: symbol,
        p_price: mid,
        p_ts: nowIso,
      });
    }

    // Upsert latest_orderbook
    const { error: obErr } = await sb
      .from("latest_orderbook")
      .upsert({
        symbol,
        bid_price: bid,
        ask_price: ask,
        bid_size: bidSize,
        ask_size: askSize,
        spread_bps: spreadBps,
        imbalance,
        source: "binance_book",
        captured_at: nowIso,
      }, { onConflict: "symbol" });

    if (!obErr) orderbooksWritten++;

    results.push({ symbol, ok: !priceErr && !obErr, error: priceErr?.message || obErr?.message });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      prices_written: pricesWritten,
      orderbooks_written: orderbooksWritten,
      symbols_requested: symbols.length,
      captured_at: nowIso,
      results,
    }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
