import { useState } from "react";
import { usePaperStats } from "@/hooks/use-paper-engine";
import { asProbability } from "@/types/probability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Play, Pause, Download, Shield, Target, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Minus, Zap, Clock, ArrowRightLeft, BarChart3,
  Sparkles, Search, ShieldAlert, Scan, Timer, Gauge, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LearningSourcesPanel from "@/components/LearningSourcesPanel";
import IndicatorBreakdownPanel from "@/components/IndicatorBreakdownPanel";
import IndicatorReliabilityPanel from "@/components/IndicatorReliabilityPanel";
import IndicatorPatternsPanel from "@/components/IndicatorPatternsPanel";
import SystemStatusBanner from "@/components/SystemStatusBanner";
import PatternTierPanel from "@/components/PatternTierPanel";
import AnomalyPanel from "@/components/AnomalyPanel";
import EvaluateButton from "@/components/EvaluateButton";
import RunAnalysisEmptyState from "@/components/RunAnalysisEmptyState";
import BestTimeframeBadge from "@/components/BestTimeframeBadge";
import TimeframePerformancePanel from "@/components/TimeframePerformancePanel";
import DetailPanel, { type SelectedItem } from "@/components/paper-trades/DetailPanel";
import { useIncorporatedAssets, runAutoEvalTick } from "@/hooks/use-auto-eval";
import { type EvalCadence, CADENCE_OPTIONS } from "@/lib/eval-cadence";
import { useAutoEvaluationScheduler } from "@/hooks/use-auto-eval-scheduler";
import { useIsMobile } from "@/hooks/use-mobile";

