import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-engine`;

async function callNewsEngine(action: string, params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams({ action, ...params }).toString();
  const url = `${FUNCTION_URL}?${queryStr}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "News engine error");
  }
  const json = await res.json();
  return json.data;
}

export function useNewsFeed(asset?: string, limit = 30) {
  return useQuery({
    queryKey: ["news-feed", asset, limit],
    queryFn: () => callNewsEngine("feed", { ...(asset ? { asset } : {}), limit: String(limit) }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useNewsNarratives(asset?: string) {
  return useQuery({
    queryKey: ["news-narratives", asset],
    queryFn: () => callNewsEngine("narratives", asset ? { asset } : {}),
    refetchInterval: 60_000,
  });
}

export function useNewsGraduation(asset?: string) {
  return useQuery({
    queryKey: ["news-graduation", asset],
    queryFn: () => callNewsEngine("graduation", asset ? { asset } : {}),
    refetchInterval: 30_000,
  });
}

export function useNewsReactions(asset?: string, limit = 20) {
  return useQuery({
    queryKey: ["news-reactions", asset, limit],
    queryFn: () => callNewsEngine("reactions", { ...(asset ? { asset } : {}), limit: String(limit) }),
    refetchInterval: 60_000,
  });
}

export function usePsychAggregates(asset: string) {
  return useQuery({
    queryKey: ["psych-aggregates", asset],
    queryFn: () => callNewsEngine("psych-aggregates", { asset }),
    refetchInterval: 60_000,
    enabled: !!asset,
  });
}

export function useIngestNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset?: string) => callNewsEngine("ingest", asset ? { asset } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["news-feed"] });
      qc.invalidateQueries({ queryKey: ["news-narratives"] });
      qc.invalidateQueries({ queryKey: ["psych-aggregates"] });
    },
  });
}
