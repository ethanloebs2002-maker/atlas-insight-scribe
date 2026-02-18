import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { COHORTS } from "@/hooks/use-cohort";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Archive, Target, FlaskConical, FileText } from "lucide-react";

const LEGACY = COHORTS.legacy;
const PAGE_SIZE = 100;

function useArchiveDecisions(symbol: string | null) {
  return useQuery({
    queryKey: ["archive-decisions", symbol],
    queryFn: async () => {
      let q = supabase
        .from("paper_decisions")
        .select("id, asset_id, timeframe, direction_pred, probability_pred, decision_type, engine_status, created_at, cohort_id")
        .eq("cohort_id", LEGACY)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (symbol) q = q.eq("asset_id", symbol);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useArchivePositions(symbol: string | null) {
  return useQuery({
    queryKey: ["archive-positions", symbol],
    queryFn: async () => {
      let q = supabase
        .from("paper_positions")
        .select("id, symbol, side, timeframe, status, outcome, entry_price, realized_pnl, created_at, closed_at, cohort_id")
        .eq("cohort_id", LEGACY)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (symbol) q = q.eq("symbol", symbol);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useArchiveOrders(symbol: string | null) {
  return useQuery({
    queryKey: ["archive-orders", symbol],
    queryFn: async () => {
      let q = supabase
        .from("paper_orders")
        .select("id, symbol, side, order_type, status, limit_price, stop_price, qty, created_at, cohort_id")
        .eq("cohort_id", LEGACY)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (symbol) q = q.eq("symbol", symbol);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ArchivePage() {
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null);

  const { data: decisions = [], isLoading: dLoading } = useArchiveDecisions(symbolFilter);
  const { data: positions = [], isLoading: pLoading } = useArchivePositions(symbolFilter);
  const { data: orders = [], isLoading: oLoading } = useArchiveOrders(symbolFilter);

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Archive className="h-4 w-4 text-pillar-memory" />
          <h1 className="text-sm font-mono font-bold tracking-wider text-pillar-memory">ARCHIVE</h1>
          <Badge variant="outline" className="text-[9px] font-mono border-pillar-memory/30 text-pillar-memory">
            LEGACY (PRE-BRAIN)
          </Badge>
          <div className="flex-1" />
          <Select value={symbolFilter ?? "__all__"} onValueChange={(v) => setSymbolFilter(v === "__all__" ? null : v)}>
            <SelectTrigger className="w-24 h-7 text-[10px] font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Assets</SelectItem>
              <SelectItem value="BTC">BTC</SelectItem>
              <SelectItem value="ETH">ETH</SelectItem>
              <SelectItem value="SOL">SOL</SelectItem>
              <SelectItem value="DOGE">DOGE</SelectItem>
              <SelectItem value="AVAX">AVAX</SelectItem>
              <SelectItem value="LINK">LINK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
          Read-only view of pre-Brain lifecycle data · cohort_id = legacy_prebrain
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 px-4 pt-3 pb-4">
        <Tabs defaultValue="decisions" className="h-full flex flex-col">
          <TabsList className="font-mono text-[10px] bg-secondary inline-flex w-max">
            <TabsTrigger value="decisions" className="text-[10px] gap-1">
              <Target className="h-3 w-3" />Decisions ({decisions.length})
            </TabsTrigger>
            <TabsTrigger value="positions" className="text-[10px] gap-1">
              <FlaskConical className="h-3 w-3" />Positions ({positions.length})
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-[10px] gap-1">
              <FileText className="h-3 w-3" />Orders ({orders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="decisions" className="flex-1 min-h-0 mt-3">
            <Card className="h-full">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] font-mono">Asset</TableHead>
                      <TableHead className="text-[9px] font-mono">Timeframe</TableHead>
                      <TableHead className="text-[9px] font-mono">Direction</TableHead>
                      <TableHead className="text-[9px] font-mono">Probability</TableHead>
                      <TableHead className="text-[9px] font-mono">Type</TableHead>
                      <TableHead className="text-[9px] font-mono">Status</TableHead>
                      <TableHead className="text-[9px] font-mono">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-xs font-mono text-muted-foreground py-8">Loading…</TableCell></TableRow>
                    ) : decisions.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-xs font-mono text-muted-foreground py-8">No legacy decisions found.</TableCell></TableRow>
                    ) : decisions.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-[10px] font-mono font-bold">{d.asset_id}</TableCell>
                        <TableCell className="text-[10px] font-mono">{d.timeframe}</TableCell>
                        <TableCell className="text-[10px] font-mono">
                          <Badge variant="outline" className={`text-[8px] ${d.direction_pred === "UP" ? "text-bullish" : d.direction_pred === "DOWN" ? "text-bearish" : "text-muted-foreground"}`}>
                            {d.direction_pred}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">{Number(d.probability_pred).toFixed(3)}</TableCell>
                        <TableCell className="text-[10px] font-mono">{d.decision_type ?? "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{d.engine_status}</TableCell>
                        <TableCell className="text-[9px] font-mono text-muted-foreground">{new Date(d.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>

          <TabsContent value="positions" className="flex-1 min-h-0 mt-3">
            <Card className="h-full">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] font-mono">Symbol</TableHead>
                      <TableHead className="text-[9px] font-mono">Side</TableHead>
                      <TableHead className="text-[9px] font-mono">Timeframe</TableHead>
                      <TableHead className="text-[9px] font-mono">Status</TableHead>
                      <TableHead className="text-[9px] font-mono">Outcome</TableHead>
                      <TableHead className="text-[9px] font-mono">Entry</TableHead>
                      <TableHead className="text-[9px] font-mono">PnL</TableHead>
                      <TableHead className="text-[9px] font-mono">Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-xs font-mono text-muted-foreground py-8">Loading…</TableCell></TableRow>
                    ) : positions.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-xs font-mono text-muted-foreground py-8">No legacy positions found.</TableCell></TableRow>
                    ) : positions.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-[10px] font-mono font-bold">{p.symbol}</TableCell>
                        <TableCell className="text-[10px] font-mono">{p.side}</TableCell>
                        <TableCell className="text-[10px] font-mono">{p.timeframe}</TableCell>
                        <TableCell className="text-[10px] font-mono">{p.status}</TableCell>
                        <TableCell className="text-[10px] font-mono">{p.outcome ?? "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{p.entry_price ? Number(p.entry_price).toFixed(2) : "—"}</TableCell>
                        <TableCell className={`text-[10px] font-mono ${Number(p.realized_pnl) > 0 ? "text-bullish" : Number(p.realized_pnl) < 0 ? "text-bearish" : ""}`}>
                          {p.realized_pnl != null ? Number(p.realized_pnl).toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-[9px] font-mono text-muted-foreground">{p.closed_at ? new Date(p.closed_at).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="flex-1 min-h-0 mt-3">
            <Card className="h-full">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] font-mono">Symbol</TableHead>
                      <TableHead className="text-[9px] font-mono">Side</TableHead>
                      <TableHead className="text-[9px] font-mono">Type</TableHead>
                      <TableHead className="text-[9px] font-mono">Status</TableHead>
                      <TableHead className="text-[9px] font-mono">Limit</TableHead>
                      <TableHead className="text-[9px] font-mono">Stop</TableHead>
                      <TableHead className="text-[9px] font-mono">Qty</TableHead>
                      <TableHead className="text-[9px] font-mono">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {oLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-xs font-mono text-muted-foreground py-8">Loading…</TableCell></TableRow>
                    ) : orders.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-xs font-mono text-muted-foreground py-8">No legacy orders found.</TableCell></TableRow>
                    ) : orders.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-[10px] font-mono font-bold">{o.symbol}</TableCell>
                        <TableCell className="text-[10px] font-mono">{o.side}</TableCell>
                        <TableCell className="text-[10px] font-mono">{o.order_type}</TableCell>
                        <TableCell className="text-[10px] font-mono">{o.status}</TableCell>
                        <TableCell className="text-[10px] font-mono">{o.limit_price ? Number(o.limit_price).toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{o.stop_price ? Number(o.stop_price).toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{o.qty}</TableCell>
                        <TableCell className="text-[9px] font-mono text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
