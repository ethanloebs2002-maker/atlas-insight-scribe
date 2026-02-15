import { useEffect, useRef, useState } from "react";

interface LivePriceOpts {
  symbol: string;
  pollMs?: number;
  enabled?: boolean;
}

/**
 * Polls the crypto-data edge function for a symbol's current price.
 * Returns lastPrice (number | null) updated every pollMs.
 */
export function useLivePrice({ symbol, pollMs = 5000, enabled = true }: LivePriceOpts) {
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !symbol) return;

    let cancelled = false;

    async function fetchPrice() {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-data?action=market&symbols=${encodeURIComponent(symbol)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!res.ok) return;
        const json = await res.json();
        const price = json?.data?.[0]?.price;
        if (!cancelled && typeof price === "number") {
          setLastPrice(price);
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
