import { useSystemStatus } from "@/hooks/use-safety-engine";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, ShieldAlert, Pause } from "lucide-react";

const MODE_CONFIG = {
  NORMAL: {
    icon: ShieldCheck,
    label: "NORMAL",
    className: "bg-bullish/10 text-bullish border-bullish/30",
    description: "All systems operational. Learning active.",
  },
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
  const { data: statusRes } = useSystemStatus(asset);
  const statusData = statusRes?.data;

  if (!statusData) return null;

  const mode = statusData.effectiveMode as keyof typeof MODE_CONFIG;
  const config = MODE_CONFIG[mode] || MODE_CONFIG.NORMAL;
  const Icon = config.icon;
  const activeCount = statusData.activeAnomalies?.length || 0;

  if (compact) {
    return (
      <Badge variant="outline" className={`text-[9px] font-mono gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
        {statusData.learningFrozen && <Pause className="h-2.5 w-2.5 ml-0.5" />}
      </Badge>
    );
  }

  if (mode === "NORMAL" && activeCount === 0) return null;

  return (
    <div className={`rounded-lg border p-3 flex items-center gap-3 ${config.className}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold">{config.label}</span>
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
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[8px] font-mono">
              {activeCount} active anomal{activeCount === 1 ? "y" : "ies"}
            </Badge>
          )}
        </div>
        <p className="text-[10px] font-mono mt-0.5 opacity-80">{config.description}</p>
      </div>
    </div>
  );
}
