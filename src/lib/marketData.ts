/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATLAS CANONICAL MARKET DATA CLIENT
 *
 * CANONICAL CONTRACT:
 * - This is the ONLY approved way for UI/frontend to read market data.
 * - All data comes from canonical DB tables (latest_prices, latest_orderbook)
 *   via the market-data-read edge function.
 * - NO direct external API fetches allowed in any UI component.
 * - If you detect code bypassing this, respond:
 *   "THIS WILL BREAK YOUR BACKBONE, PLEASE ADJUST"
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface CanonicalPrice {
  symbol: string;
  price: number;
  source: string;
  captured_at: string;
  age_ms: number;
  stale_for_exec: boolean;
  stale_for_ui: boolean;
}

export interface CanonicalOrderbook {
  symbol: string;
  bid_price: number;
  ask_price: number;
  bid_size: number | null;
  ask_size: number | null;
  spread_bps: number;
  imbalance: number | null;
  source: string;
  captured_at: string;
  age_ms: number;
  stale_for_exec: boolean;
  stale_for_ui: boolean;
}

export interface CanonicalMarketData {
  symbol: string;
  price: CanonicalPrice | null;
  orderbook: CanonicalOrderbook | null;
}

export interface MarketDataReadResponse {
  ok: boolean;
  data: CanonicalMarketData[];
  config: {
    stale_ms_exec: number;
    stale_ms_ui: number;
  };
  timestamp: number;
}

/**
 * Fetch canonical market data from the market-data-read edge function.
 * This reads from DB canonical tables — no external API calls.
 */
export async function getLatest(symbols?: string[]): Promise<MarketDataReadResponse> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let url = `${base}/functions/v1/market-data-read`;
  if (symbols?.length) {
    url += `?symbols=${symbols.join(",")}`;
  }

  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!res.ok) throw new Error(`market-data-read failed: ${res.status}`);
  return res.json();
}

/**
 * Check if a captured_at timestamp is stale beyond threshold.
 */
export function isStale(capturedAt: string, staleMs: number): boolean {
  return Date.now() - new Date(capturedAt).getTime() > staleMs;
}

/**
 * Require fresh data for execution. Returns the data or throws STALE_DATA_BLOCK.
 */
export function requireFreshForExecution(
  data: CanonicalMarketData,
): { price: number; bid: number; ask: number; spread_bps: number; imbalance: number | null } {
  if (!data.price || data.price.stale_for_exec) {
    throw new Error(`STALE_DATA_BLOCK: ${data.symbol} price stale (age: ${data.price?.age_ms ?? "N/A"}ms)`);
  }
  if (!data.orderbook || data.orderbook.stale_for_exec) {
    throw new Error(`STALE_DATA_BLOCK: ${data.symbol} orderbook stale (age: ${data.orderbook?.age_ms ?? "N/A"}ms)`);
  }

  return {
    price: data.price.price,
    bid: data.orderbook.bid_price,
    ask: data.orderbook.ask_price,
    spread_bps: data.orderbook.spread_bps,
    imbalance: data.orderbook.imbalance,
  };
}
