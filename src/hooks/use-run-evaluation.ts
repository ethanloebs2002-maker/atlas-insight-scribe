import { useCallback } from "react";
import { useEvaluate } from "@/hooks/use-paper-engine";
import { useEvaluationProgress } from "@/hooks/use-evaluation-progress";
import { useSystemStatus } from "@/hooks/use-safety-engine";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
      const result = await evaluate.mutateAsync({ asset: selectedAsset });
      progress.complete();

      // Refresh paper stats after completion
      qc.invalidateQueries({ queryKey: ["paper-stats"] });

      // Toast feedback based on decision type
      const decisionType = result?.data?.decision_type;
      if (decisionType === "TRADE_CANDIDATE") {
        toast.success("Decision generated: Trade candidate", {
          description: `${selectedAsset} — see decisions stream for details.`,
        });
      } else if (decisionType === "NO_TRADE") {
        toast.info("Decision generated: No-trade", {
          description: "Insufficient signals for entry. See reasons in decisions stream.",
        });
      } else if (decisionType === "PAUSED") {
        toast.warning("Decision generated: Paused", {
          description: "System is in anomaly halt state.",
        });
      } else if (decisionType === "ERROR") {
        toast.error("Evaluation completed with errors", {
          description: result?.data?.error || "See debug trace for details.",
        });
      } else {
        toast.success("Evaluation complete", {
          description: `${selectedAsset} decisions updated.`,
        });
      }
    } catch (err) {
      progress.error((err as Error).message);
      toast.error("Evaluation failed", {
        description: (err as Error).message,
      });
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
