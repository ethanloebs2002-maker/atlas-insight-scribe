import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCohort, COHORTS } from "@/hooks/use-cohort";

export interface CohortMetrics {
  decisionsCount: number;
  openCount: number;
  closedCount: number;
  pendingCount: number;
  wins: number;
  losses: number;
  winRate: number;
  dirAcc: number;
  avgR: number;
  cohortLabel: string;
}

const EMPTY: CohortMetrics = {
  decisionsCount: 0, openCount: 0, closedCount: 0, pendingCount: 0,
  wins: 0, losses: 0, winRate: 0, dirAcc: 0, avgR: 0, cohortLabel: "",
};

async function fetchCohortMetrics(cohortId: string | null, asset: string | undefined, label: string): Promise<CohortMetrics> {
  // Decisions
  let dq = supabase.from("paper_decisions")
    .select("id, direction_pred, evaluated_at, correct", { count: "exact", head: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (cohortId) dq = dq.eq("cohort_id", cohortId);
  if (asset) dq = dq.eq("asset_id", asset);
  const { data: decisions = [], count: dCount } = await dq;

  // Positions
  let pq = supabase.from("paper_positions")
    .select("id, status, outcome, realized_pnl, r_multiple");
  if (cohortId) pq = pq.eq("cohort_id", cohortId);
  if (asset) pq = pq.eq("symbol", asset);
  const { data: positions = [] } = await pq;

  const openCount = positions.filter((p: any) => p.status === "OPEN").length;
  const pendingCount = positions.filter((p: any) => p.status === "PENDING_ENTRY").length;
  const closed = positions.filter((p: any) => p.status === "CLOSED");
  const closedCount = closed.length;

  const wins = closed.filter((p: any) => p.outcome === "TP" || Number(p.realized_pnl ?? 0) > 0).length;
  const losses = closed.filter((p: any) => p.outcome === "SL" || Number(p.realized_pnl ?? 0) < 0).length;
  const winRate = closedCount > 0 ? (wins / closedCount) * 100 : 0;

  const rValues = closed.map((p: any) => Number(p.r_multiple ?? 0)).filter((v: number) => Number.isFinite(v));
  const avgR = rValues.length > 0 ? rValues.reduce((a: number, b: number) => a + b, 0) / rValues.length : 0;

  const evaluated = (decisions as any[]).filter((d: any) => d.evaluated_at);
  const correct = evaluated.filter((d: any) => d.correct);
  const dirAcc = evaluated.length > 0 ? (correct.length / evaluated.length) * 100 : 0;

  return {
    decisionsCount: Math.min(dCount ?? decisions.length, 200),
    openCount, closedCount, pendingCount,
    wins, losses, winRate, dirAcc, avgR,
    cohortLabel: label,
  };
}

export function useCohortMetrics(asset?: string) {
  const { cohortId, mode, label } = useCohort();

  const primary = useQuery({
    queryKey: ["cohort-metrics", mode === "compare" ? COHORTS.brain : cohortId, asset],
    queryFn: () => fetchCohortMetrics(
      mode === "compare" ? COHORTS.brain : cohortId,
      asset,
      mode === "compare" ? "Brain Online" : label,
    ),
    refetchInterval: 30_000,
  });

  const secondary = useQuery({
    queryKey: ["cohort-metrics", COHORTS.legacy, asset, "compare"],
    queryFn: () => fetchCohortMetrics(COHORTS.legacy, asset, "Legacy (Pre-Brain)"),
    refetchInterval: 30_000,
    enabled: mode === "compare",
  });

  return {
    primary: primary.data ?? { ...EMPTY, cohortLabel: label },
    secondary: secondary.data ?? { ...EMPTY, cohortLabel: "Legacy (Pre-Brain)" },
    isCompare: mode === "compare",
    isLoading: primary.isLoading,
  };
}
