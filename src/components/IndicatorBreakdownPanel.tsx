import { useState } from "react";
import { useTradeSnapshot } from "@/hooks/use-indicator-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Minus, Eye, EyeOff, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  decisions: any[];
}

export default function IndicatorBreakdownPanel({ decisions }: Props) {
  const evaluatedDecisions = decisions.filter((d: any) => d.evaluated_at);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | undefined>(
    evaluatedDecisions[0]?.id
  );

  const { data: snapshotRes, isLoading } = useTradeSnapshot(selectedDecisionId);
  const snapshot = snapshotRes?.data?.snapshot;
  const outcome = snapshotRes?.data?.outcome;
  const reliability = snapshotRes?.data?.reliability || [];

  const indicators = (snapshot?.indicators_json || {}) as Record<string, any>;
  const integrity = (snapshot?.integrity_json || {}) as any;
  const reliabilityMap = new Map(reliability.map((r: any) => [r.indicator_name, r]));

  return (
    <div className="space-y-4">
      {/* Decision Selector */}
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">Select Decision:</span>
          <Select value={selectedDecisionId || ""} onValueChange={setSelectedDecisionId}>
            <SelectTrigger className="w-72 h-8 text-xs font-mono">
              <SelectValue placeholder="Select a decision..." />
            </SelectTrigger>
            <SelectContent>
              {evaluatedDecisions.slice(0, 30).map((d: any) => (
                <SelectItem key={d.id} value={d.id} className="text-xs font-mono">
                  {d.asset_id} • {d.direction_pred} • {new Date(d.ts).toLocaleDateString()} • {d.correct ? "✓" : "✗"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedDecisionId && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs font-mono text-muted-foreground">Select an evaluated decision to view indicator breakdown.</p>
          </CardContent>
        </Card>
      )}

      {selectedDecisionId && !isLoading && !snapshot && (
        <Card>
          <CardContent className="py-12 text-center">
            <Minus className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs font-mono text-muted-foreground">No indicator snapshot recorded for this decision. Snapshots are recorded when decisions are created via the indicator engine.</p>
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          {/* Outcome Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniCard label="Direction" value={outcome?.direction_correct ? "CORRECT" : "INCORRECT"} accent={!!outcome?.direction_correct} />
            <MiniCard label="Regime" value={snapshot.regime_label} />
            <MiniCard label="Return R" value={outcome?.return_r !== null ? Number(outcome.return_r).toFixed(3) : "N/A"} accent={outcome?.return_r > 0} />
            <MiniCard label="Outcome" value={outcome?.outcome_label || "N/A"} />
          </div>

          {/* Integrity Summary */}
          {integrity.completeness_score !== undefined && (
            <Card>
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Integrity at Decision Time</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <MiniCard label="Completeness" value={`${Math.round(Number(integrity.completeness_score) * 100)}%`} />
                <MiniCard label="Consensus" value={`${Math.round(Number(integrity.consensus_score) * 100)}%`} />
                <MiniCard label="Agreement" value={`${Math.round(Number(integrity.agreement_score) * 100)}%`} />
              </CardContent>
            </Card>
          )}

          {/* Indicator Table */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Per-Indicator State at Entry</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-mono">INDICATOR</TableHead>
                    <TableHead className="text-[10px] font-mono">VALUE</TableHead>
                    <TableHead className="text-[10px] font-mono">Z-SCORE</TableHead>
                    <TableHead className="text-[10px] font-mono">SLOPE</TableHead>
                    <TableHead className="text-[10px] font-mono">SCORE</TableHead>
                    <TableHead className="text-[10px] font-mono">USED</TableHead>
                    <TableHead className="text-[10px] font-mono">RELIABILITY</TableHead>
                    <TableHead className="text-[10px] font-mono">POST-MORTEM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(indicators).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6 font-mono">No indicator data in snapshot</TableCell></TableRow>
                  ) : Object.entries(indicators).map(([name, ind]: [string, any]) => {
                    const rel = reliabilityMap.get(name) as any;
                    const score = ind.score_0_100 ?? 0;
                    const isFavorable = score >= 65;
                    const wasCorrect = outcome?.direction_correct === 1;
                    const postMortem = isFavorable
                      ? (wasCorrect ? "predictive" : "misleading")
                      : (wasCorrect ? "ignored-correct" : "ignored-missed");

                    return (
                      <TableRow key={name}>
                        <TableCell className="text-[10px] font-mono font-bold">{name}</TableCell>
                        <TableCell className="text-[10px] font-mono">{ind.value !== undefined ? String(ind.value) : "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{ind.z !== undefined ? Number(ind.z).toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {ind.slope !== undefined ? (
                            <span className="flex items-center gap-1">
                              {Number(ind.slope) > 0 ? <TrendingUp className="h-3 w-3 text-bullish" /> : <TrendingDown className="h-3 w-3 text-bearish" />}
                              {Number(ind.slope).toFixed(3)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={score >= 70 ? "default" : score >= 50 ? "secondary" : "outline"} className="text-[9px] font-mono">
                            {score.toFixed(0)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ind.used_flag ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          {rel ? (
                            <span className={`text-[10px] font-mono ${Number(rel.diracc_lift) > 0 ? "text-bullish" : "text-bearish"}`}>
                              {Number(rel.diracc_lift) > 0 ? "+" : ""}{(Number(rel.diracc_lift) * 100).toFixed(1)}%
                            </span>
                          ) : <span className="text-[10px] text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[9px] font-mono ${
                            postMortem === "predictive" ? "text-bullish border-bullish" :
                            postMortem === "misleading" ? "text-bearish border-bearish" :
                            "text-muted-foreground"
                          }`}>
                            {postMortem}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Conflicts */}
          {integrity.conflicts_json && (integrity.conflicts_json as any[]).length > 0 && (
            <Card>
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  Conflicts Detected
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(integrity.conflicts_json as any[]).map((c: any, i: number) => (
                  <div key={i} className="text-[10px] font-mono text-muted-foreground bg-secondary/50 rounded px-3 py-2 border border-border">
                    {c.description || JSON.stringify(c)}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="py-2 px-3">
      <div className="text-[9px] font-mono text-muted-foreground uppercase mb-0.5">{label}</div>
      <div className={`text-xs font-mono font-bold ${accent === true ? "text-bullish" : accent === false ? "text-bearish" : ""}`}>{value}</div>
    </Card>
  );
}
