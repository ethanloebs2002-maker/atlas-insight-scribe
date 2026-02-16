import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WhaleSignal = {
  id: string;
  symbol: string;
  source: "exchange" | "onchain";
  chain: string | null;
  signal_type: string;
  event_time: string;
  observed_price: number | null;
  notional_usd: number;
  severity: number;
  from_entity: string | null;
  to_entity: string | null;
  metadata: any;
};

export function useWhaleSignals(params?: { hours?: number; limit?: number; symbol?: string | null }) {
  const hours = params?.hours ?? 24;
  const limit = params?.limit ?? 50;
  const symbol = params?.symbol ?? null;

  const [rows, setRows] = useState<WhaleSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sinceIso = useMemo(() => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(), [hours]);

  async function fetchNow() {
    setLoading(true);
    setError(null);

    let q = (supabase
      .from("whale_signals_v2" as any)
      .select("*") as any)
      .gte("event_time", sinceIso)
      .order("event_time", { ascending: false })
      .limit(limit);

    if (symbol) q = q.eq("symbol", symbol);

    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as WhaleSignal[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchNow();

    const channel = supabase
      .channel("whale_signals_v2_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whale_signals_v2" },
        (payload) => {
          const inserted = payload.new as WhaleSignal;
          if (inserted.event_time < sinceIso) return;
          if (symbol && inserted.symbol !== symbol) return;
          setRows((prev) => [inserted, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    const t = window.setInterval(() => fetchNow(), 60_000);

    return () => {
      window.clearInterval(t);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceIso, limit, symbol]);

  return { rows, loading, error, refetch: fetchNow };
}
