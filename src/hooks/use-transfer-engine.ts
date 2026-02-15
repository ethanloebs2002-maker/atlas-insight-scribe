import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transfer-engine`;

async function callTransferEngine(action: string, params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${FUNCTION_URL}?${queryStr}`, {
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Transfer engine error");
  }
  return res.json();
}

export function useTransferStatus(asset?: string) {
  return useQuery({
    queryKey: ["transfer-status", asset],
    queryFn: () => callTransferEngine("status", asset ? { asset } : {}),
    refetchInterval: 60_000,
  });
}

export function useComputeFingerprints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assets?: string[]) =>
      callTransferEngine("compute-fingerprints", assets ? { assets: assets.join(",") } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transfer-status"] }),
  });
}

export function useApplyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset: string) => callTransferEngine("apply-transfer", { asset }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transfer-status"] }),
  });
}

export function useDecayTransfers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset?: string) => callTransferEngine("decay", asset ? { asset } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transfer-status"] }),
  });
}

export function useCheckContradictions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset: string) => callTransferEngine("check-contradictions", { asset }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transfer-status"] }),
  });
}
