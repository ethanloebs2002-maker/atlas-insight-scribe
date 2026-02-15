import { useCallback } from "react";
import { useEvaluate } from "@/hooks/use-paper-engine";
import { useEvaluationProgress } from "@/hooks/use-evaluation-progress";
import { useSystemStatus } from "@/hooks/use-safety-engine";
import { useQueryClient } from "@tanstack/react-query";

export function useRunEvaluation(selectedAsset?: string) {
  const evaluate = useEvaluate();
  const progress = useEvaluationProgress();
  const { data: statusRes } = useSystemStatus(selectedAsset);
  const qc = useQueryClient();

  const systemStatus = statusRes?.data;
  const isHalted = systemStatus?.anomaly_halt === true;
  const haltReason = systemStatus?.reason || "System is in HALT state";

  const canRun = !!selectedAsset && progress.state.status !== "EVALUATING" && !isHalted;

  const run = useCallback(async () => {
    if (!selectedAsset || progress.state.status === "EVALUATING") return;

    progress.start();
    try {
      await evaluate.mutateAsync({ asset: selectedAsset });
      progress.complete();
      // Refresh paper stats after completion
      qc.invalidateQueries({ queryKey: ["paper-stats"] });
    } catch (err) {
      progress.error((err as Error).message);
    }
  }, [selectedAsset, progress, evaluate, qc]);

  return {
    run,
    canRun,
    isHalted,
    haltReason,
    state: progress.state,
  };
}
