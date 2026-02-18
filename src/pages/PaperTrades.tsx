import { useState, useMemo } from "react";
import HelpTooltip from "@/components/HelpTooltip";
import { usePaperStats } from "@/hooks/use-paper-engine";
import { useCohort, COHORTS } from "@/hooks/use-cohort";
import { buildTradeVM } from "@/lib/build-trade-vm";
import type { TradeVM } from "@/types/trade-vm";
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
  Play, Pause, Download, Shield, Target, TrendingUp, AlertTriangle, Activity,
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
import TradeDetailPanel from "@/components/paper-trades/TradeDetailPanel";
import TradeListRow from "@/components/paper-trades/TradeListRow";
import EngineTimeline from "@/components/paper-trades/EngineTimeline";
import EngineDiagnostics from "@/components/paper-trades/EngineDiagnostics";
import { useIncorporatedAssets, runAutoEvalTick } from "@/hooks/use-auto-eval";
import { type EvalCadence, CADENCE_OPTIONS } from "@/lib/eval-cadence";
import { useAutoEvaluationScheduler } from "@/hooks/use-auto-eval-scheduler";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── COHORT FILTER HELPER ──────────────────────────────────────
function filterByCohort<T extends { cohort_id?: string | null }>(rows: T[], cohortId: string | null): T[] {
  if (!cohortId) return rows;
  return rows.filter(r => r.cohort_id === cohortId);
}


