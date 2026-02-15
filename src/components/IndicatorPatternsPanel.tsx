import { useIndicatorPatterns, useComputeReliability, useLinkOutcomes, useMinePatterns } from "@/hooks/use-indicator-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Play, Link, BarChart3, Loader2 } from "lucide-react";

interface Props {
  selectedAsset?: string;
}

export default function IndicatorPatternsPanel({ selectedAsset }: Props) {
  const { data: patternsRes, isLoading } = useIndicatorPatterns(selectedAsset);
  const patterns = patternsRes?.data || [];

  const linkOutcomes = useLinkOutcomes();
  const computeReliability = useComputeReliability();
  const minePatterns = useMinePatterns();

  const confidenceColor = (tier: string) => {
    if (tier === "high") return "bg-bullish/20 text-bullish border-bullish";
    if (tier === "medium") return "bg-primary/20 text-primary border-primary";
    return "bg-secondary text-muted-foreground";
  };

  const renderConditions = (conditions: any[]) => {
    return conditions.map((c: any, i: number) => (
      <span key={i} className="inline-flex items-center gap-1">
        <Badge variant="outline" className="text-[8px] font-mono">{c.indicator}</Badge>
        <span className="text-[9px] font-mono text-muted-foreground">{c.field} {c.op} {c.value}</span>
        {i < conditions.length - 1 && <span className="text-[9px] text-muted-foreground mx-1">AND</span>}
      </span>
    ));
  };

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground mr-2">Pipeline:</span>
          <Button
            variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1.5"
            onClick={() => linkOutcomes.mutate(selectedAsset)}
            disabled={linkOutcomes.isPending}
          >
            {linkOutcomes.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link className="h-3 w-3" />}
            1. Link Outcomes
          </Button>
          <Button
            variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1.5"
            onClick={() => selectedAsset && computeReliability.mutate({ asset: selectedAsset })}
            disabled={!selectedAsset || computeReliability.isPending}
          >
            {computeReliability.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
            2. Compute Reliability
          </Button>
          <Button
            variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1.5"
            onClick={() => selectedAsset && minePatterns.mutate({ asset: selectedAsset })}
            disabled={!selectedAsset || minePatterns.isPending}
          >
            {minePatterns.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            3. Mine Patterns
          </Button>
          {!selectedAsset && (
            <span className="text-[9px] font-mono text-destructive ml-2">Select an asset to run reliability & mining</span>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <Card><CardContent className="py-12 text-center"><p className="text-xs font-mono text-muted-foreground">Loading patterns...</p></CardContent></Card>
      )}

      {!isLoading && patterns.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-xs font-mono text-muted-foreground">No discovered patterns yet. Run the pipeline above to discover indicator patterns.</p>
          </CardContent>
        </Card>
      )}

      {patterns.length > 0 && (
        <>
          {/* Active vs Expired summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="py-2 px-3">
              <div className="text-[9px] font-mono text-muted-foreground uppercase mb-0.5">Active Patterns</div>
              <div className="text-lg font-mono font-bold text-primary">{patterns.filter((p: any) => p.is_active).length}</div>
            </Card>
            <Card className="py-2 px-3">
              <div className="text-[9px] font-mono text-muted-foreground uppercase mb-0.5">Expired</div>
              <div className="text-lg font-mono font-bold text-muted-foreground">{patterns.filter((p: any) => !p.is_active).length}</div>
            </Card>
          </div>

          {/* Patterns Table */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Discovered Patterns</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-mono">STATUS</TableHead>
                    <TableHead className="text-[10px] font-mono">ASSET</TableHead>
                    <TableHead className="text-[10px] font-mono">REGIME</TableHead>
                    <TableHead className="text-[10px] font-mono">CONDITIONS</TableHead>
                    <TableHead className="text-[10px] font-mono">DECISIONS</TableHead>
                    <TableHead className="text-[10px] font-mono">TRADES</TableHead>
                    <TableHead className="text-[10px] font-mono">DIRACC ↑</TableHead>
                    <TableHead className="text-[10px] font-mono">EV ↑</TableHead>
                    <TableHead className="text-[10px] font-mono">STABILITY</TableHead>
                    <TableHead className="text-[10px] font-mono">CONFIDENCE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patterns.map((p: any) => (
                    <TableRow key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"} className="text-[8px] font-mono">
                          {p.is_active ? "ACTIVE" : "EXPIRED"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono font-bold">{p.asset_id}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[8px] font-mono">{p.regime_label}</Badge></TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex flex-wrap gap-1">{renderConditions(p.conditions_json || [])}</div>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{p.support_n_decisions}</TableCell>
                      <TableCell className="text-[10px] font-mono">{p.support_n_trades}</TableCell>
                      <TableCell className="text-[10px] font-mono text-bullish">+{(Number(p.diracc_uplift) * 100).toFixed(1)}%</TableCell>
                      <TableCell className={`text-[10px] font-mono ${Number(p.ev_uplift) > 0 ? "text-bullish" : "text-bearish"}`}>
                        {Number(p.ev_uplift) > 0 ? "+" : ""}{Number(p.ev_uplift).toFixed(4)}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{(Number(p.stability_score) * 100).toFixed(0)}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[8px] font-mono ${confidenceColor(p.confidence_tier)}`}>
                          {p.confidence_tier.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
