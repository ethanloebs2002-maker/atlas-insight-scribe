import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Brain, Shield, RefreshCw } from "lucide-react";
import { useMetaDashboard, useRunMetaCycle } from "@/hooks/use-meta-engine";
import { Skeleton } from "@/components/ui/skeleton";

const ML_LABELS = ["Reactive", "Uncertainty-Aware", "Epistemically-Aware", "Self-Evaluative", "Counterfactual-Aware", "Self-Reframing"];
const AL_LABELS = ["Observe", "Notify", "Light-Regulation", "Learning-Regulation"];

const ML_COLORS = [
  "bg-muted text-muted-foreground",
  "bg-primary/10 text-primary",
  "bg-primary/20 text-primary",
  "bg-bullish/20 text-bullish",
  "bg-neutral-signal/20 text-neutral-signal",
  "bg-bearish/20 text-bearish",
];

interface Props {
  asset?: string;
}

export default function MaturityDashboard({ asset }: Props) {
  const { data, isLoading } = useMetaDashboard(asset);
  const cycleMutation = useRunMetaCycle();

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

  const maturityStates = data?.maturity || [];
  const authorityStates = data?.authority || [];
  const recentEvals = data?.recentEvals || [];
  const recentAttrs = data?.recentAttrs || [];

  return (
    <div className="space-y-4">
      {/* Maturity Overview */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono font-bold tracking-wider">MATURITY & AUTHORITY</h2>
        <Button
          variant="outline"
          size="sm"
          className="text-xs font-mono h-7"
          onClick={() => cycleMutation.mutate({ asset: asset || "BTC" })}
          disabled={cycleMutation.isPending}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${cycleMutation.isPending ? "animate-spin" : ""}`} />
          Run Cycle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {maturityStates.length === 0 && (
          <Card className="col-span-full border-border/50 bg-card/50">
            <CardContent className="py-8 text-center text-xs font-mono text-muted-foreground">
              No maturity data yet. Run a meta-cognition cycle to initialize.
            </CardContent>
          </Card>
        )}
        {maturityStates.map((ms: any) => {
          const auth = authorityStates.find((a: any) => a.asset_id === ms.asset_id && a.timeframe_class === ms.timeframe_class);
          return (
            <Card key={ms.id || `${ms.asset_id}-${ms.timeframe_class}`} className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-mono">{ms.asset_id} / {ms.timeframe_class}</CardTitle>
                  <Badge className={`text-[9px] ${ML_COLORS[ms.maturity_level] || ML_COLORS[0]}`}>
                    ML{ms.maturity_level}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-mono text-muted-foreground">Maturity</span>
                  <span className="text-[10px] font-mono font-bold ml-auto">{ML_LABELS[ms.maturity_level]}</span>
                </div>
                <Progress value={ms.confidence} className="h-1.5" />
                <span className="text-[9px] font-mono text-muted-foreground">Confidence: {ms.confidence}%</span>

                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-mono text-muted-foreground">Authority</span>
                  <Badge variant="outline" className="text-[9px] ml-auto">
                    AL{auth?.authority_level || 0}: {AL_LABELS[auth?.authority_level || 0]}
                  </Badge>
                </div>

                {ms.reasons_json && ms.reasons_json.length > 0 && (
                  <div className="pt-1 border-t border-border/30 space-y-0.5">
                    {ms.reasons_json.slice(0, 3).map((r: string, i: number) => (
                      <p key={i} className="text-[9px] font-mono text-muted-foreground">• {r}</p>
                    ))}
                  </div>
                )}

                {ms.cooldown_until && new Date(ms.cooldown_until) > new Date() && (
                  <p className="text-[9px] font-mono text-neutral-signal">
                    ⏳ Cooldown until {new Date(ms.cooldown_until).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Meta-Evaluation Metrics */}
      {recentEvals.length > 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono">RECENT META-EVALUATIONS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left py-1 pr-2">Asset</th>
                    <th className="text-right py-1 px-1">Calib Err</th>
                    <th className="text-right py-1 px-1">Instability</th>
                    <th className="text-right py-1 px-1">Overconf</th>
                    <th className="text-right py-1 px-1">Diversity</th>
                    <th className="text-right py-1 px-1">False Alarm</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvals.slice(0, 8).map((e: any) => (
                    <tr key={e.id} className="border-b border-border/10">
                      <td className="py-1 pr-2">{e.asset_id}</td>
                      <td className={`text-right py-1 px-1 ${e.calibration_error > 0.15 ? "text-bearish" : "text-bullish"}`}>
                        {(e.calibration_error * 100).toFixed(1)}%
                      </td>
                      <td className={`text-right py-1 px-1 ${e.learning_instability > 0.3 ? "text-bearish" : "text-bullish"}`}>
                        {(e.learning_instability * 100).toFixed(1)}%
                      </td>
                      <td className={`text-right py-1 px-1 ${e.overconfidence_risk > 0.25 ? "text-bearish" : "text-bullish"}`}>
                        {(e.overconfidence_risk * 100).toFixed(1)}%
                      </td>
                      <td className="text-right py-1 px-1">{(e.hypothesis_diversity * 100).toFixed(0)}%</td>
                      <td className="text-right py-1 px-1">{(e.false_alarm_rate * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Epistemic Attribution */}
      {recentAttrs.length > 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono">EPISTEMIC ATTRIBUTION (WHY UNCERTAIN?)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentAttrs.slice(0, 4).map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="w-12 text-muted-foreground">{a.asset_id}</span>
                <div className="flex-1 flex gap-1">
                  <div className="flex-1 bg-primary/20 rounded-sm h-3 relative overflow-hidden" title="Data Insufficiency">
                    <div className="absolute inset-y-0 left-0 bg-primary/60 rounded-sm" style={{ width: `${a.data_insufficiency_p * 100}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px]">Data {(a.data_insufficiency_p * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex-1 bg-neutral-signal/20 rounded-sm h-3 relative overflow-hidden" title="Miscalibration">
                    <div className="absolute inset-y-0 left-0 bg-neutral-signal/60 rounded-sm" style={{ width: `${a.model_miscalibration_p * 100}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px]">Miscal {(a.model_miscalibration_p * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex-1 bg-bearish/20 rounded-sm h-3 relative overflow-hidden" title="Structural Change">
                    <div className="absolute inset-y-0 left-0 bg-bearish/60 rounded-sm" style={{ width: `${a.structural_change_p * 100}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px]">Struct {(a.structural_change_p * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex-1 bg-destructive/20 rounded-sm h-3 relative overflow-hidden" title="Integrity Failure">
                    <div className="absolute inset-y-0 left-0 bg-destructive/60 rounded-sm" style={{ width: `${a.data_integrity_failure_p * 100}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px]">Integ {(a.data_integrity_failure_p * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
