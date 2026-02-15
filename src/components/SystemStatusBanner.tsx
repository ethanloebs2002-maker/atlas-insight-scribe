import { useState } from "react";
import { useSystemStatus, useRTTimeline, useRunRTSense } from "@/hooks/use-safety-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, ShieldAlert, Pause, Timer, Activity, ChevronDown, ChevronUp } from "lucide-react";

const STATE_CONFIG = {
  NORMAL: {
    icon: ShieldCheck,
    label: "NORMAL",
    className: "bg-bullish/10 text-bullish border-bullish/30",
    description: "All systems operational. Learning active.",
  },
  WARN: {
    icon: AlertTriangle,
    label: "WARN",
    className: "bg-neutral-signal/10 text-neutral-signal border-neutral-signal/30",
    description: "Anomalies detected. Thresholds tightened, learning rate halved.",
  },
  HALT: {
    icon: ShieldAlert,
    label: "HALT",
    className: "bg-bearish/10 text-bearish border-bearish/30",
    description: "Critical anomalies. New trades paused. Learning frozen.",
  },
  COOLDOWN: {
    icon: Timer,
    label: "COOLDOWN",
    className: "bg-neutral-signal/10 text-neutral-signal border-neutral-signal/30",
    description: "Post-HALT cooldown. Treated as WARN until stabilized.",
  },
  // Legacy fallbacks
  CAUTION: {
    icon: AlertTriangle,
    label: "CAUTION",
    className: "bg-neutral-signal/10 text-neutral-signal border-neutral-signal/30",
    description: "Anomalies detected. Outputs may have reduced precision.",
  },
  ESCALATED: {
    icon: ShieldAlert,
    label: "ESCALATED",
    className: "bg-bearish/10 text-bearish border-bearish/30",
    description: "Critical anomalies. Precision outputs suppressed. Learning frozen.",
  },
};

interface SystemStatusBannerProps {
  asset?: string;
  compact?: boolean;
}

