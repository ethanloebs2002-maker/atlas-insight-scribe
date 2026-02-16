import { supabaseAdmin, clamp01, type AtlasAsset } from "./whale.ts";

/**
 * Env
 * - EXCHANGE_BASE_URL (default: https://data-api.binance.vision)
 * - ORDERBOOK_LEVELS (default: 20)
 *
 * Optional IV proxy hook:
 * - IV_PROVIDER = 'deribit' | 'none' (default none)
 * - DERIBIT_IV_URL = custom endpoint you implement/proxy (optional)
 */

type DepthResp = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

type Kline = [number, string, string, string, string, string]; // openTime, o,h,l,c, volume

export type MarketContextSnapshot = {
  symbol: string;
  snapshot_time: string;
  mid_price: number | null;
  best_bid: number | null;
  best_ask: number | null;
  spread_abs: number | null;
  spread_bps: number | null;
  bid_depth_usd: number | null;
  ask_depth_usd: number | null;
  ob_imbalance: number | null;
  depth_concentration: number | null;
  rv_1h: number | null;
  rv_4h: number | null;
  rv_24h: number | null;
  atr_1h: number | null;
  atr_4h: number | null;
  vol_regime: "compression" | "normal" | "expansion" | null;
  iv_proxy: number | null;
  iv_rv_spread: number | null;
  session_primary: string;
  session_detail: string;
  session_utc_hour: number;
  metadata: Record<string, any>;
};

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function utcSessionLabel(d: Date) {
  const h = d.getUTCHours();
  const inAsia = h >= 0 && h < 8;
  const inEurope = h >= 7 && h < 15;
  const inUS = h >= 13 && h < 21;

  let primary = "OffHours";
  let detail = "OffHours";
  const overlaps = [inAsia, inEurope, inUS].filter(Boolean).length;

  if (overlaps >= 2) {
    primary = "Overlap";
    if (inAsia && inEurope) detail = "Asia→Europe";
    else if (inEurope && inUS) detail = "Europe→US";
    else detail = "Multi-Overlap";
  } else if (inAsia) {
    primary = "Asia";
    detail = "Asia";
  } else if (inEurope) {
    primary = "Europe";
    detail = "Europe";
  } else if (inUS) {
    primary = "US";
    detail = "US";
  } else {
    if (h === 6) { primary = "Asia"; detail = "Asia (late)"; }
    if (h === 8) { primary = "Europe"; detail = "Europe (open)"; }
    if (h === 12) { primary = "Europe"; detail = "Europe (late)"; }
    if (h === 13) { primary = "US"; detail = "US (open)"; }
    if (h === 21) { primary = "OffHours"; detail = "US (close)"; }
  }

  return { primary, detail, hour: h };
}

function bps(spreadAbs: number, mid: number) {
  if (!mid || mid <= 0) return null;
  return (spreadAbs / mid) * 10_000;
}

function imbalance(bidDepth: number, askDepth: number) {
  const denom = Math.max(1e-9, bidDepth + askDepth);
  return (bidDepth - askDepth) / denom;
}

function depthSumUsd(levels: [string, string][], mid: number, n: number) {
  let sum = 0;
  for (let i = 0; i < Math.min(n, levels.length); i++) {
    const px = num(levels[i][0]);
    const qty = num(levels[i][1]);
    sum += px * qty;
  }
  return sum;
}

function depthConcentration(levels: [string, string][], mid: number) {
  const top5 = depthSumUsd(levels, mid, 5);
  const top20 = depthSumUsd(levels, mid, 20);
  if (top20 <= 0) return null;
  return top5 / top20;
}

function logReturns(closes: number[]) {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) r.push(Math.log(b / a));
  }
  return r;
}

function stdev(xs: number[]) {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varr);
}

function realizedVolFromCloses(closes: number[], periodsPerDay: number) {
  const rets = logReturns(closes);
  const sd = stdev(rets);
  if (sd == null) return null;
  return sd * Math.sqrt(periodsPerDay);
}

