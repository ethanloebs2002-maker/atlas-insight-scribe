import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConsensusData } from "@/types/atlas";
import HelpTooltip from "@/components/HelpTooltip";
import { ShieldCheck, AlertTriangle, Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ConsensusData;
}

function SignalRow({ label, value, tooltip }: { label: string; value: number; tooltip: string }) {
  const color = value >= 75 ? "text-bullish" : value >= 50 ? "text-neutral-signal" : "text-bearish";
  const impact = value >= 75 ? "Increased confidence" : value >= 50 ? "Neutral impact" : "Reduced confidence";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        <HelpTooltip id={tooltip} iconSize="h-2.5 w-2.5" />
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-mono font-bold ${color}`}>{value}%</span>
        <Badge variant="outline" className="text-[8px] font-mono">
          {impact}
        </Badge>
      </div>
    </div>
  );
}

export default function ConsensusExplainModal({ open, onOpenChange, data }: Props) {
  const overallColor = data.score >= 75 ? "text-bullish" : data.score >= 50 ? "text-neutral-signal" : "text-bearish";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-mono">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Consensus Explanation
          </DialogTitle>
          <DialogDescription className="text-[10px] font-mono text-muted-foreground">
            This explains why ATLAS reached this consensus at the time it was generated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Score */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">Overall Consensus Score</span>
            <span className={`text-2xl font-mono font-bold ${overallColor}`}>{data.score}</span>
          </div>

          {/* Signal Breakdown */}
          <Card>
            <CardContent className="py-3 px-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Signal Contributions
              </h3>
              <SignalRow label="Source Agreement" value={data.sourceAgreement} tooltip="consensus-source-agreement" />
              <SignalRow label="Signal Agreement" value={data.signalAgreement} tooltip="consensus-signal-agreement" />
              <SignalRow label="Structure Agreement" value={data.structureAgreement} tooltip="consensus-structure-agreement" />
              <SignalRow label="Data Completeness" value={data.dataCompleteness} tooltip="consensus-data-completeness" />
            </CardContent>
          </Card>

          {/* What increased / reduced confidence */}
          <Card>
            <CardContent className="py-3 px-4 space-y-2">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                Confidence Factors
              </h3>
              <div className="space-y-1.5 text-[10px] font-mono">
                {data.sourceAgreement >= 70 && (
                  <div className="flex items-start gap-1.5 text-bullish">
                    <span>↑</span>
                    <span>Strong source agreement ({data.sourceAgreement}%) increased confidence.</span>
                  </div>
                )}
                {data.signalAgreement >= 70 && (
                  <div className="flex items-start gap-1.5 text-bullish">
                    <span>↑</span>
                    <span>High signal alignment ({data.signalAgreement}%) reinforced the direction.</span>
                  </div>
                )}
                {data.structureAgreement >= 70 && (
                  <div className="flex items-start gap-1.5 text-bullish">
                    <span>↑</span>
                    <span>Market structure supports the consensus ({data.structureAgreement}%).</span>
                  </div>
                )}
                {data.dataCompleteness < 80 && (
                  <div className="flex items-start gap-1.5 text-bearish">
                    <span>↓</span>
                    <span>Incomplete data ({data.dataCompleteness}%) reduced overall confidence.</span>
                  </div>
                )}
                {data.sourceAgreement < 50 && (
                  <div className="flex items-start gap-1.5 text-bearish">
                    <span>↓</span>
                    <span>Low source agreement ({data.sourceAgreement}%) indicates conflicting views.</span>
                  </div>
                )}
                {data.signalAgreement < 50 && (
                  <div className="flex items-start gap-1.5 text-bearish">
                    <span>↓</span>
                    <span>Weak signal alignment ({data.signalAgreement}%) suggests mixed signals.</span>
                  </div>
                )}
                {data.structureAgreement < 50 && (
                  <div className="flex items-start gap-1.5 text-bearish">
                    <span>↓</span>
                    <span>Market structure contradicts the consensus ({data.structureAgreement}%).</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Conflicts */}
          {data.conflicts.length > 0 && (
            <Card>
              <CardContent className="py-3 px-4 space-y-2">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-neutral-signal" />
                  Detected Conflicts
                </h3>
                {data.conflicts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
                    <Badge variant={c.severity === "high" ? "destructive" : "secondary"} className="text-[8px] shrink-0">
                      {c.severity.toUpperCase()}
                    </Badge>
                    <span className="text-muted-foreground">{c.description}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Plain-English Summary */}
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-1.5">
                <Info className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                  ATLAS evaluated {data.dataCompleteness}% of expected data inputs.
                  {data.score >= 70
                    ? ` The consensus score of ${data.score} indicates strong agreement across signal sources, suggesting higher conviction in the projected direction.`
                    : data.score >= 50
                    ? ` The consensus score of ${data.score} indicates moderate agreement. Some signal sources diverge, introducing uncertainty.`
                    : ` The consensus score of ${data.score} indicates weak agreement across sources. The projected direction carries significant uncertainty.`
                  }
                  {data.conflicts.length > 0
                    ? ` ${data.conflicts.length} conflict(s) were detected, which may reduce reliability.`
                    : " No conflicts were detected between signal sources."
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