export default function PaperTrades() {
  const [selectedAsset, setSelectedAsset] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [showLearning, setShowLearning] = useState(false);
  const [selectedVmId, setSelectedVmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [debugProb, setDebugProb] = useState(false);
  const isMobile = useIsMobile();

  const sched = useAutoEvaluationScheduler(runAutoEvalTick, !paused && !!selectedAsset);
  const cohort = useCohort();
  const { data: assetsRes } = useIncorporatedAssets();
  const incorporatedAssets = (assetsRes?.data || []) as { asset_id: string; symbol: string; is_enabled: boolean }[];
  const ASSETS = incorporatedAssets.length > 0
    ? incorporatedAssets.filter(a => a.is_enabled).map(a => a.asset_id)
    : ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];
  const { data: statsRes, isLoading } = usePaperStats(selectedAsset, true);

  const stats = statsRes?.data;
  const decisions = stats?.decisions || [];
  const trades = stats?.positions || stats?.trades || [];
  const graduation = stats?.graduation || [];
  const confusionMatrix = stats?.confusionMatrix || { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };
  const bhHorizonStats = stats?.bhHorizonStats || {};
  const engineEvents = stats?.events || [];
  const config = stats?.config || { publicHorizons: ["6m", "1y", "3y", "5y"], learningHorizons: ["3m", "6m", "1y", "3y", "5y"], cadenceMap: {} };

  // ─── BUILD VIEW MODELS ────────────────────────────────────────
  // Index positions by decision_id for fast lookup
  const positionsByDecisionId = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of trades) {
      if (t.decision_id) map.set(t.decision_id, t);
    }
    return map;
  }, [trades]);

  const allVMs: TradeVM[] = useMemo(() => {
    return decisions.map((d: any) => {
      const pos = positionsByDecisionId.get(d.id) ?? null;
      return buildTradeVM(d, pos);
    });
  }, [decisions, positionsByDecisionId]);

  // Categorize VMs by status
  const proposedVMs = useMemo(() => allVMs.filter(vm => vm.status === "PROPOSED"), [allVMs]);
  const pendingVMs = useMemo(() => allVMs.filter(vm => vm.status === "PENDING_ENTRY"), [allVMs]);
  const openVMs = useMemo(() => allVMs.filter(vm => vm.status === "OPEN"), [allVMs]);
  const closedVMs = useMemo(() => allVMs.filter(vm => vm.status === "CLOSED"), [allVMs]);
  const activeVMs = useMemo(() => [...openVMs, ...pendingVMs], [openVMs, pendingVMs]);

  // Selected VM
  const selectedVM = useMemo(() => allVMs.find(vm => vm.id === selectedVmId) ?? null, [allVMs, selectedVmId]);

  // ─── COHORT-AWARE METRICS (robust: uses positions/decisions arrays directly) ──
  const metricsDecisions = useMemo(() => {
    if (cohort.mode === "all") return decisions;
    if (cohort.cohortId === COHORTS.brain && cohort.includeLegacy) return decisions;
    return filterByCohort(decisions, cohort.cohortId);
  }, [decisions, cohort.mode, cohort.cohortId, cohort.includeLegacy]);

  const metricsTrades = useMemo(() => {
    if (cohort.mode === "all") return trades;
    if (cohort.cohortId === COHORTS.brain && cohort.includeLegacy) return trades;
    return filterByCohort(trades, cohort.cohortId);
  }, [trades, cohort.mode, cohort.cohortId, cohort.includeLegacy]);

  // Position-based metrics (avoids fragile VM→position map joins)
  const metricsClosedPositions = useMemo(
    () => metricsTrades.filter((p: any) => p.status === "CLOSED"),
    [metricsTrades],
  );
  const metricsOpenPositions = useMemo(
    () => metricsTrades.filter((p: any) => p.status === "OPEN"),
    [metricsTrades],
  );
  const metricsPendingPositions = useMemo(
    () => metricsTrades.filter((p: any) => p.status === "PENDING_ENTRY"),
    [metricsTrades],
  );

  const hasClosedTrades = metricsClosedPositions.length > 0;
  const mClosedCount = metricsClosedPositions.length;

  // Directional accuracy (from decisions)
  const mEvaluatedDecisions = metricsDecisions.filter((d: any) => d.evaluated_at);
  const mCorrectDecisions = mEvaluatedDecisions.filter((d: any) => d.correct);
  const mDirAcc = mEvaluatedDecisions.length > 0 ? (mCorrectDecisions.length / mEvaluatedDecisions.length * 100) : 0;

  // Win rate & Avg R (from closed positions — always reliable, no VM join needed)
  const mWins = metricsClosedPositions.filter((p: any) => p.outcome === "TP" || Number(p.realized_pnl ?? 0) > 0).length;
  const losses = metricsClosedPositions.filter((p: any) => p.outcome === "SL" || Number(p.realized_pnl ?? 0) < 0).length;
  const mWinRate = mClosedCount > 0 ? (mWins / mClosedCount) * 100 : 0;

  const mRValues = metricsClosedPositions
    .map((p: any) => Number(p.r_multiple ?? p.realized_r ?? 0))
    .filter((v: number) => Number.isFinite(v));
  const mAvgR = mRValues.length > 0 ? mRValues.reduce((a: number, b: number) => a + b, 0) / mRValues.length : 0;
  const sortedR = [...mRValues].sort((a, b) => a - b);
  const medianR = sortedR.length > 0 ? sortedR[Math.floor(sortedR.length / 2)] : 0;

  const visibleHorizons = showLearning ? config.learningHorizons : config.publicHorizons;

  // Filter by search
  const filterVMs = (vms: TradeVM[]) =>
    searchQuery ? vms.filter(vm => vm.symbol.toLowerCase().includes(searchQuery.toLowerCase())) : vms;

  const selectVM = (vm: TradeVM) => {
    setSelectedVmId(vm.id);
    if (isMobile) setMobileDetailOpen(true);
  };

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      <SystemStatusBanner asset={selectedAsset} />

      {/* ─── STICKY COMMAND BAR ────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <h1 className="text-sm font-mono font-bold tracking-wider text-primary truncate">PAPER TRADES</h1>
            <BestTimeframeBadge asset={selectedAsset} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 shrink-0">
            <Select value={selectedAsset || "all"} onValueChange={(v) => setSelectedAsset(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-24 h-7 text-[10px] font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                {ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="hidden sm:flex items-center gap-1">
              <Gauge className="h-3 w-3 text-muted-foreground" />
              <Select value={sched.cadence} onValueChange={(v) => sched.setCadence(v as EvalCadence)}>
                <SelectTrigger className="w-20 h-7 text-[10px] font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1 hidden sm:flex" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <EvaluateButton selectedAsset={selectedAsset} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono text-xs">
                <DropdownMenuItem className="gap-2 sm:hidden" onClick={() => setPaused(!paused)}>
                  {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {paused ? "Resume" : "Pause"}
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2"><Download className="h-3 w-3" />Export</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
          Auto-eval: {sched.cadence} | Last: {sched.lastRunAt} | Runs: {sched.runCount}
        </p>
      </div>

      {/* ─── SUMMARY CARDS ──────────────────────────────────── */}
      <div className="px-4 pt-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <SummaryCard
              label={metricsDecisions.length >= 200 ? "Decisions (Showing Last 200)" : "Total Decisions"}
              value={metricsDecisions.length}
              icon={<Target className="h-3 w-3" />}
              tooltipId={metricsDecisions.length >= 200 ? "metric-total-decisions-capped" : "metric-total-decisions"}
              scope={selectedAsset ? `Asset: ${selectedAsset}` : "Asset: All Assets"}
              window={metricsDecisions.length >= 200 ? "Last 200 Decisions" : "Lifetime"}
              cohortLabel={cohort.label}
            />
            <SummaryCard
              label="Directional Accuracy"
              value={hasClosedTrades ? `${mDirAcc.toFixed(1)}%` : "—"}
              icon={<TrendingUp className="h-3 w-3" />}
              accent={hasClosedTrades && mDirAcc >= 65}
              tooltipId="metric-directional-accuracy"
              scope={selectedAsset ? `Asset: ${selectedAsset}` : "Asset: All Assets"}
              window={metricsDecisions.length >= 200 ? "Last 200 Decisions" : "Lifetime"}
              cohortLabel={cohort.label}
            />
            <SummaryCard
              label="Average Risk-Adjusted Return"
              value={hasClosedTrades ? mAvgR.toFixed(3) : "—"}
              icon={<TrendingUp className="h-3 w-3" />}
              accent={hasClosedTrades && mAvgR > 0}
              tooltipId="metric-avg-r"
              scope={selectedAsset ? `Asset: ${selectedAsset}` : "Asset: All Assets"}
              window="Closed Trades"
              cohortLabel={cohort.label}
            />
            <SummaryCard
              label="Win Rate"
              value={hasClosedTrades ? `${((mWins / mClosedCount) * 100).toFixed(1)}%` : "—"}
              icon={<CheckCircle2 className="h-3 w-3" />}
              tooltipId="metric-win-rate"
              scope={selectedAsset ? `Asset: ${selectedAsset}` : "Asset: All Assets"}
              window="Closed Trades"
              cohortLabel={cohort.label}
            />
            <SummaryCard
              label="Open / Pending"
              value={`${metricsOpenPositions.length} / ${metricsPendingPositions.length}`}
              icon={<Shield className="h-3 w-3" />}
              tooltipId="metric-open-pending"
              scope={selectedAsset ? `Asset: ${selectedAsset}` : "Asset: All Assets"}
              window="Current"
              cohortLabel={cohort.label}
            />
          </div>
          {!hasClosedTrades && (
            <p className="text-[9px] font-mono text-muted-foreground/60 mt-1.5">
              Waiting for first closed trades to populate learning metrics.
            </p>
          )}
      </div>

      {/* ─── MAIN CONTENT ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-4 pt-3 pb-4">
        <Tabs defaultValue="decisions" className="h-full flex flex-col min-w-0">
          <div className="w-full overflow-x-auto">
            <TabsList className="font-mono text-[10px] bg-secondary inline-flex w-max">
              <TabsTrigger value="decisions" className="text-[10px]">Decisions</TabsTrigger>
              <TabsTrigger value="open" className="text-[10px]">Open ({activeVMs.length})</TabsTrigger>
              <TabsTrigger value="closed" className="text-[10px]">Closed ({closedVMs.length})</TabsTrigger>
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
              <TabsTrigger value="engine-events" className="text-[10px] gap-1"><Zap className="h-3 w-3" />Events</TabsTrigger>
              <TabsTrigger value="diagnostics" className="text-[10px] gap-1"><Activity className="h-3 w-3" />Diagnostics</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── DECISIONS ─────────────────────────────────── */}
          <TabsContent value="decisions" className="flex-1 min-h-0 mt-3">
            {allVMs.length === 0 ? (
              <RunAnalysisEmptyState selectedAsset={selectedAsset} timeframe="4h" />
            ) : (
              <TwoColumnLayout
                vms={filterVMs(allVMs).slice(0, 100)}
                selectedId={selectedVmId}
                onSelect={selectVM}
                selectedVM={selectedVM}
                isMobile={isMobile}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                showSearch
              />
            )}
          </TabsContent>

          {/* ─── OPEN TRADES ──────────────────────────────── */}
          <TabsContent value="open" className="flex-1 min-h-0 mt-3">
            <TwoColumnLayout
              vms={filterVMs(activeVMs)}
              selectedId={selectedVmId}
              onSelect={selectVM}
              selectedVM={selectedVM}
              isMobile={isMobile}
              emptyMessage="No open trades."
            />
          </TabsContent>

          {/* ─── CLOSED TRADES ────────────────────────────── */}
          <TabsContent value="closed" className="flex-1 min-h-0 mt-3">
            <TwoColumnLayout
              vms={filterVMs(closedVMs)}
              selectedId={selectedVmId}
              onSelect={selectVM}
              selectedVM={selectedVM}
              isMobile={isMobile}
              emptyMessage="No closed trades yet."
            />
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
                  <MetricRow label="Average Return R" value={mAvgR.toFixed(4)} positive={mAvgR > 0} />
                  <MetricRow label="Median R" value={medianR.toFixed(4)} positive={medianR > 0} />
                  <MetricRow label="Win Rate" value={hasClosedTrades ? `${((mWins / mClosedCount) * 100).toFixed(1)}%` : "—"} positive={mWins > losses} />
                  <MetricRow label="W / L" value={`${mWins} / ${losses}`} positive={mWins > losses} />
                  <MetricRow label="Total Closed" value={String(mClosedCount)} />
                  <MetricRow label="Directional Accuracy" value={`${mDirAcc.toFixed(1)}%`} positive={mDirAcc >= 65} />
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
          <TabsContent value="engine-events" className="mt-3"><EngineTimeline events={engineEvents} /></TabsContent>
          <TabsContent value="diagnostics" className="mt-3"><EngineDiagnostics /></TabsContent>
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
              <TradeDetailPanel vm={selectedVM} />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── TWO COLUMN LAYOUT ──────────────────────────────────────────