function atrFromKlines(klines: Kline[], n: number) {
  if (klines.length < n + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const prevClose = num(klines[i - 1][4]);
    const high = num(klines[i][2]);
    const low = num(klines[i][3]);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  const slice = trs.slice(-n);
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
  return avg;
}

function volRegime(rvShort: number | null, rvLong: number | null): "compression" | "normal" | "expansion" | null {
  if (rvShort == null || rvLong == null || rvLong <= 0) return null;
  const ratio = rvShort / rvLong;
  if (ratio >= 1.25) return "expansion";
  if (ratio <= 0.80) return "compression";
  return "normal";
}

async function optionalIvProxy(symbol: string): Promise<number | null> {
  const provider = (Deno.env.get("IV_PROVIDER") ?? "none").toLowerCase();
  if (provider === "none") return null;
  const url = Deno.env.get("DERIBIT_IV_URL");
  if (!url) return null;
  const res = await fetchJson<any>(`${url}?symbol=${encodeURIComponent(symbol)}`);
  const iv = Number(res?.iv ?? res?.implied_vol ?? null);
  return Number.isFinite(iv) ? iv : null;
}

export async function computeMarketContext(asset: AtlasAsset, snapshotTimeIso: string): Promise<MarketContextSnapshot> {
  const baseUrl = Deno.env.get("EXCHANGE_BASE_URL") ?? "https://data-api.binance.vision";
  const levels = Number(Deno.env.get("ORDERBOOK_LEVELS") ?? 20);

  const exchangeSymbol = asset.metadata?.exchange_symbol;
  if (!exchangeSymbol) {
    const { primary, detail, hour } = utcSessionLabel(new Date(snapshotTimeIso));
    return {
      symbol: asset.symbol,
      snapshot_time: snapshotTimeIso,
      mid_price: null, best_bid: null, best_ask: null,
      spread_abs: null, spread_bps: null,
      bid_depth_usd: null, ask_depth_usd: null,
      ob_imbalance: null, depth_concentration: null,
      rv_1h: null, rv_4h: null, rv_24h: null,
      atr_1h: null, atr_4h: null,
      vol_regime: null,
      iv_proxy: null, iv_rv_spread: null,
      session_primary: primary, session_detail: detail, session_utc_hour: hour,
      metadata: { note: "No exchange_symbol configured in atlas_assets.metadata" },
    };
  }

  // 1) Order book depth
  const depthUrl = `${baseUrl}/api/v3/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(100, Math.max(20, levels))}`;
  const depth = await fetchJson<DepthResp>(depthUrl);

  const bestBid = depth.bids?.length ? num(depth.bids[0][0]) : null;
  const bestAsk = depth.asks?.length ? num(depth.asks[0][0]) : null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const spreadAbs = bestBid != null && bestAsk != null ? Math.max(0, bestAsk - bestBid) : null;
  const spreadBps = spreadAbs != null && mid != null ? bps(spreadAbs, mid) : null;

  const bidDepthUsd = mid != null ? depthSumUsd(depth.bids ?? [], mid, levels) : null;
  const askDepthUsd = mid != null ? depthSumUsd(depth.asks ?? [], mid, levels) : null;
  const obImb = bidDepthUsd != null && askDepthUsd != null ? imbalance(bidDepthUsd, askDepthUsd) : null;

  const concBid = mid != null ? depthConcentration(depth.bids ?? [], mid) : null;
  const concAsk = mid != null ? depthConcentration(depth.asks ?? [], mid) : null;
  const depthConc = concBid != null && concAsk != null ? (concBid + concAsk) / 2 : null;

  // 2) Volatility regime from 1m klines
  const klineLimit = 1500;
  const klineUrl = `${baseUrl}/api/v3/klines?symbol=${encodeURIComponent(exchangeSymbol)}&interval=1m&limit=${klineLimit}`;
  const klines = await fetchJson<Kline[]>(klineUrl);

  const closes = (klines ?? []).map((k) => num(k[4])).filter((x) => x > 0);
  const last1500 = closes.slice(-1500);
  const closes1h = last1500.slice(-60);
  const closes4h = last1500.slice(-240);
  const closes24h = last1500.slice(-1440);

  const rv1h = closes1h.length >= 30 ? realizedVolFromCloses(closes1h, 1440) : null;
  const rv4h = closes4h.length >= 60 ? realizedVolFromCloses(closes4h, 1440) : null;
  const rv24h = closes24h.length >= 240 ? realizedVolFromCloses(closes24h, 1440) : null;

  const atr1h = atrFromKlines(klines, 60);
  const atr4h = atrFromKlines(klines, 240);

  const regime = volRegime(rv1h, rv24h);

  // 3) Optional IV proxy
  const iv = await optionalIvProxy(asset.symbol);
  const ivRvSpread = iv != null && rv24h != null ? (iv - rv24h) : null;

  // 4) Session / time context
  const { primary, detail, hour } = utcSessionLabel(new Date(snapshotTimeIso));

  return {
    symbol: asset.symbol,
    snapshot_time: snapshotTimeIso,
    mid_price: mid,
    best_bid: bestBid,
    best_ask: bestAsk,
    spread_abs: spreadAbs,
    spread_bps: spreadBps,
    bid_depth_usd: bidDepthUsd,
    ask_depth_usd: askDepthUsd,
    ob_imbalance: obImb,
    depth_concentration: depthConc,
    rv_1h: rv1h,
    rv_4h: rv4h,
    rv_24h: rv24h,
    atr_1h: atr1h,
    atr_4h: atr4h,
    vol_regime: regime,
    iv_proxy: iv,
    iv_rv_spread: ivRvSpread,
    session_primary: primary,
    session_detail: detail,
    session_utc_hour: hour,
    metadata: {
      exchange_symbol: exchangeSymbol,
      orderbook_levels: levels,
      note: "Observation-only market context. No trading implications yet.",
    },
  };
}

export async function insertMarketContextSnapshot(args: {
  asset: AtlasAsset;
  snapshotTimeIso: string;
  decisionId?: string | null;
  tradeId?: string | null;
}) {
  const sb = supabaseAdmin();
  const snap = await computeMarketContext(args.asset, args.snapshotTimeIso);

  const { error } = await sb.from("market_context_snapshots").insert({
    decision_id: args.decisionId ?? null,
    trade_id: args.tradeId ?? null,
    symbol: snap.symbol,
    snapshot_time: snap.snapshot_time,
    mid_price: snap.mid_price,
    best_bid: snap.best_bid,
    best_ask: snap.best_ask,
    spread_abs: snap.spread_abs,
    spread_bps: snap.spread_bps,
    bid_depth_usd: snap.bid_depth_usd,
    ask_depth_usd: snap.ask_depth_usd,
    ob_imbalance: snap.ob_imbalance,
    depth_concentration: snap.depth_concentration,
    rv_1h: snap.rv_1h,
    rv_4h: snap.rv_4h,
    rv_24h: snap.rv_24h,
    atr_1h: snap.atr_1h,
    atr_4h: snap.atr_4h,
    vol_regime: snap.vol_regime,
    iv_proxy: snap.iv_proxy,
    iv_rv_spread: snap.iv_rv_spread,
    session_primary: snap.session_primary,
    session_detail: snap.session_detail,
    session_utc_hour: snap.session_utc_hour,
    metadata: snap.metadata,
  });

  if (error) throw new Error(`insertMarketContextSnapshot failed: ${error.message}`);
}