export default function SystemStatusBanner({ asset, compact = false }: SystemStatusBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: statusRes } = useSystemStatus(asset);
  const { data: timelineRes } = useRTTimeline(asset);
  const rtSense = useRunRTSense();
  const statusData = statusRes?.data;

  if (!statusData) return null;

  // Use v1.6.1a displayState if available, fallback to effectiveMode
  const displayState = statusData.displayState || statusData.effectiveMode || "NORMAL";
  const config = STATE_CONFIG[displayState as keyof typeof STATE_CONFIG] || STATE_CONFIG.NORMAL;
  const Icon = config.icon;
  const activeCount = statusData.activeAnomalies?.length || 0;
  const stableScore = statusData.stableScore || 0;
  const rootCauses: Array<{ cause: string; contribution: number }> = statusData.rootCauses || [];
  const timeline = timelineRes?.data || [];

  if (compact) {
    return (
      <Badge variant="outline" className={`text-[9px] font-mono gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
        {stableScore > 0 && <span className="opacity-70">{stableScore.toFixed(0)}</span>}
        {statusData.learningFrozen && <Pause className="h-2.5 w-2.5 ml-0.5" />}
      </Badge>
    );
  }

  return (
    <div className={`rounded-lg border ${config.className}`}>
      {/* Main status chip */}
      <div
        className="p-3 flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold">Market Status: {config.label}</span>
            {stableScore > 0 && (
              <Badge variant="outline" className="text-[8px] font-mono">
                <Activity className="h-2.5 w-2.5 mr-0.5" />
                Score: {stableScore.toFixed(1)}
              </Badge>
            )}
            {statusData.learningFrozen && (
              <Badge variant="outline" className="text-[8px] font-mono bg-bearish/10 text-bearish border-bearish/30">
                <Pause className="h-2 w-2 mr-0.5" /> LEARNING FROZEN
              </Badge>
            )}
            {statusData.status?.anomaly_halt && (
              <Badge variant="outline" className="text-[8px] font-mono bg-bearish/10 text-bearish border-bearish/30">
                HALT
              </Badge>
            )}
            {statusData.cooldownActive && (
              <Badge variant="outline" className="text-[8px] font-mono bg-neutral-signal/10 text-neutral-signal border-neutral-signal/30">
                <Timer className="h-2 w-2 mr-0.5" /> COOLDOWN
              </Badge>
            )}
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-[8px] font-mono">
                {activeCount} anomal{activeCount === 1 ? "y" : "ies"}
              </Badge>
            )}
            {/* Root cause chips */}
            {rootCauses.slice(0, 3).map((rc: any) => (
              <Badge key={rc.cause} variant="outline" className="text-[8px] font-mono">
                {rc.cause.replace("_", " ")} ({rc.contribution.toFixed(0)})
              </Badge>
            ))}
          </div>
          <p className="text-[10px] font-mono mt-0.5 opacity-80">{config.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {asset && (
            <Button
              variant="outline" size="sm"
              className="h-6 text-[9px] font-mono"
              onClick={(e) => { e.stopPropagation(); rtSense.mutate(asset); }}
              disabled={rtSense.isPending}
            >
              {rtSense.isPending ? "Sensing…" : "RT Sense"}
            </Button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Detail drawer */}
      {expanded && (
        <div className="border-t border-current/10 p-3 space-y-3">
          {/* RT Timeline */}
          <div>
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider mb-2 opacity-70">
              RT Timeline (last {timeline.length} intervals)
            </h4>
            {timeline.length === 0 ? (
              <p className="text-[10px] font-mono opacity-50">No RT samples yet. Click "RT Sense" to start.</p>
            ) : (
              <div className="flex gap-0.5 items-end h-12">
                {[...timeline].reverse().map((s: any, i: number) => {
                  const score = Number(s.anomaly_score);
                  const h = Math.max(4, (score / 100) * 48);
                  const bg = s.proposed_state === "HALT" ? "bg-bearish"
                    : s.proposed_state === "WARN" ? "bg-neutral-signal"
                    : "bg-bullish";
                  return (
                    <div
                      key={i}
                      className={`w-2 rounded-t ${bg} opacity-80`}
                      style={{ height: `${h}px` }}
                      title={`Score: ${score.toFixed(1)} | State: ${s.proposed_state} | ${new Date(s.created_at).toLocaleTimeString()}`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Resume criteria */}
          {(displayState === "HALT" || displayState === "WARN" || displayState === "COOLDOWN") && (
            <div className="rounded border border-current/10 p-2">
              <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider mb-1 opacity-70">
                Resume Criteria
              </h4>
              <div className="text-[10px] font-mono space-y-1">
                {displayState === "HALT" && (
                  <p>Need {K_CLEAR} consecutive NORMAL intervals to clear HALT → enters COOLDOWN</p>
                )}
                {displayState === "WARN" && !statusData.cooldownActive && (
                  <p>Need {K_CLEAR} consecutive NORMAL intervals to return to NORMAL</p>
                )}
                {statusData.cooldownActive && statusData.cooldownUntil && (
                  <p>
                    <Timer className="h-3 w-3 inline mr-1" />
                    Cooldown until: {new Date(statusData.cooldownUntil).toLocaleTimeString()}
                  </p>
                )}
                {statusData.stableState && (
                  <p className="opacity-60">
                    Consecutive normal: {statusData.stableState.consecutive_normal || 0} / {K_CLEAR}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Policy adjustments */}
          {statusData.policyAdjustments && Object.keys(statusData.policyAdjustments).length > 0 && (
            <div className="rounded border border-current/10 p-2">
              <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider mb-1 opacity-70">
                Active Policy Adjustments
              </h4>
              <div className="text-[10px] font-mono space-y-0.5">
                {Object.entries(statusData.policyAdjustments).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="opacity-70">{k.replace(/_/g, " ")}</span>
                    <span className="font-bold">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// K-bar constants for display
const K_CLEAR = 3;
