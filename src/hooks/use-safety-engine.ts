import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/safety-engine`;

async function callSafetyEngine(action: string, params: Record<string, string> = {}) {
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
    throw new Error(err.error || "Safety engine error");
  }
  return res.json();
}

export function useSystemStatus(asset?: string) {
  return useQuery({
    queryKey: ["system-status", asset],
    queryFn: () => callSafetyEngine("status", asset ? { asset } : {}),
    refetchInterval: 15_000,
  });
}

export function useRTTimeline(asset?: string) {
  return useQuery({
    queryKey: ["rt-timeline", asset],
    queryFn: () => callSafetyEngine("rt-timeline", asset ? { asset, limit: "30" } : { limit: "30" }),
    enabled: !!asset,
    refetchInterval: 30_000,
  });
}

export function useAnomalyHistory(asset?: string) {
  return useQuery({
    queryKey: ["anomaly-history", asset],
    queryFn: () => callSafetyEngine("anomaly-history", asset ? { asset } : {}),
    refetchInterval: 30_000,
  });
}

export function usePatternTiers(asset?: string) {
  return useQuery({
    queryKey: ["pattern-tiers", asset],
    queryFn: () => callSafetyEngine("pattern-tiers", asset ? { asset } : {}),
    refetchInterval: 30_000,
  });
}

export function useRunRTSense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset: string) => callSafetyEngine("rt-sense", { asset }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-status"] });
      qc.invalidateQueries({ queryKey: ["rt-timeline"] });
      qc.invalidateQueries({ queryKey: ["anomaly-history"] });
    },
  });
}

export function useCheckAnomalies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset?: string) =>
      callSafetyEngine("check-anomalies", asset ? { asset } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-status"] });
      qc.invalidateQueries({ queryKey: ["anomaly-history"] });
    },
  });
}

export function useResolveAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (anomalyId: string) =>
      callSafetyEngine("resolve-anomaly", { anomaly_id: anomalyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-status"] });
      qc.invalidateQueries({ queryKey: ["anomaly-history"] });
    },
  });
}

export function usePromotePatterns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, timeframe }: { asset: string; timeframe?: string }) =>
      callSafetyEngine("promote-patterns", { asset, ...(timeframe ? { timeframe } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pattern-tiers"] }),
  });
}
