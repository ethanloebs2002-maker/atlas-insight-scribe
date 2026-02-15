import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EngineEvent {
  id: string;
  ts: string;
  run_id?: string;
  entity_type: string;
  entity_id?: string;
  event_type: string;
  version_tag?: string;
  payload: any;
}

const EVENT_COLORS: Record<string, string> = {
  DECISION_EMITTED: "text-primary border-primary/30",
  POSITION_CREATED: "text-bullish border-bullish/30",
  ORDER_PLACED: "text-primary border-primary/30",
  ORDER_FILLED: "text-bullish border-bullish/30",
  POSITION_OPENED: "text-bullish border-bullish/30",
  TP_PLACED: "text-bullish border-bullish/30",
  SL_PLACED: "text-bearish border-bearish/30",
  POSITION_CLOSED: "text-neutral-signal border-neutral-signal/30",
  POSITION_EXPIRED: "text-muted-foreground border-border",
  POSITION_CANCELED: "text-muted-foreground border-border",
  ORDER_CANCELED: "text-muted-foreground border-border",
  POSITION_BLOCKED: "text-bearish border-bearish/30",
  ENGINE_TICK: "text-muted-foreground border-border",
};

export default function EngineTimeline({ events }: { events: EngineEvent[] }) {
  if (!events?.length) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12 font-mono">
        No engine events yet. Run an evaluation to generate events.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-320px)]">
      <div className="space-y-1.5 pr-2">
        {events.map((e) => {
          const cls = EVENT_COLORS[e.event_type] || "text-muted-foreground border-border";
          return (
            <div key={e.id} className="rounded-md border border-border p-2.5 text-[10px] font-mono space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[8px] py-0 h-4 ${cls}`}>
                  {e.event_type}
                </Badge>
                <Badge variant="secondary" className="text-[8px] py-0 h-4">
                  {e.entity_type}
                </Badge>
                {e.version_tag && (
                  <Badge variant="secondary" className="text-[8px] py-0 h-4">
                    {e.version_tag}
                  </Badge>
                )}
                <span className="text-muted-foreground ml-auto">
                  {new Date(e.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && (
                <div className="text-[9px] text-muted-foreground break-all">
                  {Object.entries(e.payload).slice(0, 6).map(([k, v]) => (
                    <span key={k} className="mr-3">
                      <span className="text-foreground/70">{k}:</span>{" "}
                      {typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(4)) : String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
