import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRiskPerformance(filters?: {
  symbol?: string;
  timeframe?: string;
  regime?: string;
  spread_bucket?: string;
}) {
  return useQuery({
    queryKey: ["risk-performance", filters],
    queryFn: async () => {
      let q = supabase
        .from("risk_profile_performance")
        .select("*")
        .order("win_rate", { ascending: false });

      if (filters?.symbol) q = q.eq("symbol", filters.symbol);
      if (filters?.timeframe) q = q.eq("timeframe", filters.timeframe);
      if (filters?.regime) q = q.eq("regime", filters.regime);
      if (filters?.spread_bucket) q = q.eq("spread_bucket", filters.spread_bucket);

      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRiskChampion(symbol: string, timeframe: string, regime: string, spreadBucket: string) {
  return useQuery({
    queryKey: ["risk-champion", symbol, timeframe, regime, spreadBucket],
    queryFn: async () => {
      const { data } = await supabase
        .from("risk_profile_performance")
        .select("risk_profile_key, win_rate, avg_r, trades")
        .eq("symbol", symbol)
        .eq("timeframe", timeframe)
        .eq("regime", regime)
        .eq("spread_bucket", spreadBucket)
        .order("avg_r", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!symbol && !!timeframe,
  });
}
