import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callFn(name: string, body?: any) {
  const res = await fetch(`${FN_URL}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status}`);
  return res.json();
}

export function useStrategyBlueprints() {
  return useQuery({
    queryKey: ["strategy-blueprints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategy_blueprints")
        .select("*, strategy_reputation(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useStrategyPrimitives() {
  return useQuery({
    queryKey: ["strategy-primitives"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategy_primitives")
        .select("*")
        .order("category", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useShadowSignals(blueprintId?: string) {
  return useQuery({
    queryKey: ["shadow-signals", blueprintId],
    queryFn: async () => {
      let q = supabase
        .from("strategy_shadow_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (blueprintId) q = q.eq("blueprint_id", blueprintId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useStrategyScores(blueprintId?: string) {
  return useQuery({
    queryKey: ["strategy-scores", blueprintId],
    queryFn: async () => {
      let q = supabase
        .from("strategy_scores")
        .select("*")
        .order("computed_at", { ascending: false })
        .limit(50);
      if (blueprintId) q = q.eq("blueprint_id", blueprintId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useTournamentTick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callFn("strategy-tournament-tick"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shadow-signals"] }),
  });
}

export function useStrategyEvolve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callFn("strategy-evolve"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strategy-blueprints"] }),
  });
}

export function useStrategyReputationUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (positionId?: string) => callFn("strategy-reputation-update", positionId ? { position_id: positionId } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strategy-blueprints"] }),
  });
}
