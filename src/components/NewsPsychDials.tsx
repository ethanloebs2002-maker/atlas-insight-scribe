import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PsychAggregates {
  fear: number;
  greed_fomo: number;
  uncertainty: number;
  urgency: number;
  authority: number;
  outrage_conflict: number;
  contagion: number;
  narrative_pressure: number;
  sample_size: number;
}

const DIAL_CONFIG = [
  { key: "fear", label: "Fear", color: "bg-bearish" },
  { key: "greed_fomo", label: "Greed / FOMO", color: "bg-bullish" },
  { key: "uncertainty", label: "Uncertainty", color: "bg-neutral-signal" },
  { key: "urgency", label: "Urgency", color: "bg-primary" },
  { key: "authority", label: "Authority", color: "bg-primary" },
  { key: "outrage_conflict", label: "Outrage", color: "bg-bearish" },
  { key: "contagion", label: "Contagion", color: "bg-bearish" },
  { key: "narrative_pressure", label: "Narrative Pressure", color: "bg-neutral-signal" },
] as const;

export default function NewsPsychDials({ data }: { data: PsychAggregates | null }) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Psych Impact — No Data
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>Psychological Impact Vectors</span>
          <span className="text-[10px] text-muted-foreground/60">n={data.sample_size}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {DIAL_CONFIG.map(({ key, label, color }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                <span className="text-[10px] font-mono font-bold">{data[key]}</span>
              </div>
              <Progress value={data[key]} className="h-1.5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
