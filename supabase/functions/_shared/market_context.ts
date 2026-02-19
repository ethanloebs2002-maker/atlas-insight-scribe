/**
 * ATLAS Market Context — Backbone-Safe Snapshot Builder
 *
 * COLOSSAL PATCH: eliminated all external fetch() calls.
 * Now reads exclusively from canonical DB tables:
 *   - latest_prices
 *   - latest_orderbook
 *   - market_volatility_rollups (populated by backbone pump)
 *
 * BACKBONE SAFE ✅ — no external API calls.
 */

import { supabaseAdmin, type AtlasAsset } from "./whale.ts";
import { utcSessionLabel } from "./session.ts";

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

function bps(spreadAbs: number, mid: number) {
  if (!mid || mid <= 0) return null;
  return (spreadAbs / mid) * 10_000;
}

function imbalance(bidDepth: number, askDepth: number) {
  const denom = Math.max(1e-9, bidDepth + askDepth);
  return (bidDepth - askDepth) / denom;
}

export async function computeMarketContext(asset: AtlasAsset, snapshotTimeIso: string): Promise<MarketContextSnapshot> {
  const sb = supabaseAdmin();

  // All three reads in parallel — no external fetches
  const [{ data: p }, { data: ob }, { data: vol }] = await Promise.all([
    sb.from("latest_prices").select("symbol,price,captured_at").eq("symbol", asset.symbol).maybeSingle(),
    sb.from("latest_orderbook")
      .select("symbol,bid_price,ask_price,spread_bps,imbalance,bid_size,ask_size,captured_at")
      .eq("symbol", asset.symbol)
      .maybeSingle(),
    sb.from("market_volatility_rollups")
      .select("rv_1h,rv_4h,rv_24h,atr_1h,atr_4h,vol_regime,updated_at")
      .eq("symbol", asset.symbol)
      .maybeSingle(),
  ]);

  const bid = ob?.bid_price ?? null;
  const ask = ob?.ask_price ?? null;

  const mid = p?.price ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
  const spreadAbs = bid != null && ask != null ? Math.max(0, ask - bid) : null;
  const spreadBps = ob?.spread_bps ?? (spreadAbs != null && mid != null ? bps(spreadAbs, mid) : null);

  // Estimate depth USD from bid/ask sizes if dedicated depth columns aren't available
  const bidDepth = (ob as any)?.bid_depth_usd ?? (ob?.bid_size != null && mid != null ? ob.bid_size * mid : null);
  const askDepth = (ob as any)?.ask_depth_usd ?? (ob?.ask_size != null && mid != null ? ob.ask_size * mid : null);

  const obImb = ob?.imbalance ?? (bidDepth != null && askDepth != null ? imbalance(bidDepth, askDepth) : null);
  const depthConc = (ob as any)?.depth_concentration ?? null;

  const rv1h = vol?.rv_1h ?? null;
  const rv4h = vol?.rv_4h ?? null;
  const rv24h = vol?.rv_24h ?? null;
  const atr1h = vol?.atr_1h ?? null;
  const atr4h = vol?.atr_4h ?? null;

  const regimeRaw = (vol?.vol_regime ?? null) as any;
  const regime = (regimeRaw === "compression" || regimeRaw === "normal" || regimeRaw === "expansion") ? regimeRaw : null;

  const { primary, detail, hour } = utcSessionLabel(new Date(snapshotTimeIso));

  return {
    symbol: asset.symbol,
    snapshot_time: snapshotTimeIso,
    mid_price: mid,
    best_bid: bid,
    best_ask: ask,
    spread_abs: spreadAbs,
    spread_bps: spreadBps,

    bid_depth_usd: bidDepth,
    ask_depth_usd: askDepth,
    ob_imbalance: obImb,
    depth_concentration: depthConc,

    rv_1h: rv1h,
    rv_4h: rv4h,
    rv_24h: rv24h,
    atr_1h: atr1h,
    atr_4h: atr4h,
    vol_regime: regime,

    iv_proxy: null,
    iv_rv_spread: null,

    session_primary: primary,
    session_detail: detail,
    session_utc_hour: hour,

    metadata: {
      note: "BACKBONE SAFE: derived only from canonical DB tables",
      price_captured_at: p?.captured_at ?? null,
      orderbook_captured_at: ob?.captured_at ?? null,
      vol_updated_at: vol?.updated_at ?? null,
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
