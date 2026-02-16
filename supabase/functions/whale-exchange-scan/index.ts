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

type AggTrade = { p: string; q: string; T: number };
type Kline = [number, string, string, string, string, string];

function num(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function scanAsset(baseUrl: string, exchangeSymbol: string, minUsd: number) {
  const now = Date.now();
  const sinceMs = now - 10 * 60 * 1000;
  const tradesUrl = `${baseUrl}/api/v3/aggTrades?symbol=${encodeURIComponent(exchangeSymbol)}&startTime=${sinceMs}&limit=1000`;
  const trades = await fetchJson<AggTrade[]>(tradesUrl);

  const signals: WhaleSignalInsert[] = [];
  for (const t of trades) {
    const price = num(t.p);
    const qty = num(t.q);
    const notional = price * qty;
    if (notional >= minUsd) {
      signals.push({
        symbol: exchangeSymbol.replace("USDT", ""),
        source: "exchange",
        chain: null,
        signal_type: "LARGE_TRADE",
        event_time: new Date(t.T).toISOString(),
        observed_price: price,
        notional_usd: notional,
        severity: severityFromNotional(notional, minUsd),
        metadata: { exchange_symbol: exchangeSymbol, price, qty, since_ms: sinceMs },
      });
    }
  }

  const klineUrl = `${baseUrl}/api/v3/klines?symbol=${encodeURIComponent(exchangeSymbol)}&interval=1m&limit=25`;
  const klines = await fetchJson<Kline[]>(klineUrl);

  if (klines.length >= 22) {
    const vols = klines.slice(0, -1).map((k) => num(k[5]));
    const last = klines[klines.length - 1];
    const lastVol = num(last[5]);

    const baseline = vols.slice(-20);
    const mean = baseline.reduce((a, b) => a + b, 0) / Math.max(1, baseline.length);
    const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, baseline.length);
    const std = Math.sqrt(variance);

    const z = std > 0 ? (lastVol - mean) / std : 0;
    const ratio = mean > 0 ? lastVol / mean : 0;

    const close = num(last[4]);
    const approxNotional = close * lastVol;

    if ((z >= 3 || ratio >= 5) && approxNotional >= minUsd) {
      const openTime = last[0];
      signals.push({
        symbol: exchangeSymbol.replace("USDT", ""),
        source: "exchange",
        chain: null,
        signal_type: "VOLUME_SPIKE",
        event_time: new Date(openTime).toISOString(),
        observed_price: close,
        notional_usd: approxNotional,
        severity: Math.max(0, Math.min(1, Math.max(z / 6, Math.log2(Math.max(1, ratio)) / 4))),
        metadata: { exchange_symbol: exchangeSymbol, z, ratio, mean, std, lastVol },
      });
    }
  }

  return signals;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = await logRunStart("exchange", { invoked_by: "http", at: new Date().toISOString() });
  const baseUrl = Deno.env.get("EXCHANGE_BASE_URL") ?? "https://api.binance.com";

  try {
    const assets = await getEnabledAssets();
    const allSignals: WhaleSignalInsert[] = [];

    for (const a of assets) {
      const exSymbol = a.metadata?.exchange_symbol;
      if (!exSymbol) continue;

      const signals = await scanAsset(baseUrl, exSymbol, Number(a.whale_min_usd_exchange));
      for (const s of signals) s.symbol = a.symbol;
      allSignals.push(...signals);
    }

    const emitted = await insertSignals(allSignals);
    await logRunFinish(runId, "OK", emitted, undefined, { baseUrl });

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
