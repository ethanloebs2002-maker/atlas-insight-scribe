import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, CheckCircle, XCircle, Activity, AlertTriangle } from "lucide-react";

const ALL_SOURCES = ["consensus", "execution", "market", "orderbook", "derivatives", "risk_lab", "policy", "whale", "news", "strategy"];

const PHASE_ORDER = ["DECISION_EMIT", "ENTRY_FILLED", "EXIT_CLOSED", "CADENCE_OBSERVE", "LEARNING_UPDATE", "POLICY_UPDATE"];

const PHASE_ICONS: Record<string, typeof Activity> = {
  DECISION_EMIT: Activity,
  ENTRY_FILLED: CheckCircle,
  EXIT_CLOSED: XCircle,
  CADENCE_OBSERVE: Clock,
  LEARNING_UPDATE: Activity,
  POLICY_UPDATE: Activity,
};

const PHASE_COLORS: Record<string, string> = {
  DECISION_EMIT: "bg-blue-500/20 text-blue-400",
  ENTRY_FILLED: "bg-emerald-500/20 text-emerald-400",
  EXIT_CLOSED: "bg-red-500/20 text-red-400",
  CADENCE_OBSERVE: "bg-muted text-muted-foreground",
  LEARNING_UPDATE: "bg-amber-500/20 text-amber-400",
  POLICY_UPDATE: "bg-purple-500/20 text-purple-400",
};

const STATUS_BADGE: Record<string, { icon: typeof CheckCircle; className: string; label: string }> = {
  OK: { icon: CheckCircle, className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "✓" },
  MISSING: { icon: AlertTriangle, className: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "⚠" },
  FAILED: { icon: XCircle, className: "bg-red-500/20 text-red-400 border-red-500/30", label: "✗" },
};

interface MemoryTimelineProps {
  positionId: string;
}

export function MemoryTimeline({ positionId }: MemoryTimelineProps) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["memory-timeline", positionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atlas_memory_events" as any)
        .select("*")
        .eq("position_id", positionId)
        .order("ts", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!positionId,
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground p-2">Loading memory…</div>;
  }

  if (!events?.length) {
    return <div className="text-xs text-muted-foreground p-2">No memory events for this position.</div>;
  }

  // Group events by phase
  const byPhase = new Map<string, any[]>();
  for (const ev of events) {
    if (!byPhase.has(ev.phase)) byPhase.set(ev.phase, []);
    byPhase.get(ev.phase)!.push(ev);
  }

  // Sort phases by canonical order
  const sortedPhases = [...byPhase.keys()].sort((a, b) => {
    const ia = PHASE_ORDER.indexOf(a);
    const ib = PHASE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <TooltipProvider>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-4">
          {sortedPhases.map(phase => {
            const phaseEvents = byPhase.get(phase)!;
            const Icon = PHASE_ICONS[phase] ?? Activity;
            const colorClass = PHASE_COLORS[phase] ?? "bg-muted text-muted-foreground";

            // Build source status map for this phase
            const sourceMap = new Map<string, { status: string; reason?: string; data?: any }>();
            for (const ev of phaseEvents) {
              const status = ev.payload?.status ?? "OK";
              sourceMap.set(ev.source, { status, reason: ev.payload?.reason, data: ev.payload?.data ?? ev.payload });
            }

            return (
              <div key={phase} className="space-y-1.5">
                {/* Phase header */}
                <div className="flex items-center gap-2">
                  <div className={`rounded p-0.5 ${colorClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold">{phase}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(phaseEvents[0].ts).toLocaleTimeString()}
                  </span>
                </div>

                {/* Source grid */}
                <div className="flex flex-wrap gap-1 ml-6">
                  {ALL_SOURCES.map(src => {
                    const info = sourceMap.get(src);
                    const status = info?.status ?? "MISSING";
                    const badge = STATUS_BADGE[status] ?? STATUS_BADGE.MISSING;
                    const reason = info?.reason;

                    return (
                      <Tooltip key={src}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 cursor-default ${badge.className}`}
                          >
                            {src} {badge.label}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[250px]">
                          <div className="text-xs space-y-1">
                            <div className="font-medium">{src} — {status}</div>
                            {reason && <div className="text-muted-foreground">{reason}</div>}
                            {info?.data && typeof info.data === "object" && (
                              <pre className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap">
                                {JSON.stringify(info.data, null, 1).substring(0, 200)}
                              </pre>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}
