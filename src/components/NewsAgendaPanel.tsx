import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";

interface AgendaSignals {
  speculation_level: number;
  framing_asymmetry: number;
  clickbait_intensity: number;
  source_disagreement: number;
  agenda_uncertainty: number;
}

function AgendaMeter({ value, label }: { value: number; label: string }) {
  const color = value > 60 ? "text-bearish" : value > 30 ? "text-neutral-signal" : "text-bullish";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-mono font-bold ${color}`}>{value}</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

export default function NewsAgendaPanel({ data }: { data: AgendaSignals | null }) {
  if (!data) return null;

  const isHigh = data.agenda_uncertainty > 60;

  return (
    <Card className={isHigh ? "border-bearish/30" : ""}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          {isHigh && <AlertTriangle className="h-3 w-3 text-bearish" />}
          Perspective / Agenda Uncertainty
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        <AgendaMeter value={data.agenda_uncertainty} label="Composite Agenda Uncertainty" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <AgendaMeter value={data.speculation_level} label="Speculation" />
          <AgendaMeter value={data.framing_asymmetry} label="Framing Bias" />
          <AgendaMeter value={data.clickbait_intensity} label="Clickbait" />
          <AgendaMeter value={data.source_disagreement} label="Source Conflict" />
        </div>
      </CardContent>
    </Card>
  );
}
