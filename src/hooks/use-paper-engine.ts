import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paper-engine`;

async function callPaperEngine(action: string, params: Record<string, string> = {}, body?: any) {
  const queryStr = new URLSearchParams({ action, ...params }).toString();
  const url = `${FUNCTION_URL}?${queryStr}`;
  
  const options: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  };

  if (body) {
    options.method = "POST";
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Paper engine error");
  }
  return res.json();
}

export function usePaperStats(asset?: string, includeLearning = false) {
  return useQuery({
    queryKey: ["paper-stats", asset, includeLearning],
    queryFn: () => callPaperEngine("stats", {
      ...(asset ? { asset } : {}),
      ...(includeLearning ? { learning: "true" } : {}),
    }),
    refetchInterval: 30_000,
  });
}

export function useRecordDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => callPaperEngine("record-decision", {}, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-stats"] }),
  });
}

export function useRecordTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => callPaperEngine("record-trade", {}, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-stats"] }),
  });
}

export function useEvaluate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, horizon }: { asset: string; horizon?: string }) =>
      callPaperEngine("evaluate", { asset, ...(horizon ? { horizon } : {}), emitted_by: "MANUAL_EVALUATE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-stats"] }),
  });
}
