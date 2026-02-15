import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const callMetaEngine = async (action: string, params: Record<string, string> = {}, body?: any) => {
  const queryParams = new URLSearchParams({ action, ...params });
  const options: any = body
    ? { method: "POST", body: JSON.stringify(body) }
    : {};
  const { data, error } = await supabase.functions.invoke("meta-engine", {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify({ ...body }) : JSON.stringify({ action, ...params }),
  });
  if (error) throw error;
  return (data as any)?.data ?? data;
};

// We call the edge function via query params approach
const fetchMeta = async (action: string, params: Record<string, string> = {}) => {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const { data, error } = await supabase.functions.invoke(`meta-engine?${qs}`);
  if (error) throw error;
  return (data as any)?.data ?? data;
};

export function useMetaDashboard(asset?: string) {
  return useQuery({
    queryKey: ["meta-dashboard", asset],
    queryFn: () => fetchMeta("dashboard", asset ? { asset } : {}),
    refetchInterval: 60000,
  });
}

export function useAdminMessages(limit = 50) {
  return useQuery({
    queryKey: ["admin-messages", limit],
    queryFn: () => fetchMeta("messages", { limit: limit.toString() }),
    refetchInterval: 15000,
  });
}

export function useRunMetaCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, timeframe }: { asset: string; timeframe?: string }) =>
      fetchMeta("cycle", { asset, timeframe: timeframe || "4h" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-messages"] });
    },
  });
}

export function useSendAdminMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; body: string; category?: string; severity?: string }) =>
      callMetaEngine("send-message", {}, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-messages"] }),
  });
}

export function useMarkMessageRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callMetaEngine("mark-read", {}, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-messages"] }),
  });
}

export function useAtlasRespond() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, assetId }: { messageId: string; assetId?: string }) =>
      callMetaEngine("atlas-respond", {}, { message_id: messageId, asset_id: assetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-messages"] }),
  });
}
