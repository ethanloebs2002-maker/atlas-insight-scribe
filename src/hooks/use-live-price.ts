/**
 * CANONICAL CONTRACT:
 * This hook reads from the market-data-read edge function,
 * which reads from canonical DB tables (latest_prices + latest_orderbook).
 * NO direct external API fetches.
 */
import { useEffect, useRef, useState } from "react";

interface LivePriceOpts {
  symbol: string;
  pollMs?: number;
  enabled?: boolean;
}

export interface LiveMarketData {
  price: number | null;
  bid: number | null;
  ask: number | null;
  spread_bps: number | null;
  imbalance: number | null;
  age_ms: number | null;
  stale_for_ui: boolean;
}

/**
 * Polls the canonical market-data-read endpoint for a symbol's current data.
 * Returns price + orderbook data from the backbone.
 */
export function useLivePrice({ symbol, pollMs = 5000, enabled = true }: LivePriceOpts) {
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [marketData, setMarketData] = useState<LiveMarketData | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !symbol) return;

    let cancelled = false;

    async function fetchPrice() {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data-read?symbols=${encodeURIComponent(symbol)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!res.ok) return;
        const json = await res.json();
        const item = json?.data?.[0];
        if (!cancelled && item) {
          const price = item.price?.price ?? null;
          if (typeof price === "number") setLastPrice(price);
          setMarketData({
            price,
            bid: item.orderbook?.bid_price ?? null,
            ask: item.orderbook?.ask_price ?? null,
            spread_bps: item.orderbook?.spread_bps ?? null,
            imbalance: item.orderbook?.imbalance ?? null,
            age_ms: item.price?.age_ms ?? item.orderbook?.age_ms ?? null,
            stale_for_ui: item.price?.stale_for_ui ?? item.orderbook?.stale_for_ui ?? false,
          });
        }
      } catch {
        /* non-critical */
      }
    }

    fetchPrice();
    timerRef.current = window.setInterval(fetchPrice, pollMs);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [symbol, pollMs, enabled]);

  return lastPrice;
}

/**
 * Full market data hook with bid/ask/spread/imbalance/freshness.
 */
export function useLiveMarketData({ symbol, pollMs = 5000, enabled = true }: LivePriceOpts) {
  const [data, setData] = useState<LiveMarketData | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !symbol) return;

    let cancelled = false;

    async function fetchData() {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data-read?symbols=${encodeURIComponent(symbol)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!res.ok) return;
        const json = await res.json();
        const item = json?.data?.[0];
        if (!cancelled && item) {
          setData({
            price: item.price?.price ?? null,
            bid: item.orderbook?.bid_price ?? null,
            ask: item.orderbook?.ask_price ?? null,
            spread_bps: item.orderbook?.spread_bps ?? null,
            imbalance: item.orderbook?.imbalance ?? null,
            age_ms: item.price?.age_ms ?? item.orderbook?.age_ms ?? null,
            stale_for_ui: item.price?.stale_for_ui ?? item.orderbook?.stale_for_ui ?? false,
          });
        }
      } catch {
        /* non-critical */
      }
    }

    fetchData();
    timerRef.current = window.setInterval(fetchData, pollMs);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [symbol, pollMs, enabled]);

  return data;
}
