import { useIndicatorReliability } from "@/hooks/use-indicator-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, AlertTriangle } from "lucide-react";

interface Props {
  selectedAsset?: string;
}

export default function IndicatorReliabilityPanel({ selectedAsset }: Props) {
  const { data: relRes, isLoading } = useIndicatorReliability(selectedAsset);
  const reliability = relRes?.data || [];

  // Group by indicator name
  const byIndicator: Record<string, any[]> = {};
  for (const r of reliability) {
    if (!byIndicator[r.indicator_name]) byIndicator[r.indicator_name] = [];
    byIndicator[r.indicator_name].push(r);
  }

  const sampleBadge = (n: number) => {
    if (n >= 200) return <Badge className="text-[8px] font-mono bg-bullish/20 text-bullish">SOLID</Badge>;
    if (n >= 100) return <Badge className="text-[8px] font-mono bg-primary/20 text-primary">OK</Badge>;
    if (n >= 50) return <Badge variant="secondary" className="text-[8px] font-mono">LOW</Badge>;
    return <Badge variant="outline" className="text-[8px] font-mono text-muted-foreground">THIN</Badge>;
  };

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center"><p className="text-xs font-mono text-muted-foreground">Loading reliability data...</p></CardContent></Card>;
  }

  if (reliability.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-xs font-mono text-muted-foreground">No indicator reliability data yet. Record snapshots, link outcomes, and compute reliability to populate.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary: best and worst indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-bullish">Most Reliable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...reliability].sort((a, b) => Number(b.diracc_lift) - Number(a.diracc_lift)).slice(0, 5).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-[10px] font-mono">
                <span className="font-bold">{r.indicator_name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[8px]">{r.regime_label}</Badge>
                  <span className="text-bullish">+{(Number(r.diracc_lift) * 100).toFixed(1)}%</span>
                  {sampleBadge(r.sample_n)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-bearish">Least Reliable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...reliability].sort((a, b) => Number(a.diracc_lift) - Number(b.diracc_lift)).slice(0, 5).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-[10px] font-mono">
                <span className="font-bold">{r.indicator_name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[8px]">{r.regime_label}</Badge>
                  <span className="text-bearish">{(Number(r.diracc_lift) * 100).toFixed(1)}%</span>
                  {sampleBadge(r.sample_n)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Full table */}
      <Card>
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Full Indicator Reliability</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-mono">INDICATOR</TableHead>
                <TableHead className="text-[10px] font-mono">ASSET</TableHead>
                <TableHead className="text-[10px] font-mono">REGIME</TableHead>
                <TableHead className="text-[10px] font-mono">SAMPLE N</TableHead>
                <TableHead className="text-[10px] font-mono">DIRACC LIFT</TableHead>
                <TableHead className="text-[10px] font-mono">EV LIFT</TableHead>
                <TableHead className="text-[10px] font-mono">FP RATE</TableHead>
                <TableHead className="text-[10px] font-mono">QUALITY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reliability.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-[10px] font-mono font-bold">{r.indicator_name}</TableCell>
                  <TableCell className="text-[10px] font-mono">{r.asset_id}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[8px] font-mono">{r.regime_label}</Badge></TableCell>
                  <TableCell className="text-[10px] font-mono">{r.sample_n}</TableCell>
                  <TableCell className={`text-[10px] font-mono ${Number(r.diracc_lift) > 0 ? "text-bullish" : "text-bearish"}`}>
                    {Number(r.diracc_lift) > 0 ? "+" : ""}{(Number(r.diracc_lift) * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className={`text-[10px] font-mono ${Number(r.ev_lift) > 0 ? "text-bullish" : "text-bearish"}`}>
                    {Number(r.ev_lift) > 0 ? "+" : ""}{Number(r.ev_lift).toFixed(4)}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">
                    {(Number(r.false_positive_rate) * 100).toFixed(1)}%
                    {Number(r.false_positive_rate) > 0.4 && <AlertTriangle className="h-3 w-3 text-destructive inline ml-1" />}
                  </TableCell>
                  <TableCell>{sampleBadge(r.sample_n)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