export default function PaperTrades() {
  const [selectedAsset, setSelectedAsset] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [showLearning, setShowLearning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [debugProb, setDebugProb] = useState(false);
  const isMobile = useIsMobile();

  const sched = useAutoEvaluationScheduler(runAutoEvalTick, !paused && !!selectedAsset);
  const { data: assetsRes } = useIncorporatedAssets();
  const incorporatedAssets = (assetsRes?.data || []) as { asset_id: string; symbol: string; is_enabled: boolean }[];
  const ASSETS = incorporatedAssets.length > 0
    ? incorporatedAssets.filter(a => a.is_enabled).map(a => a.asset_id)
    : ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];
  const { data: statsRes, isLoading } = usePaperStats(selectedAsset, true);

  const stats = statsRes?.data;
  const decisions = stats?.decisions || [];
  const trades = stats?.trades || [];
  const graduation = stats?.graduation || [];
  const confusionMatrix = stats?.confusionMatrix || { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };
  const bhHorizonStats = stats?.bhHorizonStats || {};
  const config = stats?.config || { publicHorizons: ["6m", "1y", "3y", "5y"], learningHorizons: ["3m", "6m", "1y", "3y", "5y"], cadenceMap: {} };

  // Deduplicate active trades
  const deduplicatedActive = (() => {
    const active = trades.filter((t: any) => t.status === "OPEN" || t.status === "PENDING");
    const byKey = new Map<string, any>();
    for (const t of active) {
      const key = t.duplicate_key || t.id;
      const existing = byKey.get(key);
      if (!existing || new Date(t.created_at) > new Date(existing.created_at)) {
        byKey.set(key, t);
      }
    }
    return Array.from(byKey.values());
  })();

  const openTrades = deduplicatedActive.filter((t: any) => t.status === "OPEN");
  const pendingTrades = deduplicatedActive.filter((t: any) => t.status === "PENDING");
  const TERMINAL_STATUSES = ["CLOSED", "CANCELED_DEDUPE", "CANCELED_LIMIT", "ERROR", "CLOSED_TIME", "CLOSED_TP", "CLOSED_SL"];
  const closedTrades = trades.filter((t: any) => TERMINAL_STATUSES.includes(t.status));

  const evaluatedDecisions = decisions.filter((d: any) => d.evaluated_at);
  const correctDecisions = evaluatedDecisions.filter((d: any) => d.correct);
  const dirAcc = evaluatedDecisions.length > 0 ? (correctDecisions.length / evaluatedDecisions.length * 100) : 0;
  const closedReturns = closedTrades.filter((t: any) => t.return_r !== null).map((t: any) => t.return_r);
  const avgR = closedReturns.length > 0 ? closedReturns.reduce((a: number, b: number) => a + b, 0) / closedReturns.length : 0;
  const sortedR = [...closedReturns].sort((a: number, b: number) => a - b);
  const medianR = sortedR.length > 0 ? sortedR[Math.floor(sortedR.length / 2)] : 0;
  const wins = closedTrades.filter((t: any) => t.outcome_label === "WIN").length;
  const losses = closedTrades.filter((t: any) => t.outcome_label === "LOSS").length;
  const visibleHorizons = showLearning ? config.learningHorizons : config.publicHorizons;

  // Filter by search
  const filterBySearch = (items: any[], field = "asset_id") =>
    searchQuery ? items.filter((i: any) => i[field]?.toLowerCase().includes(searchQuery.toLowerCase())) : items;

  const selectItem = (item: SelectedItem) => {
    setSelectedItem(item);
    if (isMobile) setMobileDetailOpen(true);
  };

  const isSelected = (id: string) => selectedItem?.id === id;

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* System Status */}
      <SystemStatusBanner asset={selectedAsset} />

      {/* ─── STICKY COMMAND BAR ────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Left: Title */}
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <h1 className="text-sm font-mono font-bold tracking-wider text-primary truncate">PAPER TRADES</h1>
            <BestTimeframeBadge asset={selectedAsset} />
          </div>

          <div className="flex-1" />

          {/* Right: Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Select value={selectedAsset || "all"} onValueChange={(v) => setSelectedAsset(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-24 h-7 text-[10px] font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                {ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="hidden sm:flex items-center gap-1">
              <Gauge className="h-3 w-3 text-muted-foreground" />
              <Select value={sched.cadence} onValueChange={(v) => sched.setCadence(v as EvalCadence)}>
                <SelectTrigger className="w-20 h-7 text-[10px] font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1 hidden sm:flex" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? "Resume" : "Pause"}
            </Button>

            <EvaluateButton selectedAsset={selectedAsset} />

            {/* More menu for overflow controls */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono text-xs">
                <DropdownMenuItem className="gap-2 sm:hidden" onClick={() => setPaused(!paused)}>
                  {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {paused ? "Resume" : "Pause"}
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <Download className="h-3 w-3" />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
          Auto-eval: {sched.cadence} | Last: {sched.lastRunAt} | Runs: {sched.runCount}
        </p>
      </div>

      {/* ─── SUMMARY CARDS ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-4 pt-3">
        <SummaryCard label="Total Decisions" value={decisions.length} icon={<Target className="h-3 w-3" />} />
        <SummaryCard label="Dir. Accuracy" value={`${dirAcc.toFixed(1)}%`} icon={<TrendingUp className="h-3 w-3" />} accent={dirAcc >= 65} />
        <SummaryCard label="Avg R" value={avgR.toFixed(3)} icon={<TrendingUp className="h-3 w-3" />} accent={avgR > 0} />
        <SummaryCard label="Win Rate" value={closedTrades.length > 0 ? `${((wins / closedTrades.length) * 100).toFixed(1)}%` : "—"} icon={<CheckCircle2 className="h-3 w-3" />} />
        <SummaryCard label="Open / Pending" value={`${openTrades.length} / ${pendingTrades.length}`} icon={<Shield className="h-3 w-3" />} />
      </div>

      {/* ─── MAIN CONTENT ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-4 pt-3 pb-4">
        <Tabs defaultValue="decisions" className="h-full flex flex-col min-w-0">
          <div className="w-full overflow-x-auto">
            <TabsList className="font-mono text-[10px] bg-secondary inline-flex w-max">
              <TabsTrigger value="decisions" className="text-[10px]">Decisions</TabsTrigger>
              <TabsTrigger value="open" className="text-[10px]">Open ({openTrades.length + pendingTrades.length})</TabsTrigger>
              <TabsTrigger value="closed" className="text-[10px]">Closed ({closedTrades.length})</TabsTrigger>
              <TabsTrigger value="health" className="text-[10px]">Health</TabsTrigger>
              <TabsTrigger value="graduation" className="text-[10px]">Graduation</TabsTrigger>
              <TabsTrigger value="bh-learning" className="text-[10px] gap-1"><Zap className="h-3 w-3" />B&H</TabsTrigger>
              <TabsTrigger value="transfer" className="text-[10px] gap-1"><ArrowRightLeft className="h-3 w-3" />Transfer</TabsTrigger>
              <TabsTrigger value="indicator-breakdown" className="text-[10px] gap-1"><Search className="h-3 w-3" />Breakdown</TabsTrigger>
              <TabsTrigger value="reliability" className="text-[10px] gap-1"><BarChart3 className="h-3 w-3" />Reliability</TabsTrigger>
              <TabsTrigger value="patterns" className="text-[10px] gap-1"><Sparkles className="h-3 w-3" />Patterns</TabsTrigger>
              <TabsTrigger value="pattern-tiers" className="text-[10px] gap-1"><ShieldAlert className="h-3 w-3" />Tiers</TabsTrigger>
              <TabsTrigger value="anomalies" className="text-[10px] gap-1"><Scan className="h-3 w-3" />Anomalies</TabsTrigger>
              <TabsTrigger value="tf-performance" className="text-[10px] gap-1"><Timer className="h-3 w-3" />TF Perf</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── DECISIONS (two-column) ─────────────────────── */}
          <TabsContent value="decisions" className="flex-1 min-h-0 mt-3">
            {decisions.length === 0 ? (
              <RunAnalysisEmptyState selectedAsset={selectedAsset} timeframe="4h" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-w-0">
                {/* Left: compact list */}
                <div className="lg:col-span-5 min-w-0 flex flex-col">
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      placeholder="Search asset..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-7 text-[10px] font-mono flex-1"
                    />
                    <label className="flex items-center gap-1 shrink-0 cursor-pointer select-none">
                      <Switch checked={debugProb} onCheckedChange={setDebugProb} className="h-4 w-8 [&>span]:h-3 [&>span]:w-3" />
                      <span className="text-[9px] font-mono text-muted-foreground">Debug Prob</span>
                    </label>
                  </div>
                  <ScrollArea className="flex-1 max-h-[calc(100vh-320px)]">
                    <div className="space-y-1 pr-2">
                      {filterBySearch(decisions).slice(0, 100).map((d: any) => (
                        <DecisionRow
                          key={d.id}
                          d={d}
                          selected={isSelected(d.id)}
                          debugProb={debugProb}
                          onClick={() => selectItem({
                            kind: "decision", id: d.id, asset_id: d.asset_id, timeframe: d.timeframe || "4h",
                            horizon: d.horizon, direction_pred: d.direction_pred, probability_pred: d.probability_pred,
                            ref_price: d.ref_price, agreement_score: d.agreement_score, consensus_score: d.consensus_score,
                            realized_dir: d.realized_dir, correct: d.correct, evaluated_at: d.evaluated_at,
                            emitted_by: d.emitted_by, emit_run_id: d.emit_run_id, emitted_at: d.emitted_at,
                            ts: d.ts, evidence_snapshot_json: d.evidence_snapshot_json,
                          })}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                {/* Right: detail panel (desktop) */}
                {!isMobile && (
                  <div className="lg:col-span-7 min-w-0 hidden lg:block">
                    <Card className="h-full">
                      <CardContent className="p-4 h-full overflow-auto">
                        <DetailPanel item={selectedItem?.kind === "decision" ? selectedItem : null} />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ─── OPEN TRADES (two-column) ────────────────────── */}
          <TabsContent value="open" className="flex-1 min-h-0 mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-w-0">
              <div className="lg:col-span-5 min-w-0 flex flex-col">
                <ScrollArea className="flex-1 max-h-[calc(100vh-300px)]">
                  <div className="space-y-1 pr-2">
                    {[...openTrades, ...pendingTrades].length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-8 font-mono">No open trades.</div>
                    ) : filterBySearch([...openTrades, ...pendingTrades]).map((t: any) => (
                      <TradeRow
                        key={t.id}
                        t={t}
                        variant="open"
                        selected={isSelected(t.id)}
                        onClick={() => selectItem({
                          kind: "open", id: t.id, asset_id: t.asset_id, timeframe: t.timeframe || "4h",
                          status: t.status, scenario_type: t.scenario_type, fill_price: t.fill_price,
                          entry_zone_low: t.entry_zone_low, entry_zone_high: t.entry_zone_high,
                          stop_level: t.stop_level, targets_json: t.targets_json, regime_label: t.regime_label,
                          time_window_end: t.time_window_end,
                        })}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
              {!isMobile && (
                <div className="lg:col-span-7 min-w-0 hidden lg:block">
                  <Card className="h-full">
                    <CardContent className="p-4 h-full overflow-auto">
                      <DetailPanel item={selectedItem?.kind === "open" ? selectedItem : null} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── CLOSED TRADES (two-column) ──────────────────── */}
          <TabsContent value="closed" className="flex-1 min-h-0 mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-w-0">
              <div className="lg:col-span-5 min-w-0 flex flex-col">
                <ScrollArea className="flex-1 max-h-[calc(100vh-300px)]">
                  <div className="space-y-1 pr-2">
                    {closedTrades.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-8 font-mono">No closed trades yet.</div>
                    ) : filterBySearch(closedTrades).map((t: any) => (
                      <TradeRow
                        key={t.id}
                        t={t}
                        variant="closed"
                        selected={isSelected(t.id)}
                        onClick={() => selectItem({
                          kind: "closed", id: t.id, asset_id: t.asset_id, timeframe: t.timeframe || "4h",
                          status: t.status, scenario_type: t.scenario_type, fill_price: t.fill_price,
                          entry_zone_low: t.entry_zone_low, entry_zone_high: t.entry_zone_high,
                          stop_level: t.stop_level, targets_json: t.targets_json, regime_label: t.regime_label,
                          return_r: t.return_r, return_pct: t.return_pct, outcome_label: t.outcome_label,
                          close_reason: t.close_reason, exit_price: t.exit_price,
                        })}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
              {!isMobile && (
                <div className="lg:col-span-7 min-w-0 hidden lg:block">
                  <Card className="h-full">
                    <CardContent className="p-4 h-full overflow-auto">
                      <DetailPanel item={selectedItem?.kind === "closed" ? selectedItem : null} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── LEARNING HEALTH ─────────────────────────────── */}
          <TabsContent value="health" className="mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Confusion Matrix</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                    <div className="text-muted-foreground text-center p-2">Pred↓ / Act→</div>
                    <div className="text-center p-2 font-bold text-bullish">UP</div>
                    <div className="text-center p-2 font-bold text-bearish">DOWN</div>
                    <div className="text-center p-2 font-bold text-neutral-signal">NEUTRAL</div>
                    {(["UP", "DOWN", "NEUTRAL"] as const).map(pred => (
                      <>
                        <div key={`label-${pred}`} className={`p-2 font-bold ${pred === "UP" ? "text-bullish" : pred === "DOWN" ? "text-bearish" : "text-neutral-signal"}`}>{pred}</div>
                        {(["UP", "DOWN", "NEUTRAL"] as const).map(act => {
                          const val = confusionMatrix[pred]?.[act] || 0;
                          const isCorrect = pred === act;
                          return (
                            <div key={`${pred}-${act}`} className={`p-2 text-center rounded ${isCorrect ? "bg-primary/10 text-primary font-bold" : "bg-secondary text-muted-foreground"}`}>
                              {val}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Expectancy Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MetricRow label="Average Return R" value={avgR.toFixed(4)} positive={avgR > 0} />
                  <MetricRow label="Median R" value={medianR.toFixed(4)} positive={medianR > 0} />
                  <MetricRow label="Win Rate" value={closedTrades.length > 0 ? `${((wins / closedTrades.length) * 100).toFixed(1)}%` : "—"} positive={wins > losses} />
                  <MetricRow label="W / L" value={`${wins} / ${losses}`} positive={wins > losses} />
                  <MetricRow label="Total Closed" value={String(closedTrades.length)} />
                  <MetricRow label="Directional Accuracy" value={`${dirAcc.toFixed(1)}%`} positive={dirAcc >= 65} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── GRADUATION STATUS ───────────────────────────── */}
          <TabsContent value="graduation" className="mt-3">
            <div className="space-y-4">
              {graduation.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-xs font-mono text-muted-foreground">No graduation data yet.</p>
                  </CardContent>
                </Card>
              ) : graduation.map((g: any) => (
                <Card key={g.id} className="overflow-hidden">
                  <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-bold">{g.asset_id}</span>
                      <Badge variant="secondary" className="text-[9px] font-mono">{g.timeframe} / {g.horizon}</Badge>
                      {g.horizon === "3m" && <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary"><Zap className="h-2.5 w-2.5 mr-1" />FAST</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationLevelBadge level={g.graduation_level} />
                      <Badge variant={g.integrity_gating_pass ? "default" : "destructive"} className="text-[9px] font-mono">{g.influence_mode}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <GateCard label="Decisions" value={g.n_decisions} required={g.horizon === "3m" ? 40 : 500} />
                      <GateCard label="Opened Trades" value={g.n_opened_trades} required={g.horizon === "3m" ? "—" : 150} pass={g.horizon === "3m" ? true : undefined} />
                      <GateCard label="Dir. Accuracy" value={`${(Number(g.dir_acc) * 100).toFixed(1)}%`} required={g.horizon === "3m" ? "≥62%" : "≥65%"} pass={Number(g.dir_acc) >= (g.horizon === "3m" ? 0.62 : 0.65)} />
                      <GateCard label="Avg Return R" value={Number(g.avg_return_r).toFixed(4)} required=">0.00" pass={Number(g.avg_return_r) > 0} />
                    </div>
                    {g.graduation_level < (g.horizon === "3m" ? 1 : 3) && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                          <span>Progress to Level {g.graduation_level + 1}</span>
                          <span>{Math.min(100, Math.round((g.n_decisions / (g.horizon === "3m" ? 40 : 500)) * 100))}%</span>
                        </div>
                        <Progress value={Math.min(100, (g.n_decisions / (g.horizon === "3m" ? 40 : 500)) * 100)} className="h-1.5" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Learning Firewall Levels
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { level: 0, label: "No Influence", desc: "System operates independently" },
                      { level: 1, label: "Calibration Only", desc: "Probability calibration from history" },
                      { level: 2, label: "Bounded Weights", desc: "Signal weights adjusted within bounds" },
                      { level: 3, label: "Bounded Sizing", desc: "Position sizing influenced by performance" },
                    ].map(fw => (
                      <div key={fw.level} className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <GraduationLevelBadge level={fw.level} />
                          <span className="text-[10px] font-mono font-bold">{fw.label}</span>
                        </div>
                        <p className="text-[9px] font-mono text-muted-foreground">{fw.desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── BUY & HOLD LEARNING ─────────────────────────── */}
          <TabsContent value="bh-learning" className="mt-3">
            <div className="space-y-4">
              <Card>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-xs font-mono font-bold">Show learning horizons</span>
                  </div>
                  <Switch checked={showLearning} onCheckedChange={setShowLearning} />
                </CardContent>
              </Card>
              <FastFeedbackCard stats={bhHorizonStats["3m"]} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleHorizons.map(h => {
                  const hStats = bhHorizonStats[h];
                  if (!hStats) return null;
                  return (
                    <Card key={h} className={`overflow-hidden ${h === "3m" ? "border-primary/20" : ""}`}>
                      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold">{h.toUpperCase()}</span>
                          {hStats.isLearningOnly && <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary">LEARNING</Badge>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[9px] font-mono text-muted-foreground">{hStats.cadence}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <MetricRow label="Total Decisions" value={String(hStats.totalDecisions)} />
                        <MetricRow label="Evaluated" value={String(hStats.evaluatedDecisions)} />
                        <MetricRow label="Dir. Accuracy" value={hStats.evaluatedDecisions > 0 ? `${(hStats.dirAcc * 100).toFixed(1)}%` : "—"} positive={hStats.dirAcc >= 0.62} />
                        <MetricRow label="Avg Return R" value={Number(hStats.avgReturnR).toFixed(4)} positive={Number(hStats.avgReturnR) > 0} />
                        <MetricRow label="Graduation Level" value={`L${hStats.graduationLevel}`} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    Cadence Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(config.cadenceMap || {}).map(([horizon, cadence]) => (
                      <div key={horizon} className={`rounded-lg border p-2.5 space-y-0.5 ${horizon === "3m" ? "border-primary/20 bg-primary/5" : "border-border bg-secondary/30"}`}>
                        <div className="text-xs font-mono font-bold">{horizon.toUpperCase()}</div>
                        <div className="text-[9px] font-mono text-muted-foreground uppercase">{cadence as string}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="transfer" className="mt-3"><LearningSourcesPanel selectedAsset={selectedAsset} /></TabsContent>
          <TabsContent value="indicator-breakdown" className="mt-3"><IndicatorBreakdownPanel decisions={decisions} /></TabsContent>
          <TabsContent value="reliability" className="mt-3"><IndicatorReliabilityPanel selectedAsset={selectedAsset} /></TabsContent>
          <TabsContent value="patterns" className="mt-3"><IndicatorPatternsPanel selectedAsset={selectedAsset} /></TabsContent>
          <TabsContent value="pattern-tiers" className="mt-3"><PatternTierPanel selectedAsset={selectedAsset} /></TabsContent>
          <TabsContent value="anomalies" className="mt-3"><AnomalyPanel selectedAsset={selectedAsset} /></TabsContent>
          <TabsContent value="tf-performance" className="mt-3"><TimeframePerformancePanel asset={selectedAsset} /></TabsContent>
        </Tabs>
      </div>

      {/* ─── MOBILE DETAIL DRAWER ───────────────────────────── */}
      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
            <SheetTitle className="text-sm font-mono">Detail</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-60px)]">
            <div className="p-4">
              <DetailPanel item={selectedItem} />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── COMPACT LIST ROW COMPONENTS ────────────────────────────────

function DecisionRow({ d, selected, onClick, debugProb = false }: { d: any; selected: boolean; onClick: () => void; debugProb?: boolean }) {
  const probValue = Number(d.probability_pred);
  const probDisplay = Number.isFinite(probValue) ? (probValue * 100).toFixed(2) : "—";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border p-2.5 transition-colors cursor-pointer ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-mono font-bold shrink-0">{d.asset_id}</span>
        <DirBadge dir={d.direction_pred} />
        <span className="text-[10px] font-mono font-bold">
          {probDisplay}%
        </span>
        <div className="flex-1" />
        {d.correct != null && (
          d.correct
            ? <CheckCircle2 className="h-3 w-3 text-bullish shrink-0" />
            : <XCircle className="h-3 w-3 text-bearish shrink-0" />
        )}
        <Badge variant="outline" className="text-[8px] font-mono shrink-0">{d.emitted_by || "?"}</Badge>
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <Badge variant="secondary" className="text-[8px] font-mono py-0 h-4">{d.timeframe || "4h"}</Badge>
        <Badge variant="secondary" className="text-[8px] font-mono py-0 h-4">{d.horizon}</Badge>
        {debugProb && (
          <>
            <Badge variant="outline" className="text-[8px] font-mono py-0 h-4 border-primary/30 text-primary">
              RAW {d.probability_raw != null ? Number(d.probability_raw).toFixed(4) : "—"}
            </Badge>
            <Badge variant="outline" className="text-[8px] font-mono py-0 h-4 border-primary/30 text-primary">
              SRC {d.probability_source || "—"}
            </Badge>
          </>
        )}
        <span className="text-[9px] font-mono text-muted-foreground ml-auto truncate">
          {new Date(d.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </button>
  );
}

function TradeRow({ t, variant, selected, onClick }: { t: any; variant: "open" | "closed"; selected: boolean; onClick: () => void }) {
  const fillPrice = t.fill_price ? Number(t.fill_price) : null;
  const stopLevel = Number(t.stop_level);
  const tradeTargets: number[] = Array.isArray(t.targets_json)
    ? t.targets_json.map((tp: any) => Number(tp.price ?? tp)).filter((n: number) => !isNaN(n) && n > 0)
    : [];
  const tpSummary = tradeTargets.length > 0
    ? tradeTargets.map((tp, i) => `TP${i + 1} ${tp.toLocaleString()}`).join(" | ")
    : "—";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border p-2.5 transition-colors cursor-pointer ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-mono font-bold shrink-0">{t.asset_id}</span>
        <ScenarioBadge type={t.scenario_type} />
        {variant === "open" && (
          <Badge variant={t.status === "OPEN" ? "default" : "secondary"} className="text-[8px] font-mono py-0 h-4">
            {t.status}
          </Badge>
        )}
        {variant === "closed" && t.outcome_label && (
          <OutcomeBadge outcome={t.outcome_label} />
        )}
        <div className="flex-1" />
        {variant === "closed" && t.return_r != null && (
          <span className={`text-[10px] font-mono font-bold ${Number(t.return_r) >= 0 ? "text-bullish" : "text-bearish"}`}>
            {Number(t.return_r).toFixed(3)}R
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono text-muted-foreground flex-wrap">
        {variant === "open" && (
          <>
            <span>{fillPrice ? `Fill $${fillPrice.toLocaleString()}` : "Pending fill"}</span>
            <span className="text-muted-foreground/40">•</span>
            <span className="text-bearish">SL {stopLevel.toLocaleString()}</span>
            <span className="text-muted-foreground/40">•</span>
            <span className="truncate">{tpSummary}</span>
          </>
        )}
        {variant === "closed" && (
          <>
            {fillPrice && <span>Entry ${fillPrice.toLocaleString()}</span>}
            {t.exit_price && (
              <>
                <span className="text-muted-foreground/40">→</span>
                <span>Exit ${Number(t.exit_price).toLocaleString()}</span>
              </>
            )}
            {t.close_reason && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="truncate max-w-[120px]">{t.close_reason}</span>
              </>
            )}
          </>
        )}
      </div>
    </button>
  );
}

// ─── FAST FEEDBACK (3M) CARD ─────────────────────────────────────
function FastFeedbackCard({ stats }: { stats: any }) {
  if (!stats) {
    return (
      <Card className="border-primary/20">
        <CardContent className="py-8 text-center">
          <Zap className="h-6 w-6 text-primary mx-auto mb-2" />
          <p className="text-xs font-mono text-muted-foreground">No 3m horizon data yet.</p>
        </CardContent>
      </Card>
    );
  }

  const dirAccPct = stats.evaluatedDecisions > 0 ? (stats.dirAcc * 100).toFixed(1) : "—";
  const passesL1 = stats.dirAcc >= 0.62 && Number(stats.avgReturnR) > 0 && stats.totalDecisions >= 40;

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader className="py-3 px-4 bg-primary/5">
        <CardTitle className="text-xs font-mono uppercase tracking-wider flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-primary">Fast Feedback (3m)</span>
          <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary ml-auto">WEEKLY</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GateCard label="DirAcc 3m" value={`${dirAccPct}%`} required="≥62%" pass={stats.dirAcc >= 0.62} />
          <GateCard label="EV_BH 3m" value={Number(stats.avgReturnR).toFixed(4)} required=">0" pass={Number(stats.avgReturnR) > 0} />
          <GateCard label="Sample Size" value={stats.totalDecisions} required={40} />
          <div className={`rounded-lg border p-2.5 space-y-1 ${passesL1 ? "border-bullish/30 bg-bullish/5" : "border-border bg-secondary/30"}`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-muted-foreground uppercase">L1 Unlock</span>
              {passesL1 ? <CheckCircle2 className="h-3 w-3 text-bullish" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="text-xs font-mono font-bold">{passesL1 ? "ELIGIBLE" : "NOT YET"}</div>
          </div>
        </div>
        {stats.totalDecisions > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>L1 Fast-Track Progress</span>
              <span>{Math.min(100, Math.round((stats.totalDecisions / 40) * 100))}%</span>
            </div>
            <Progress value={Math.min(100, (stats.totalDecisions / 40) * 100)} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────

function SummaryCard({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className="py-2 px-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[9px] font-mono uppercase truncate">{label}</span>
      </div>
      <div className={`text-base font-mono font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function DirBadge({ dir }: { dir: string }) {
  const cls = dir === "UP" ? "bg-bullish/10 text-bullish border-bullish" : dir === "DOWN" ? "bg-bearish/10 text-bearish border-bearish" : "bg-neutral-signal/10 text-neutral-signal border-neutral-signal";
  return <Badge variant="outline" className={`text-[9px] font-mono ${cls}`}>{dir}</Badge>;
}

function ScenarioBadge({ type }: { type: string }) {
  const cls = type === "bullish" ? "text-bullish" : type === "bearish" ? "text-bearish" : "text-neutral-signal";
  return <span className={`text-[9px] font-mono font-bold uppercase ${cls}`}>{type}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, string> = { WIN: "bg-bullish/10 text-bullish", LOSS: "bg-bearish/10 text-bearish", BREAKEVEN: "bg-secondary text-muted-foreground" };
  return <Badge variant="outline" className={`text-[8px] font-mono ${map[outcome] || ""}`}>{outcome}</Badge>;
}

function MetricRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono font-bold ${positive === true ? "text-bullish" : positive === false ? "text-bearish" : ""}`}>{value}</span>
    </div>
  );
}

function GraduationLevelBadge({ level }: { level: number }) {
  const colors = ["bg-secondary text-muted-foreground", "bg-primary/20 text-primary", "bg-bullish/20 text-bullish", "bg-bullish text-bullish-foreground"];
  return <Badge className={`text-[9px] font-mono ${colors[level]}`}>L{level}</Badge>;
}

function GateCard({ label, value, required, pass }: { label: string; value: string | number; required: string | number; pass?: boolean }) {
  const passed = pass !== undefined ? pass : typeof required === "number" && Number(value) >= required;
  return (
    <div className={`rounded-lg border p-2.5 space-y-1 ${passed ? "border-bullish/30 bg-bullish/5" : "border-border bg-secondary/30"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase">{label}</span>
        {passed ? <CheckCircle2 className="h-3 w-3 text-bullish" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
      </div>
      <div className="text-xs font-mono font-bold">{value}</div>
      <div className="text-[9px] font-mono text-muted-foreground">req: {required}</div>
    </div>
  );
}
