import { useQuery } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-eval`;

async function callAutoEval(action: string, params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams({ action, ...params }).toString();
  const url = `${FUNCTION_URL}?${queryStr}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Auto-eval error");
  }
  return res.json();
}

/** Fire a single auto-eval tick (called by the scheduler) */
export async function runAutoEvalTick() {
  return callAutoEval("tick");
}

export function useBestTimeframe(asset?: string) {
  return useQuery({
    queryKey: ["best-tf", asset],
    queryFn: () => callAutoEval("best-tf", { asset: asset! }),
    enabled: !!asset,
    refetchInterval: 60_000,
  });
}

export function useTimeframeStats(asset?: string) {
  return useQuery({
    queryKey: ["tf-stats", asset],
    queryFn: () => callAutoEval("tf-stats", asset ? { asset } : {}),
    enabled: !!asset,
    refetchInterval: 30_000,
  });
}

export function useIncorporatedAssets() {
  return useQuery({
    queryKey: ["incorporated-assets"],
    queryFn: () => callAutoEval("assets"),
    refetchInterval: 60_000,
  });
}
