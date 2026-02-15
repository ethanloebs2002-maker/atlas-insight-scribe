import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, Loader2, RotateCcw, AlertTriangle, ShieldAlert, Zap } from "lucide-react";
import { useRunEvaluation } from "@/hooks/use-run-evaluation";
import type { EvalStatus } from "@/hooks/use-evaluation-progress";

interface RunAnalysisEmptyStateProps {
  selectedAsset?: string;
  timeframe?: string;
}

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "Estimating…";
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s > 0 ? `${s}s` : ""}`.trim();
}

const BUTTON_LABELS: Record<EvalStatus, { label: string; icon: React.ReactNode }> = {
  IDLE:       { label: "Run Analysis",    icon: <Zap className="h-4 w-4" /> },
  EVALUATING: { label: "Evaluating…",     icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  READY:      { label: "Re-Run Analysis", icon: <Target className="h-4 w-4" /> },
  PAUSED:     { label: "Run Analysis",    icon: <Target className="h-4 w-4" /> },
  ERROR:      { label: "Retry Analysis",  icon: <RotateCcw className="h-4 w-4" /> },
};

export default function RunAnalysisEmptyState({ selectedAsset, timeframe = "4h" }: RunAnalysisEmptyStateProps) {
  const { run, canRun, isHalted, haltReason, state } = useRunEvaluation(selectedAsset);
  const isEvaluating = state.status === "EVALUATING";
  const btnConfig = BUTTON_LABELS[state.status];

  const button = (
    <Button
      size="lg"
      className="font-mono gap-2 relative overflow-hidden"
      onClick={run}
      disabled={!canRun}
      variant={state.status === "ERROR" ? "destructive" : "default"}
    >
      {isEvaluating && (
        <div
          className="absolute inset-0 bg-primary-foreground/10 transition-all duration-300 ease-out"
          style={{ width: `${state.progress}%` }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {btnConfig.icon}
        {btnConfig.label}
      </span>
    </Button>
  );

  return (
    <Card className="border-dashed border-border">
      <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-4">
        {/* Icon */}
        <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
          {isHalted ? (
            <ShieldAlert className="h-6 w-6 text-bearish" />
          ) : (
            <Target className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        {/* Title + Context */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-mono font-bold text-foreground">
            No decisions recorded yet
          </h3>
          <p className="text-xs font-mono text-muted-foreground max-w-md">
            {selectedAsset
              ? `Click 'Run Analysis' to generate the first decision and paper trade candidates.`
              : "Select an asset above to begin analysis."}
          </p>
          {selectedAsset && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Badge variant="outline" className="text-[10px] font-mono">
                Asset: {selectedAsset}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                Timeframe: {timeframe}
              </Badge>
            </div>
          )}
        </div>

        {/* CTA Button */}
        {isHalted ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="flex items-start gap-1.5 text-xs font-mono">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-bearish" />
                  <span>{haltReason}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          button
        )}

        {/* Inline progress during evaluation */}
        {isEvaluating && (
          <div className="w-full max-w-xs space-y-1.5">
            <Progress value={state.progress} className="h-1.5" />
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>{state.phaseDetail}</span>
              <span>{state.progress}% · ETA: {formatEta(state.etaSeconds)}</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {state.status === "ERROR" && state.blockers.length > 0 && (
          <div className="text-[10px] font-mono text-bearish flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{state.blockers[0]}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
