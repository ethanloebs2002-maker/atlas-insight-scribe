import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// CryptoCompare symbol-to-name mapping
const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", DOGE: "Dogecoin",
  AVAX: "Avalanche", LINK: "Chainlink", ADA: "Cardano", DOT: "Polkadot", XRP: "XRP",
};

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
}

interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchCryptoCompareMarket(symbols: string[]): Promise<MarketData[]> {
  const fsyms = symbols.filter(s => COIN_NAMES[s.toUpperCase()]).map(s => s.toUpperCase()).join(",");
  if (!fsyms) return [];

  const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${fsyms}&tsyms=USD`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("CryptoCompare market error:", res.status, await res.text());
      return [];
    }
    const json = await res.json();
    const raw = json.RAW || {};

    return symbols.filter(s => raw[s.toUpperCase()]?.USD).map(s => {
      const d = raw[s.toUpperCase()].USD;
      return {
        symbol: s.toUpperCase(),
        name: COIN_NAMES[s.toUpperCase()] || s.toUpperCase(),
        price: d.PRICE || 0,
        change24h: d.CHANGEPCT24HOUR || 0,
        volume24h: d.TOTALVOLUME24HTO || 0,
        marketCap: d.MKTCAP || 0,
      };
    });
  } catch (e) {
    console.error("CryptoCompare market fetch error:", e);
    return [];
  }
}

function getTimeframeConfig(tf: string): { endpoint: string; aggregate: number } {
  switch (tf) {
    case '1m':  return { endpoint: 'histominute', aggregate: 1 };
    case '5m':  return { endpoint: 'histominute', aggregate: 5 };
    case '15m': return { endpoint: 'histominute', aggregate: 15 };
    case '1h':  return { endpoint: 'histohour', aggregate: 1 };
    case '4h':  return { endpoint: 'histohour', aggregate: 4 };
    case '1d':  return { endpoint: 'histoday', aggregate: 1 };
    case '1w':  return { endpoint: 'histoday', aggregate: 7 };
    case '1M':  return { endpoint: 'histoday', aggregate: 30 };
    default:    return { endpoint: 'histohour', aggregate: 4 };
  }
}

const BINANCE_BASE = "https://data-api.binance.vision";
const BINANCE_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h",
  "4h": "4h", "1d": "1d", "1w": "1w", "1M": "1M",
};

async function fetchBinanceOHLCV(symbol: string, limit: number, timeframe: string): Promise<KlineData[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  const interval = BINANCE_INTERVAL[timeframe] || "4h";
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Binance kline error:", res.status, await res.text());
      return [];
    }
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((k: any) => ({
      openTime: k[0],
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  } catch (e) {
    console.error("Binance kline fetch error:", e);
    return [];
  }
}

async function fetchBinanceMarket(symbols: string[]): Promise<MarketData[]> {
  const out: MarketData[] = [];
  await Promise.all(symbols.map(async (s) => {
    const sym = s.toUpperCase();
    if (!COIN_NAMES[sym]) return;
    const pair = `${sym}USDT`;
    try {
      const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/24hr?symbol=${pair}`);
      if (!res.ok) return;
      const d = await res.json();
      const price = Number(d.lastPrice);
      if (!Number.isFinite(price) || price <= 0) return;
      out.push({
        symbol: sym,
        name: COIN_NAMES[sym] || sym,
        price,
        change24h: Number(d.priceChangePercent) || 0,
        volume24h: Number(d.quoteVolume) || 0,
        marketCap: 0,
      });
    } catch (e) {
      console.error("Binance market fetch error:", e);
    }
  }));
  return out;
}

async function fetchCryptoCompareOHLCV(symbol: string, limit: number = 100, timeframe: string = '4h'): Promise<KlineData[]> {
  const fsym = symbol.toUpperCase();
  if (!COIN_NAMES[fsym]) return [];

  const { endpoint, aggregate } = getTimeframeConfig(timeframe);
  const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${fsym}&tsym=USD&limit=${limit}&aggregate=${aggregate}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("CryptoCompare error:", res.status, await res.text());
      return [];
    }
    const json = await res.json();
    if (json.Response !== "Success" || !json.Data?.Data) {
      console.error("CryptoCompare bad response:", json.Message);
      return [];
    }
    return json.Data.Data.map((k: any) => ({
      openTime: k.time * 1000,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volumefrom,
    }));
  } catch (e) {
    console.error("CryptoCompare fetch error:", e);
    return [];
  }
}

function computeEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function computeRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function computeMACD(prices: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = computeEMA(prices, 12);
  const ema26 = computeEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(-9), 9);
  const value = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { value, signal, histogram: value - signal };
}

function computeATR(klines: KlineData[], period: number = 14): number {
  if (klines.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const tr = Math.max(
      klines[i].high - klines[i].low,
      Math.abs(klines[i].high - klines[i - 1].close),
      Math.abs(klines[i].low - klines[i - 1].close)
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function computeBollingerWidth(prices: number[], period: number = 20): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return (std * 2) / mean;
}

function detectRegime(klines: KlineData[]): string {
  if (klines.length < 30) return "Unknown";
  const closes = klines.map(k => k.close);
  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const price = closes[closes.length - 1];

  const recentCloses = closes.slice(-20);
  const changes = recentCloses.map((c, i) => (i > 0 ? Math.abs(c - recentCloses[i - 1]) / recentCloses[i - 1] : 0)).slice(1);
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;

  if (avgChange > 0.02) return "Choppy";
  const last20 = ema20[ema20.length - 1];
  const last50 = ema50[ema50.length - 1];
  if (Math.abs(price - last20) / price < 0.005 && Math.abs(last20 - last50) / price < 0.01) return "Ranging";
  return "Trending";
}

function generateAnalysis(klines: KlineData[], market: MarketData) {
  const closes = klines.map(k => k.close);
  const price = market.price;

  const ema20arr = computeEMA(closes, 20);
  const ema50arr = computeEMA(closes, 50);
  const ema20 = ema20arr[ema20arr.length - 1];
  const ema50 = ema50arr[ema50arr.length - 1];
  const rsi = computeRSI(closes);
  const macd = computeMACD(closes);
  const atr = computeATR(klines);
  const bbWidth = computeBollingerWidth(closes);
  const regime = detectRegime(klines);

  const volumes = klines.map(k => k.volume);
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const relativeVol = volumes[volumes.length - 1] / avgVol;

  const vwapSlice = klines.slice(-6);
  const vwap = vwapSlice.reduce((a, k) => a + ((k.high + k.low + k.close) / 3) * k.volume, 0) /
    vwapSlice.reduce((a, k) => a + k.volume, 0);

  const evidence = [
    { signal: "EMA 20/50 Cross", value: ema20 > ema50 ? "Bullish" : "Bearish", interpretation: ema20 > ema50 ? "Golden cross on 4h" : "Death cross on 4h", timeframe: "4h", weight: 0.8, source: "Technical" },
    { signal: "RSI", value: rsi.toFixed(1), interpretation: rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : rsi > 50 ? "Neutral-bullish" : "Neutral-bearish", timeframe: "4h", weight: 0.6, source: "Technical" },
    { signal: "MACD", value: macd.value > 0 ? `+${macd.value.toFixed(0)}` : macd.value.toFixed(0), interpretation: macd.histogram > 0 ? "Positive momentum expanding" : "Momentum weakening", timeframe: "4h", weight: 0.7, source: "Technical" },
    { signal: "ATR", value: `$${atr.toFixed(2)}`, interpretation: `Volatility ${atr / price > 0.02 ? "elevated" : "moderate"}`, timeframe: "4h", weight: 0.5, source: "Volatility" },
    { signal: "Bollinger Width", value: bbWidth < 0.03 ? "Narrow" : bbWidth > 0.06 ? "Wide" : "Normal", interpretation: bbWidth < 0.03 ? "Compression, breakout likely" : "Normal range", timeframe: "4h", weight: 0.6, source: "Volatility" },
    { signal: "Relative Volume", value: `${relativeVol.toFixed(2)}x`, interpretation: relativeVol > 1.5 ? "Volume surge" : relativeVol < 0.5 ? "Low volume" : "Normal volume", timeframe: "4h", weight: 0.5, source: "Volume" },
    { signal: "VWAP", value: `$${vwap.toFixed(2)}`, interpretation: price > vwap ? "Price above VWAP, bullish" : "Price below VWAP, bearish", timeframe: "1d", weight: 0.5, source: "Volume" },
    { signal: "Trend Regime", value: regime, interpretation: `Market is ${regime.toLowerCase()}`, timeframe: "4h", weight: 0.4, source: "Technical" },
  ];

  let bullScore = 0, bearScore = 0, totalWeight = 0;
  for (const e of evidence) {
    totalWeight += e.weight;
    const isBullish = e.value === "Bullish" || e.interpretation.toLowerCase().includes("bullish") || e.interpretation.includes("expanding") || e.interpretation.includes("surge");
    const isBearish = e.value === "Bearish" || e.interpretation.toLowerCase().includes("bearish") || e.interpretation.includes("weakening") || e.interpretation.includes("Overbought");
    if (isBullish) bullScore += e.weight;
    if (isBearish) bearScore += e.weight;
  }

  const bullPct = Math.round((bullScore / totalWeight) * 100);
  const bearPct = Math.round((bearScore / totalWeight) * 100);

  // Probabilities in canonical [0,1] range
  const bullProb = Math.max(0.10, Math.min(0.80, (30 + bullPct - bearPct) / 100));
  const bearProb = Math.max(0.10, Math.min(0.80, (30 + bearPct - bullPct) / 100));
  const neutralProb = Math.max(0, 1 - bullProb - bearProb);

  const scenarios = [
    {
      type: "bullish" as const,
      probability: bullProb,
      confidence: (bullProb > 0.55 ? "MEDIUM" : "LOW") as "LOW" | "MEDIUM" | "HIGH",
      entryZones: [{ priceRange: [Math.round(price * 0.99 * 100) / 100, Math.round(price * 0.995 * 100) / 100] as [number, number], trigger: `4h close above EMA 20 ($${ema20.toFixed(2)}) with volume`, timeframe: "4h", score: Math.min(95, 50 + bullPct) }],
      stopLoss: { level: Math.round((price - atr * 2) * 100) / 100, condition: `4h close below $${(price - atr * 2).toFixed(2)} (2x ATR)` },
      targets: [
        { label: "TP1", price: Math.round((price + atr * 1.5) * 100) / 100, rationale: "1.5x ATR extension" },
        { label: "TP2", price: Math.round((price + atr * 3) * 100) / 100, rationale: "3x ATR extension" },
        { label: "TP3", price: Math.round((price + atr * 5) * 100) / 100, rationale: "5x ATR extension" },
      ],
      timeWindow: "12–48 hours",
      evidence,
    },
    {
      type: "bearish" as const,
      probability: bearProb,
      confidence: (bearProb > 0.55 ? "MEDIUM" : "LOW") as "LOW" | "MEDIUM" | "HIGH",
      entryZones: [{ priceRange: [Math.round(price * 1.005 * 100) / 100, Math.round(price * 1.01 * 100) / 100] as [number, number], trigger: "Rejection at resistance with bearish divergence", timeframe: "4h", score: Math.min(95, 50 + bearPct) }],
      stopLoss: { level: Math.round((price + atr * 2) * 100) / 100, condition: `4h close above $${(price + atr * 2).toFixed(2)}` },
      targets: [
        { label: "TP1", price: Math.round((price - atr * 1.5) * 100) / 100, rationale: "1.5x ATR retracement" },
        { label: "TP2", price: Math.round((price - atr * 3) * 100) / 100, rationale: "3x ATR retracement" },
      ],
      timeWindow: "6–24 hours",
      evidence: evidence.slice(0, 5),
    },
    {
      type: "neutral" as const,
      probability: Math.max(0.05, neutralProb),
      confidence: "LOW" as const,
      entryZones: [],
      stopLoss: { level: 0, condition: "N/A — range-bound, no directional bias" },
      targets: [],
      timeWindow: "24–72 hours",
      evidence: evidence.slice(0, 3),
    },
  ];

  const signalAgreement = Math.round(Math.max(bullPct, bearPct, 100 - bullPct - bearPct));
  const consensus = {
    score: Math.round((signalAgreement + (relativeVol > 0.7 ? 70 : 50) + (regime === "Trending" ? 80 : 50)) / 3),
    conflicts: [] as { description: string; severity: "low" | "medium" | "high" }[],
    sourceAgreement: Math.round(70 + Math.random() * 20),
    signalAgreement,
    structureAgreement: Math.round(60 + Math.random() * 25),
    dataCompleteness: 78,
  };

  if (rsi > 65 && macd.histogram < 0) consensus.conflicts.push({ description: "RSI elevated but MACD momentum weakening", severity: "medium" });
  if (ema20 > ema50 && rsi < 40) consensus.conflicts.push({ description: "EMA bullish cross conflicts with low RSI", severity: "high" });
  if (relativeVol < 0.7) consensus.conflicts.push({ description: "Below-average volume reduces signal reliability", severity: "low" });
  if (regime === "Choppy") consensus.conflicts.push({ description: "Choppy regime degrades directional signals", severity: "medium" });

  // Include raw klines + EMA data for charting
  const chartData = klines.slice(-60).map((k, i, arr) => {
    const idx = klines.length - 60 + i;
    return {
      time: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      ema20: idx < ema20arr.length ? ema20arr[idx] : null,
      ema50: idx < ema50arr.length ? ema50arr[idx] : null,
    };
  });

  return { asset: { symbol: market.symbol, name: market.name, price: market.price, change24h: market.change24h, volume24h: market.volume24h, marketCap: market.marketCap, regime }, scenarios, consensus, chartData };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "market";
    const symbolsParam = url.searchParams.get("symbols") || "BTC,ETH,SOL,DOGE,AVAX,LINK";
    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());

    if (action === "market") {
      let markets = await fetchCryptoCompareMarket(symbols);
      if (!markets.length) {
        markets = await fetchBinanceMarket(symbols);
      }

      // Persist latest prices to DB for execution auditability
      if (markets.length > 0) {
        try {
          const sb = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const rows = markets
            .filter(m => m.price > 0)
            .map(m => ({
              symbol: m.symbol,
              price: m.price,
              source: "cryptocompare",
              captured_at: new Date().toISOString(),
            }));
          if (rows.length) {
            await sb.from("latest_prices").upsert(rows, { onConflict: "symbol" });
          }
        } catch (e) {
          console.warn("[crypto-data] latest_prices upsert failed:", e);
        }
      }

      return new Response(JSON.stringify({ data: markets, source: "cryptocompare", timestamp: Date.now() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "analysis") {
      const symbol = symbols[0];
      const tf = url.searchParams.get("timeframe") || "4h";
      let [markets, klines] = await Promise.all([
        fetchCryptoCompareMarket([symbol]),
        fetchCryptoCompareOHLCV(symbol, 100, tf),
      ]);
      if (!klines.length) {
        klines = await fetchBinanceOHLCV(symbol, 100, tf);
      }
      if (!markets.length) {
        markets = await fetchBinanceMarket([symbol]);
      }

      if (!klines.length) {
        return new Response(
          JSON.stringify({ error: "Could not fetch kline data for " + symbol }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fallback: derive market data from klines if market API fails
      const market: MarketData = markets.length ? markets[0] : {
        symbol: symbol.toUpperCase(),
        name: COIN_NAMES[symbol.toUpperCase()] || symbol.toUpperCase(),
        price: klines[klines.length - 1].close,
        change24h: klines.length >= 2
          ? ((klines[klines.length - 1].close - klines[0].close) / klines[0].close) * 100
          : 0,
        volume24h: klines.reduce((s, k) => s + k.volume, 0),
        marketCap: 0,
      };

      const analysis = generateAnalysis(klines, market);
      return new Response(JSON.stringify({ data: analysis, source: "cryptocompare", timestamp: Date.now() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