function TwoColumnLayout({
  vms, selectedId, onSelect, selectedVM, isMobile, emptyMessage, searchQuery, onSearchChange, showSearch,
}: {
  vms: TradeVM[];
  selectedId: string | null;
  onSelect: (vm: TradeVM) => void;
  selectedVM: TradeVM | null;
  isMobile: boolean;
  emptyMessage?: string;
  searchQuery?: string;
  onSearchChange?: (v: string) => void;
  showSearch?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-w-0">
      <div className="lg:col-span-5 min-w-0 flex flex-col">
        {showSearch && onSearchChange && (
          <div className="mb-2">
            <Input
              placeholder="Search asset..."
              value={searchQuery ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-7 text-[10px] font-mono"
            />
          </div>
        )}
        <ScrollArea className="flex-1 max-h-[calc(100vh-320px)]">
          <div className="space-y-1 pr-2">
            {vms.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8 font-mono">
                {emptyMessage ?? "No items."}
              </div>
            ) : vms.map(vm => (
              <TradeListRow
                key={vm.id}
                vm={vm}
                selected={vm.id === selectedId}
                onClick={() => onSelect(vm)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      {!isMobile && (
        <div className="lg:col-span-7 min-w-0 hidden lg:block">
          <Card className="h-full">
            <CardContent className="p-4 h-full overflow-auto">
              <TradeDetailPanel vm={selectedVM} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
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

function SummaryCard({ label, value, icon, accent, tooltipId, scope, window: timeWindow, cohortLabel }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
  tooltipId?: string;
  scope?: string;
  window?: string;
  cohortLabel?: string;
}) {
  return (
    <Card className="py-2 px-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[9px] font-mono uppercase truncate">{label}</span>
        {tooltipId && <HelpTooltip id={tooltipId} iconSize="h-2.5 w-2.5" />}
      </div>
      <div className={`text-base font-mono font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      {(scope || timeWindow || cohortLabel) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {cohortLabel && <span className="text-[7px] font-mono text-pillar-memory/80 bg-pillar-memory/10 px-1 rounded">Cohort: {cohortLabel}</span>}
          {scope && <span className="text-[7px] font-mono text-muted-foreground/60 bg-secondary/50 px-1 rounded">{scope}</span>}
          {timeWindow && <span className="text-[7px] font-mono text-muted-foreground/60 bg-secondary/50 px-1 rounded">{timeWindow}</span>}
        </div>
      )}
    </Card>
  );
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
