import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/indicator-engine`;

async function callGPR(action: string, params: Record<string, string> = {}, body?: any) {
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
    throw new Error(err.error || "GPR error");
  }
  return res.json();
}

export interface GlobalPattern {
  signature_hash: string;
  description_snippet: string;
  contexts_supported_json: string[];
  assets_tested_n: number;
  assets_success_n: number;
  mean_diracc_uplift: number;
  mean_ev_uplift: number;
  portability_score: number;
  stability_score: number;
  first_published_ts: string | null;
  last_validated_ts: string;
  publish_status: string;
  canonical_conditions_json: any[];
  context_tags_json: Record<string, string>;
}

export interface PatternEvidence {
  id: string;
  signature_hash: string;
  asset_id: string;
  timeframe_class: string;
  context_bucket_id: string;
  support_n_decisions: number;
  support_n_trades: number;
  diracc_uplift: number;
  ev_uplift: number;
  stability_score: number;
  last_validated_ts: string;
}

export interface AuditEntry {
  id: string;
  signature_hash: string;
  reviewer_note: string;
  action_type: string;
  created_ts: string;
}

export function useGlobalPatterns(filters: { publish_status?: string; timeframe_class?: string; regime_label?: string } = {}) {
  const params: Record<string, string> = {};
  if (filters.publish_status) params.publish_status = filters.publish_status;
  if (filters.timeframe_class) params.timeframe_class = filters.timeframe_class;
  if (filters.regime_label) params.regime_label = filters.regime_label;

  return useQuery({
    queryKey: ["gpr-registry", filters],
    queryFn: async () => {
      const res = await callGPR("gpr-registry", params);
      return (res.data || []) as GlobalPattern[];
    },
    refetchInterval: 120_000,
  });
}

export function usePatternEvidence(signatureHash?: string) {
  return useQuery({
    queryKey: ["gpr-evidence", signatureHash],
    queryFn: async () => {
      const res = await callGPR("gpr-evidence", { signature_hash: signatureHash! });
      return (res.data || []) as PatternEvidence[];
    },
    enabled: !!signatureHash,
  });
}

export function usePatternAuditLog(signatureHash?: string) {
  return useQuery({
    queryKey: ["gpr-audit-log", signatureHash],
    queryFn: async () => {
      const res = await callGPR("gpr-audit-log", { signature_hash: signatureHash! });
      return (res.data || []) as AuditEntry[];
    },
    enabled: !!signatureHash,
  });
}

export function useValidateGPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callGPR("gpr-validate"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gpr-registry"] }),
  });
}

export function useAddAuditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { signature_hash: string; reviewer_note: string; action_type: string }) =>
      callGPR("gpr-add-note", {}, body),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["gpr-audit-log", vars.signature_hash] }),
  });
}
