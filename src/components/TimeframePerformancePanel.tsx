import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTimeframeStats, useBestTimeframe } from "@/hooks/use-auto-eval";
import { TrendingUp, TrendingDown, AlertTriangle, Zap, Minus } from "lucide-react";

interface TimeframePerformancePanelProps {
  asset?: string;
}

export default function TimeframePerformancePanel({ asset }: TimeframePerformancePanelProps) {
  const { data: statsRes, isLoading } = useTimeframeStats(asset);
  const { data: bestTfRes } = useBestTimeframe(asset);

  const stats = statsRes?.data || [];
  const bestTf = bestTfRes?.data?.timeframe;

  if (!asset) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs font-mono text-muted-foreground">
          Select an asset to view timeframe performance.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          Timeframe Performance
          {bestTf && (
            <Badge variant="outline" className="text-[9px] font-mono gap-1 border-primary/30 text-primary">
              <Zap className="h-2.5 w-2.5" />
              Best: {bestTf}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] font-mono">TF</TableHead>
              <TableHead className="text-[10px] font-mono">TRADES</TableHead>
              <TableHead className="text-[10px] font-mono">WIN RATE</TableHead>
              <TableHead className="text-[10px] font-mono">RECENT WR</TableHead>
              <TableHead className="text-[10px] font-mono">EV (R)</TableHead>
              <TableHead className="text-[10px] font-mono">SCORE</TableHead>
              <TableHead className="text-[10px] font-mono">DRIFT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6 font-mono">
                  Loading…
                </TableCell>
              </TableRow>
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6 font-mono">
                  No timeframe stats yet. Run evaluations to populate.
                </TableCell>
              </TableRow>
            ) : stats.map((s: any) => {
              const isBest = s.timeframe === bestTf;
              return (
                <TableRow key={s.timeframe} className={isBest ? "bg-primary/5" : ""}>
                  <TableCell className="text-[10px] font-mono font-bold">
                    <span className="flex items-center gap-1">
                      {isBest && <Zap className="h-3 w-3 text-primary" />}
                      {s.timeframe}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">{s.trades_n}</TableCell>
                  <TableCell className="text-[10px] font-mono">
                    {s.trades_n > 0 ? `${(s.win_rate * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">
                    {s.trades_n > 0 ? (
                      <span className={Number(s.win_rate_recent) >= Number(s.win_rate) ? "text-bullish" : "text-bearish"}>
                        {(s.win_rate_recent * 100).toFixed(1)}%
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className={`text-[10px] font-mono ${Number(s.ev_mean) >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {s.trades_n > 0 ? Number(s.ev_mean).toFixed(3) : "—"}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono font-bold">
                    {Number(s.success_likelihood_score).toFixed(3)}
                  </TableCell>
                  <TableCell>
                    {s.drift_flag ? (
                      <AlertTriangle className="h-3 w-3 text-bearish" />
                    ) : s.trades_n > 0 ? (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
