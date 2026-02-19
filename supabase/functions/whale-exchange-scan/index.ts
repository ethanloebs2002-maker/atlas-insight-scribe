/**
 * ATLAS Whale Exchange Scanner
 *
 * COLOSSAL PATCH:
 * - Paginated aggTrades to prevent silent misses during high activity
 * - Quote volume (kline[7]) for accurate notional on VOLUME_SPIKE
 * - Concurrency limiter to avoid rate-limit stampede
 * - Dedupe keys on all signals
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getEnabledAssets,
  insertSignals,
  logRunFinish,
  logRunStart,
  severityFromNotional,
  type WhaleSignalInsert,
} from "../_shared/whale.ts";

type AggTrade = { p: string; q: string; T: number; a?: number };
type Kline = any[]; // Binance returns 12 fields; quote volume at [7]

function num(s: any) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// Lightweight concurrency limiter
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Paginated aggTrades fetcher.
 * Binance aggTrades doesn't give a "next" token; we walk by time.
 */
async function fetchAggTradesWindow(baseUrl: string, symbol: string, startTime: number, endTime: number, maxPages = 6) {
  const all: AggTrade[] = [];
  let cursor = startTime;
  for (let page = 0; page < maxPages; page++) {
    const url = `${baseUrl}/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&startTime=${cursor}&endTime=${endTime}&limit=1000`;
    const trades = await fetchJson<AggTrade[]>(url);
    if (!trades.length) break;
    all.push(...trades);

    const lastT = trades[trades.length - 1]?.T ?? cursor;
    const nextCursor = Math.max(cursor + 1, lastT + 1);
    if (nextCursor >= endTime) break;
    cursor = nextCursor;

    if (trades.length < 1000) break;
  }
  return all;
}

async function scanAsset(baseUrl: string, exchangeSymbol: string, atlasSymbol: string, minUsd: number) {
  const now = Date.now();
  const sinceMs = now - 5 * 60 * 1000; // 5-min window, paginated

  const trades = await fetchAggTradesWindow(baseUrl, exchangeSymbol, sinceMs, now, 8);

  const signals: WhaleSignalInsert[] = [];

  for (const t of trades) {
    const price = num(t.p);
    const qty = num(t.q);
    const notional = price * qty;

    if (notional >= minUsd) {
      const eventIso = new Date(t.T).toISOString();
      signals.push({
        symbol: atlasSymbol,
        source: "exchange",
        chain: null,
        signal_type: "LARGE_TRADE",
        event_time: eventIso,
        observed_price: price,
        notional_usd: notional,
        severity: severityFromNotional(notional, minUsd),
        metadata: {
          exchange_symbol: exchangeSymbol,
          price, qty,
          since_ms: sinceMs,
          dedupe_key: `${atlasSymbol}|exchange|LARGE_TRADE|${eventIso}|${Math.round(notional)}|${Math.round(price * 1e4)}`,
        },
      });
    }
  }

  // Volume spike: use quote-volume (kline[7]) when available
  const klineUrl = `${baseUrl}/api/v3/klines?symbol=${encodeURIComponent(exchangeSymbol)}&interval=1m&limit=25`;
  const klines = await fetchJson<Kline[]>(klineUrl);

  if (klines.length >= 22) {
    const baseline = klines.slice(0, -1).slice(-20);

    const baselineQuote = baseline.map(k => num(k?.[7]));
    const baselineBase = baseline.map(k => num(k?.[5]));

    const last = klines[klines.length - 1];
    const lastQuoteVol = num(last?.[7]);
    const lastBaseVol = num(last?.[5]);
    const close = num(last?.[4]);

    // Prefer quote volume (USD-denominated) over base volume
    const vols = baselineQuote.some(v => v > 0) ? baselineQuote : baselineBase;
    const lastVol = baselineQuote.some(v => v > 0) ? lastQuoteVol : lastBaseVol;

    const mean = vols.reduce((a, b) => a + b, 0) / Math.max(1, vols.length);
    const variance = vols.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vols.length);
    const std = Math.sqrt(variance);

    const z = std > 0 ? (lastVol - mean) / std : 0;
    const ratio = mean > 0 ? lastVol / mean : 0;

    const approxNotional = lastQuoteVol > 0 ? lastQuoteVol : close * lastBaseVol;
    const openTime = Number(last?.[0] ?? now);
    const eventIso = new Date(openTime).toISOString();

    if ((z >= 3 || ratio >= 5) && approxNotional >= minUsd) {
      const sev = Math.max(0, Math.min(1, Math.max(z / 6, Math.log2(Math.max(1, ratio)) / 4)));
      signals.push({
        symbol: atlasSymbol,
        source: "exchange",
        chain: null,
        signal_type: "VOLUME_SPIKE",
        event_time: eventIso,
        observed_price: close,
        notional_usd: approxNotional,
        severity: sev,
        metadata: {
          exchange_symbol: exchangeSymbol,
          z, ratio, mean, std,
          last_quote_vol: lastQuoteVol,
          last_base_vol: lastBaseVol,
          dedupe_key: `${atlasSymbol}|exchange|VOLUME_SPIKE|${eventIso}|${Math.round(approxNotional)}|${Math.round(close * 1e4)}`,
        },
      });
    }
  }

  return signals;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const runId = await logRunStart("exchange", { invoked_by: "http", at: new Date().toISOString() });
  const baseUrl = Deno.env.get("EXCHANGE_BASE_URL") ?? "https://data-api.binance.vision";

  try {
    const assets = await getEnabledAssets();

    const perAsset = await mapLimit(
      assets.filter(a => a?.metadata?.exchange_symbol),
      Number(Deno.env.get("WHALE_SCAN_CONCURRENCY") ?? 3),
      async (a) => {
        const exSymbol = a.metadata?.exchange_symbol;
        if (!exSymbol) return [];
        return await scanAsset(baseUrl, exSymbol, a.symbol, Number(a.whale_min_usd_exchange));
      }
    );

    const allSignals = perAsset.flat();
    const emitted = await insertSignals(allSignals);
    await logRunFinish(runId, "OK", emitted, undefined, { baseUrl, assets_scanned: perAsset.length });

    return new Response(JSON.stringify({ ok: true, emitted, baseUrl }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    await logRunFinish(runId, "ERROR", 0, String((e as Error)?.message ?? e), { baseUrl });
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
