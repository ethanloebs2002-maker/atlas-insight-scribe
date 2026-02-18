import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, CheckCircle, XCircle, Activity } from "lucide-react";

const EXPECTED_SOURCES = ["consensus", "execution", "market", "orderbook", "derivatives", "whale", "news", "risk_lab"];

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

  // Coverage chips
  const presentSources = new Set(events.map((e: any) => e.source));

  return (
    <div className="space-y-3">
      {/* Coverage chips */}
      <div className="flex flex-wrap gap-1">
        {EXPECTED_SOURCES.map(src => (
          <Badge
            key={src}
            variant={presentSources.has(src) ? "default" : "outline"}
            className={`text-[10px] ${presentSources.has(src) ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "opacity-40"}`}
          >
            {src} {presentSources.has(src) ? "✓" : "✗"}
          </Badge>
        ))}
      </div>

      {/* Timeline */}
      <ScrollArea className="max-h-[300px]">
        <div className="space-y-1.5">
          {events.map((ev: any) => {
            const Icon = PHASE_ICONS[ev.phase] ?? Activity;
            const colorClass = PHASE_COLORS[ev.phase] ?? "bg-muted text-muted-foreground";
            const ts = new Date(ev.ts);
            return (
              <div key={ev.id} className="flex items-start gap-2 text-xs">
                <div className={`rounded p-0.5 mt-0.5 ${colorClass}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{ev.phase}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{ev.source}</Badge>
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      {ts.toLocaleTimeString()}
                    </span>
                  </div>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                      {JSON.stringify(ev.payload).substring(0, 120)}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
