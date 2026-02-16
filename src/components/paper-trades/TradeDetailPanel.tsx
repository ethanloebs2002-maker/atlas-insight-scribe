import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TradeChart, { type Candle } from "@/components/paper-trades/TradeChart";
import { useAssetAnalysis } from "@/hooks/use-crypto-data";
import { useLivePrice } from "@/hooks/use-live-price";
import type { TradeVM, PriceLevel } from "@/types/trade-vm";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, Bug, ChevronDown, BarChart3, Clock, Layers, Waves, Activity } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString()}`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  PROPOSED: "bg-secondary text-muted-foreground",
  PENDING_ENTRY: "bg-primary/20 text-primary",
  OPEN: "bg-bullish/10 text-bullish",
  CLOSED: "bg-muted text-muted-foreground",
};

const SIDE_COLORS: Record<string, string> = {
  LONG: "bg-bullish/10 text-bullish border-bullish",
  SHORT: "bg-bearish/10 text-bearish border-bearish",
};

export default function TradeDetailPanel({ vm }: { vm: TradeVM | null }) {
  const [debugOpen, setDebugOpen] = useState(false);

  if (!vm) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-6">
        <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-xs font-mono text-muted-foreground">
          Select a decision or trade to view details
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono font-bold">{vm.symbol}</span>
        <Badge variant="outline" className={`text-[8px] font-mono py-0 h-4 ${SIDE_COLORS[vm.side]}`}>
          {vm.side}
        </Badge>
        <Badge variant="outline" className={`text-[8px] font-mono py-0 h-4 ${STATUS_COLORS[vm.status]}`}>
          {vm.status.replace("_", " ")}
        </Badge>
        <Badge variant="secondary" className="text-[9px] font-mono">{vm.timeframe}</Badge>
        <Badge variant="secondary" className="text-[9px] font-mono">{vm.horizon}</Badge>
        {vm.resolutionWindow && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] font-mono border-dashed text-muted-foreground">
                  ⏱ {vm.resolutionWindow.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[9px] font-mono max-w-[220px]">
                <p className="font-bold mb-0.5">Expected Resolution Window</p>
                <p className="text-muted-foreground">Derived from: {vm.resolutionWindow.derivedFrom}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className="text-[10px] font-mono font-bold">{vm.probability.displayPct}%</span>
        {vm.probability.source !== "model" && (
          <span className="text-[8px] font-mono text-muted-foreground">({vm.probability.source})</span>
        )}
      </div>

      {/* TP / SL summary strip — always visible for non-PROPOSED trades */}
      {vm.status !== "PROPOSED" && (vm.prices.tp != null || vm.prices.sl != null) && (
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Entry</span>
            <span className="font-bold">{fmtPrice(vm.prices.filledEntry ?? vm.prices.plannedEntry)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">TP</span>
            <span className="font-bold text-bullish">{fmtPrice(vm.prices.tp)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">SL</span>
            <span className="font-bold text-bearish">{fmtPrice(vm.prices.sl)}</span>
          </div>
          {vm.prices.live != null && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-muted-foreground">Live</span>
              <span className="font-bold text-primary">{fmtPrice(vm.prices.live)}</span>
            </div>
          )}
        </div>
      )}

      {/* Tabbed content */}
      <Tabs defaultValue="chart" className="min-w-0">
        <TabsList className="font-mono text-[10px] bg-secondary">
          <TabsTrigger value="chart" className="text-[10px] gap-1"><BarChart3 className="h-3 w-3" />Chart</TabsTrigger>
          <TabsTrigger value="lifecycle" className="text-[10px] gap-1"><Clock className="h-3 w-3" />Lifecycle</TabsTrigger>
          <TabsTrigger value="levels" className="text-[10px] gap-1"><Layers className="h-3 w-3" />Levels</TabsTrigger>
          <TabsTrigger value="whale" className="text-[10px] gap-1"><Waves className="h-3 w-3" />Whale</TabsTrigger>
          <TabsTrigger value="market" className="text-[10px] gap-1"><Activity className="h-3 w-3" />Market</TabsTrigger>
        </TabsList>

        {/* Chart Tab */}
        <TabsContent value="chart" className="mt-3 min-w-0">
          <ChartWithLiveData vm={vm} />
        </TabsContent>

        {/* Lifecycle Tab */}
        <TabsContent value="lifecycle" className="mt-3">
          <Card>
            <CardContent className="py-3 px-3 space-y-2">
              <TimelineStep label="Decided" time={vm.timestamps.decidedAt} active />
              <TimelineStep label="Entry Placed" time={vm.timestamps.entryPlacedAt} active={vm.timestamps.entryPlacedAt != null} />
              <TimelineStep label="Entry Filled" time={vm.timestamps.entryFilledAt} active={vm.timestamps.entryFilledAt != null} />
              <TimelineStep label="Closed" time={vm.timestamps.closedAt} active={vm.timestamps.closedAt != null} />
              {vm.timestamps.expiresAt && (
                <TimelineStep label="Expires" time={vm.timestamps.expiresAt} active={false} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Levels Tab */}
        <TabsContent value="levels" className="mt-3">
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3 w-3" />
                Key Levels
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-2">
                <LevelCard level={vm.levels.entry} />
                <LevelCard level={vm.levels.sl} />
                <LevelCard level={vm.levels.tp} />
                <LevelCard level={vm.levels.live} />
                {vm.levels.exit && <LevelCard level={vm.levels.exit} />}
              </div>
              {vm.performance?.realizedR != null && (
                <div className="mt-2 pt-2 border-t border-border flex justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Return R</span>
                  <span className={vm.performance.realizedR >= 0 ? "text-bullish font-bold" : "text-bearish font-bold"}>
                    {vm.performance.realizedR.toFixed(3)}
                  </span>
                </div>
              )}
              {vm.performance?.realizedPnL != null && (
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">PnL</span>
                  <span className={vm.performance.realizedPnL >= 0 ? "text-bullish font-bold" : "text-bearish font-bold"}>
                    ${vm.performance.realizedPnL.toFixed(2)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Whale Context Tab */}
        <TabsContent value="whale" className="mt-3">
          <WhaleContextCard tradeId={vm.id} decisionId={vm.decisionId} />
        </TabsContent>

        {/* Market Context Tab */}
        <TabsContent value="market" className="mt-3">
          <MarketContextCard tradeId={vm.id} decisionId={vm.decisionId} />
        </TabsContent>
      </Tabs>

      {/* Debug section */}
      <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors w-full">
          <Bug className="h-3 w-3" />
          Diagnostics
          <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${debugOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="py-2 px-3 space-y-1 text-[9px] font-mono text-muted-foreground">
              <div>entry_source: <span className="text-foreground">{vm.debug?.entrySourceReason ?? "—"}</span></div>
              <div>probability_source: <span className="text-foreground">{vm.probability.source}</span></div>
              <div>decision_id: <span className="text-foreground break-all">{vm.decisionId}</span></div>
              <div>vm_id: <span className="text-foreground break-all">{vm.id}</span></div>
              {vm.debug?.gating && (
                <div className="mt-1 pt-1 border-t border-border">
                  <div className="font-bold text-foreground mb-0.5">Gating</div>
                  {Object.entries(vm.debug.gating).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="text-foreground">{JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function LevelCard({ level }: { level: PriceLevel }) {
  const kindColors: Record<string, string> = {
    ENTRY: "",
    TP: "text-bullish",
    SL: "text-bearish",
    LIVE: "text-primary",
    EXIT: "text-muted-foreground",
  };
  return (
    <div className="rounded border border-border bg-secondary/40 p-2">
      <div className="flex items-center gap-1">
        <div className="text-[9px] font-mono text-muted-foreground uppercase">{level.label}</div>
        <span className="text-[7px] font-mono text-muted-foreground/50 ml-auto">{level.source}</span>
      </div>
      <div className={`text-xs font-mono font-bold ${kindColors[level.kind] || ""}`}>
        {level.value != null ? `$${level.value.toLocaleString()}` : "—"}
      </div>
      {level.style !== "solid" && (
        <div className="text-[7px] font-mono text-muted-foreground/40">{level.style}</div>
      )}
    </div>
  );
}

function TimelineStep({ label, time, active }: { label: string; time: string | null | undefined; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[10px] font-mono ${active ? "text-foreground" : "text-muted-foreground/40"}`}>
      <div className={`h-2 w-2 rounded-full shrink-0 ${active ? "bg-primary" : "bg-muted-foreground/20"}`} />
      <span className="font-bold w-24">{label}</span>
      <span>{fmtTime(time)}</span>
    </div>
  );
}

