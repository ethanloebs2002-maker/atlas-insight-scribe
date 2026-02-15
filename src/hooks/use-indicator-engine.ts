import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/indicator-engine`;

async function callIndicatorEngine(action: string, params: Record<string, string> = {}, body?: any) {
  const queryStr = new URLSearchParams({ action, ...params }).toString();
  const url = `${FUNCTION_URL}?${queryStr}`;
  const options: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  };
  if (body) {
    options.method = "POST";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Indicator engine error");
  }
  return res.json();
}

export function useIndicatorReliability(asset?: string, timeframe = "4h") {
  return useQuery({
    queryKey: ["indicator-reliability", asset, timeframe],
    queryFn: () => callIndicatorEngine("reliability", { ...(asset ? { asset } : {}), timeframe }),
    refetchInterval: 120_000,
  });
}

export function useIndicatorPatterns(asset?: string, timeframe = "4h") {
  return useQuery({
    queryKey: ["indicator-patterns", asset, timeframe],
    queryFn: () => callIndicatorEngine("patterns", { ...(asset ? { asset } : {}), timeframe }),
    refetchInterval: 120_000,
  });
}

export function useTradeSnapshot(decisionId?: string) {
  return useQuery({
    queryKey: ["trade-snapshot", decisionId],
    queryFn: () => callIndicatorEngine("trade-snapshot", { decision_id: decisionId! }),
    enabled: !!decisionId,
  });
}

export function useRecordSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => callIndicatorEngine("record-snapshot", {}, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indicator-reliability"] }),
  });
}

export function useLinkOutcomes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset?: string) => callIndicatorEngine("link-outcomes", asset ? { asset } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicator-reliability"] });
      qc.invalidateQueries({ queryKey: ["indicator-patterns"] });
    },
  });
}

export function useComputeReliability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, timeframe }: { asset: string; timeframe?: string }) =>
      callIndicatorEngine("compute-reliability", { asset, ...(timeframe ? { timeframe } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indicator-reliability"] }),
  });
}

export function useMinePatterns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, timeframe }: { asset: string; timeframe?: string }) =>
      callIndicatorEngine("mine-patterns", { asset, ...(timeframe ? { timeframe } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indicator-patterns"] }),
  });
}
