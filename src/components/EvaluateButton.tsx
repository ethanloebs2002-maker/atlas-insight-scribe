import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target, Loader2, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { useEvaluate } from "@/hooks/use-paper-engine";
import { useEvaluationProgress, type EvalStatus } from "@/hooks/use-evaluation-progress";

interface EvaluateButtonProps {
  selectedAsset?: string;
}

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "Estimating…";
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s > 0 ? `${s}s` : ""}`.trim();
}

const STATUS_CONFIG: Record<EvalStatus, {
  label: string;
  icon: React.ReactNode;
  variant: "outline" | "default" | "destructive";
}> = {
  IDLE: {
    label: "Evaluate",
    icon: <Target className="h-3 w-3" />,
    variant: "outline",
  },
  EVALUATING: {
    label: "Evaluating…",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    variant: "default",
  },
  READY: {
    label: "Re-Evaluate",
    icon: <CheckCircle2 className="h-3 w-3" />,
    variant: "outline",
  },
  PAUSED: {
    label: "Paused",
    icon: <AlertTriangle className="h-3 w-3" />,
    variant: "outline",
  },
  ERROR: {
    label: "Retry Evaluate",
    icon: <RotateCcw className="h-3 w-3" />,
    variant: "destructive",
  },
};

export default function EvaluateButton({ selectedAsset }: EvaluateButtonProps) {
  const evaluate = useEvaluate();
  const { state, start, complete, error } = useEvaluationProgress();
  const config = STATUS_CONFIG[state.status];

  const handleClick = useCallback(async () => {
    if (!selectedAsset) return;
    if (state.status === "EVALUATING") return;

    start();
    try {
      await evaluate.mutateAsync({ asset: selectedAsset });
      complete();
    } catch (err) {
      error((err as Error).message);
    }
  }, [selectedAsset, state.status, start, evaluate, complete, error]);

  const isEvaluating = state.status === "EVALUATING";

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="relative">
          <Button
            variant={config.variant}
            size="sm"
            className="h-8 text-xs font-mono gap-1.5 overflow-hidden relative"
            onClick={handleClick}
            disabled={!selectedAsset || isEvaluating}
          >
            {/* Background fill progress */}
            {isEvaluating && (
              <div
                className="absolute inset-0 bg-primary/20 transition-all duration-300 ease-out"
                style={{ width: `${state.progress}%` }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {config.icon}
              {config.label}
            </span>
          </Button>
          {/* Bottom progress bar */}
          {isEvaluating && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-secondary rounded-b-md overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          )}
        </div>
      </HoverCardTrigger>

      <HoverCardContent className="w-80 p-0" side="bottom" align="end">
        <div className="p-3 space-y-3">
          {/* Title */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-foreground">
              Evaluation Progress
            </span>
            <Badge
              variant={state.status === "EVALUATING" ? "default" : state.status === "READY" ? "secondary" : state.status === "ERROR" ? "destructive" : "outline"}
              className="text-[9px] font-mono"
            >
              {state.status}
            </Badge>
          </div>

          {/* Phase + detail */}
          {state.status !== "IDLE" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">{state.phase}</span>
                <span className="text-foreground font-bold">{state.progress}% complete</span>
              </div>
              <Progress value={state.progress} className="h-1.5" />
              <p className="text-[10px] font-mono text-muted-foreground">{state.phaseDetail}</p>
            </div>
          )}

          {/* ETA */}
          {state.status === "EVALUATING" && (
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">ETA</span>
              <span className="text-foreground">{formatEta(state.etaSeconds)}</span>
            </div>
          )}

          {state.status === "IDLE" && (
            <p className="text-[10px] font-mono text-muted-foreground">
              Select an asset and click Evaluate to start the evaluation pipeline.
            </p>
          )}

          {/* Checklist */}
          {state.status !== "IDLE" && (
            <div className="space-y-1 border-t border-border pt-2">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Gating Checklist</span>
              <div className="space-y-0.5">
                {state.checklist.map(item => (
                  <div key={item.key} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className={
                      item.status === "OK" ? "text-bullish" :
                      item.status === "IN_PROGRESS" ? "text-neutral-signal" :
                      "text-muted-foreground"
                    }>
                      {item.status === "OK" ? "✓" : item.status === "IN_PROGRESS" ? "⏳" : "○"}
                    </span>
                    <span className={item.ok ? "text-muted-foreground" : "text-foreground"}>
                      {item.label}
                    </span>
                    <span className="ml-auto text-[9px] text-muted-foreground">{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blockers */}
          {state.blockers.length > 0 && (
            <div className="space-y-1 border-t border-border pt-2">
              <span className="text-[9px] font-mono uppercase tracking-wider text-bearish">Blockers</span>
              {state.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono text-bearish">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