function ChartWithLiveData({ vm }: { vm: TradeVM }) {
  const { data: analysis } = useAssetAnalysis(vm.symbol, vm.timeframe);
  const livePrice = useLivePrice({ symbol: vm.symbol, pollMs: 5000, enabled: true });

  const candles: Candle[] | undefined = analysis?.chartData?.map((c: any) => ({
    t: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
  }));

  // Build levels array with live price injected
  const levels = useMemo(() => {
    const arr: PriceLevel[] = [vm.levels.entry, vm.levels.tp, vm.levels.sl];
    if (vm.levels.exit) arr.push(vm.levels.exit);
    // Override live price from hook
    arr.push({
      value: livePrice,
      label: "Live",
      source: "MARKET",
      kind: "LIVE",
      style: livePrice != null ? "solid" : "ghost",
    });
    return arr;
  }, [vm.levels, livePrice]);

  return (
    <TradeChart
      candles={candles ?? []}
      levels={levels}
      side={vm.side}
      status={vm.status}
      symbol={vm.symbol}
      timeframe={vm.timeframe}
    />
  );
}

function WhaleContextCard({ tradeId, decisionId }: { tradeId: string; decisionId: string }) {
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["whale-context", tradeId, decisionId],
    queryFn: async () => {
      // Try trade_id first, fall back to decision_id
      const { data: byTrade } = await supabase
        .from("whale_context_snapshots")
        .select("*")
        .eq("trade_id", tradeId)
        .order("snapshot_time", { ascending: false })
        .limit(1);

      if (byTrade && byTrade.length > 0) return byTrade[0];

      const { data: byDecision } = await supabase
        .from("whale_context_snapshots")
        .select("*")
        .eq("decision_id", decisionId)
        .order("snapshot_time", { ascending: false })
        .limit(1);

      return byDecision?.[0] ?? null;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-[10px] font-mono text-muted-foreground">
          Loading whale context…
        </CardContent>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-[10px] font-mono text-muted-foreground">
          No whale context snapshot for this trade
        </CardContent>
      </Card>
    );
  }

  const rows: [string, string | number][] = [
    ["Snapshot", fmtTime(snapshot.snapshot_time)],
    ["1h signals", snapshot.window_1h_count],
    ["6h signals", snapshot.window_6h_count],
    ["24h signals", snapshot.window_24h_count],
    ["24h severity Σ", Number(snapshot.window_24h_severity_sum).toFixed(2)],
    ["Large trades (24h)", snapshot.large_trade_24h_count],
    ["Volume spikes (24h)", snapshot.volume_spike_24h_count],
    ["Large transfers (24h)", snapshot.large_transfer_24h_count],
    ["Exchange inflows (24h)", snapshot.exchange_inflow_24h_count],
    ["Exchange outflows (24h)", snapshot.exchange_outflow_24h_count],
    ["Flow bias (24h)", Number(snapshot.flow_bias_24h).toFixed(3)],
  ];

  if (snapshot.last_event_type) {
    rows.push(
      ["Last event", `${snapshot.last_event_type} (${snapshot.last_event_source})`],
      ["Last event $", snapshot.last_event_notional_usd != null ? `$${Number(snapshot.last_event_notional_usd).toLocaleString()}` : "—"],
      ["Last severity", snapshot.last_event_severity != null ? Number(snapshot.last_event_severity).toFixed(3) : "—"],
    );
  }

  const bias = Number(snapshot.flow_bias_24h);
  const biasColor = bias > 0.1 ? "text-bullish" : bias < -0.1 ? "text-bearish" : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Waves className="h-3 w-3" />
          Whale Context @ {fmtTime(snapshot.snapshot_time)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1">
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between text-[10px] font-mono">
            <span className="text-muted-foreground">{label}</span>
            <span className={label === "Flow bias (24h)" ? `font-bold ${biasColor}` : "text-foreground"}>
              {val}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MarketContextCard({ tradeId, decisionId }: { tradeId: string; decisionId: string }) {
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["market-context", tradeId, decisionId],
    queryFn: async () => {
      const { data: byTrade } = await supabase
        .from("market_context_snapshots")
        .select("*")
        .eq("trade_id", tradeId)
        .order("snapshot_time", { ascending: false })
        .limit(1);

      if (byTrade && byTrade.length > 0) return byTrade[0];

      const { data: byDecision } = await supabase
        .from("market_context_snapshots")
        .select("*")
        .eq("decision_id", decisionId)
        .order("snapshot_time", { ascending: false })
        .limit(1);

      return byDecision?.[0] ?? null;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-[10px] font-mono text-muted-foreground">
          Loading market context…
        </CardContent>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-6 text-center space-y-1">
          <Activity className="h-5 w-5 text-muted-foreground/30 mx-auto" />
          <p className="text-[10px] font-mono text-muted-foreground">
            No context snapshot yet — engine has not recorded this trade's market context.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rv1h = snapshot.rv_1h != null ? Number(snapshot.rv_1h) : null;
  const rv24h = snapshot.rv_24h != null ? Number(snapshot.rv_24h) : null;
  const obImb = snapshot.ob_imbalance != null ? Number(snapshot.ob_imbalance) : null;

  const regimeColor =
    snapshot.vol_regime === "expansion" ? "text-bearish" :
    snapshot.vol_regime === "compression" ? "text-primary" : "text-foreground";

  const imbLabel = obImb != null
    ? obImb > 0.05 ? "bid dominant" : obImb < -0.05 ? "ask dominant" : "balanced"
    : "";

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div>
          <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Market Context (Observed)
          </CardTitle>
          <p className="text-[8px] font-mono text-muted-foreground/60 mt-0.5">
            Captured at entry · Does not affect decisions yet
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1.5">
        <MctxRow label="Spread" value={snapshot.spread_bps != null ? `${Number(snapshot.spread_bps).toFixed(1)} bps` : "—"} />
        <MctxRow
          label="OB imbalance"
          value={obImb != null ? `${obImb.toFixed(3)} (${imbLabel})` : "—"}
          valueColor={obImb != null && obImb > 0.05 ? "text-bullish" : obImb != null && obImb < -0.05 ? "text-bearish" : undefined}
        />
        <MctxRow label="Vol regime" value={snapshot.vol_regime ?? "—"} valueColor={regimeColor} />
        <MctxRow
          label="RV 1h vs 24h"
          value={rv1h != null && rv24h != null ? `${(rv1h * 100).toFixed(2)}% / ${(rv24h * 100).toFixed(2)}%` : "—"}
        />
        <MctxRow label="Session" value={snapshot.session_detail ?? "—"} />
      </CardContent>
    </Card>
  );
}

function MctxRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between text-[10px] font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${valueColor ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
