import { useAnomalyHistory, useCheckAnomalies, useResolveAnomaly } from "@/hooks/use-safety-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Scan, CheckCircle2 } from "lucide-react";

const SEVERITY_CONFIG: Record<string, { className: string }> = {
  info: { className: "bg-primary/10 text-primary border-primary/30" },
  warn: { className: "bg-neutral-signal/10 text-neutral-signal border-neutral-signal/30" },
  critical: { className: "bg-bearish/10 text-bearish border-bearish/30" },
};

const EVENT_LABELS: Record<string, string> = {
  VOLATILITY_SPIKE: "Vol Spike",
  REGIME_BREAK: "Regime Break",
  DATA_GAP: "Data Gap",
  INTEGRITY_COLLAPSE: "Integrity ↓",
};

interface AnomalyPanelProps {
  selectedAsset?: string;
}

export default function AnomalyPanel({ selectedAsset }: AnomalyPanelProps) {
  const { data: historyRes, isLoading } = useAnomalyHistory(selectedAsset);
  const checkAnomalies = useCheckAnomalies();
  const resolveAnomaly = useResolveAnomaly();
  const events = historyRes?.data || [];

  const activeCount = events.filter((e: any) => !e.resolved).length;

  return (
    <Card>
      <CardHeader className="py-3 px-4 flex-row items-center justify-between">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-neutral-signal" />
          Anomaly Events
          {activeCount > 0 && (
            <Badge variant="outline" className="text-[8px] font-mono bg-bearish/10 text-bearish border-bearish/30 ml-1">
              {activeCount} active
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="outline" size="sm"
          className="h-7 text-[10px] font-mono gap-1"
          onClick={() => checkAnomalies.mutate(selectedAsset)}
          disabled={checkAnomalies.isPending}
        >
          <Scan className="h-3 w-3" />
          {checkAnomalies.isPending ? "Scanning…" : "Run Scan"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] font-mono">STATUS</TableHead>
              <TableHead className="text-[10px] font-mono">SEVERITY</TableHead>
              <TableHead className="text-[10px] font-mono">TYPE</TableHead>
              <TableHead className="text-[10px] font-mono">ASSET</TableHead>
              <TableHead className="text-[10px] font-mono">DESCRIPTION</TableHead>
              <TableHead className="text-[10px] font-mono">TIME</TableHead>
              <TableHead className="text-[10px] font-mono">ACTION</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8 font-mono">
                  Loading anomaly history…
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8 font-mono">
                  No anomalies detected. Run a scan to check.
                </TableCell>
              </TableRow>
            ) : events.map((e: any) => {
              const sevCfg = SEVERITY_CONFIG[e.severity] || SEVERITY_CONFIG.info;
              return (
                <TableRow key={e.id} className={e.resolved ? "opacity-50" : ""}>
                  <TableCell>
                    {e.resolved ? (
                      <Badge variant="outline" className="text-[9px] font-mono bg-muted text-muted-foreground">RESOLVED</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] font-mono bg-bearish/10 text-bearish border-bearish/30">ACTIVE</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[9px] font-mono ${sevCfg.className}`}>
                      {e.severity.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">{EVENT_LABELS[e.event_type] || e.event_type}</TableCell>
                  <TableCell className="text-[10px] font-mono font-bold">{e.asset_id}</TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[200px] truncate">{e.description}</TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">
                    {new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    {!e.resolved && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 text-[9px] font-mono gap-1"
                        onClick={() => resolveAnomaly.mutate(e.id)}
                        disabled={resolveAnomaly.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Resolve
                      </Button>
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
