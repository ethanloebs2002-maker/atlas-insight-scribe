import { useState } from "react";
import { usePaperStats } from "@/hooks/use-paper-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Play, Pause, Download, Shield, Target, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Minus, Zap, Clock, ArrowRightLeft, BarChart3, Sparkles, Search, ShieldAlert, Scan } from "lucide-react";
import LearningSourcesPanel from "@/components/LearningSourcesPanel";
import IndicatorBreakdownPanel from "@/components/IndicatorBreakdownPanel";
import IndicatorReliabilityPanel from "@/components/IndicatorReliabilityPanel";
import IndicatorPatternsPanel from "@/components/IndicatorPatternsPanel";
import SystemStatusBanner from "@/components/SystemStatusBanner";
import PatternTierPanel from "@/components/PatternTierPanel";
import AnomalyPanel from "@/components/AnomalyPanel";
import EvaluateButton from "@/components/EvaluateButton";
import RunAnalysisEmptyState from "@/components/RunAnalysisEmptyState";

const ASSETS = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];

export default function PaperTrades() {
  const [selectedAsset, setSelectedAsset] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [showLearning, setShowLearning] = useState(false);
  const { data: statsRes, isLoading } = usePaperStats(selectedAsset, true);

  const stats = statsRes?.data;
  const decisions = stats?.decisions || [];
  const trades = stats?.trades || [];
  const graduation = stats?.graduation || [];
  const confusionMatrix = stats?.confusionMatrix || { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };
  const bhHorizonStats = stats?.bhHorizonStats || {};
  const config = stats?.config || { publicHorizons: ["6m", "1y", "3y", "5y"], learningHorizons: ["3m", "6m", "1y", "3y", "5y"], cadenceMap: {} };

  const openTrades = trades.filter((t: any) => t.status === "OPEN");
  const closedTrades = trades.filter((t: any) => t.status === "CLOSED");
  const pendingTrades = trades.filter((t: any) => t.status === "PENDING");

  const evaluatedDecisions = decisions.filter((d: any) => d.evaluated_at);
  const correctDecisions = evaluatedDecisions.filter((d: any) => d.correct);
  const dirAcc = evaluatedDecisions.length > 0 ? (correctDecisions.length / evaluatedDecisions.length * 100) : 0;

  const closedReturns = closedTrades.filter((t: any) => t.return_r !== null).map((t: any) => t.return_r);
  const avgR = closedReturns.length > 0 ? closedReturns.reduce((a: number, b: number) => a + b, 0) / closedReturns.length : 0;
  const sortedR = [...closedReturns].sort((a: number, b: number) => a - b);
  const medianR = sortedR.length > 0 ? sortedR[Math.floor(sortedR.length / 2)] : 0;

  const wins = closedTrades.filter((t: any) => t.outcome_label === "WIN").length;
  const losses = closedTrades.filter((t: any) => t.outcome_label === "LOSS").length;

  // Visible horizons based on toggle
  const visibleHorizons = showLearning ? config.learningHorizons : config.publicHorizons;

  return (
    <div className="space-y-6">
      {/* System Status Banner */}
      <SystemStatusBanner asset={selectedAsset} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold tracking-wider text-primary">PAPER TRADES</h1>
          <p className="text-xs font-mono text-muted-foreground">Simulation Console • Track B + C Evaluation</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAsset || "all"} onValueChange={(v) => setSelectedAsset(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-28 h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              {ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs font-mono gap-1.5" onClick={() => setPaused(!paused)}>
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <EvaluateButton selectedAsset={selectedAsset} />
          <Button variant="ghost" size="sm" className="h-8 text-xs font-mono gap-1.5">
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Total Decisions" value={decisions.length} icon={<Target className="h-3.5 w-3.5" />} />
        <SummaryCard label="Dir. Accuracy" value={`${dirAcc.toFixed(1)}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} accent={dirAcc >= 65} />
        <SummaryCard label="Avg R" value={avgR.toFixed(3)} icon={<TrendingUp className="h-3.5 w-3.5" />} accent={avgR > 0} />
        <SummaryCard label="Win Rate" value={closedTrades.length > 0 ? `${((wins / closedTrades.length) * 100).toFixed(1)}%` : "—"} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
        <SummaryCard label="Open / Pending" value={`${openTrades.length} / ${pendingTrades.length}`} icon={<Shield className="h-3.5 w-3.5" />} />
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="decisions" className="space-y-4">
        <TabsList className="font-mono text-xs bg-secondary">
          <TabsTrigger value="decisions" className="text-xs">Decisions Stream</TabsTrigger>
          <TabsTrigger value="open">Open Trades ({openTrades.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed Trades ({closedTrades.length})</TabsTrigger>
          <TabsTrigger value="health">Learning Health</TabsTrigger>
          <TabsTrigger value="graduation">Graduation</TabsTrigger>
          <TabsTrigger value="bh-learning" className="text-xs gap-1">
            <Zap className="h-3 w-3" />
            B&H Learning
          </TabsTrigger>
          <TabsTrigger value="transfer" className="text-xs gap-1">
            <ArrowRightLeft className="h-3 w-3" />
            Transfer Learning
          </TabsTrigger>
          <TabsTrigger value="indicator-breakdown" className="text-xs gap-1">
            <Search className="h-3 w-3" />
            Indicator Breakdown
          </TabsTrigger>
          <TabsTrigger value="reliability" className="text-xs gap-1">
            <BarChart3 className="h-3 w-3" />
            Reliability
          </TabsTrigger>
          <TabsTrigger value="patterns" className="text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            Patterns
          </TabsTrigger>
          <TabsTrigger value="pattern-tiers" className="text-xs gap-1">
            <ShieldAlert className="h-3 w-3" />
            Pattern Tiers
          </TabsTrigger>
          <TabsTrigger value="anomalies" className="text-xs gap-1">
            <Scan className="h-3 w-3" />
            Anomalies
          </TabsTrigger>
        </TabsList>

        {/* ─── DECISIONS STREAM ────────────────────────────── */}
        <TabsContent value="decisions">
          {decisions.length === 0 ? (
            <RunAnalysisEmptyState selectedAsset={selectedAsset} timeframe="4h" />
          ) : (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recent Decisions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] font-mono">TIME</TableHead>
                      <TableHead className="text-[10px] font-mono">ASSET</TableHead>
                      <TableHead className="text-[10px] font-mono">PRED</TableHead>
                      <TableHead className="text-[10px] font-mono">PROB</TableHead>
                      <TableHead className="text-[10px] font-mono">REF PRICE</TableHead>
                      <TableHead className="text-[10px] font-mono">HORIZON</TableHead>
                      <TableHead className="text-[10px] font-mono">AGREEMENT</TableHead>
                      <TableHead className="text-[10px] font-mono">REALIZED</TableHead>
                      <TableHead className="text-[10px] font-mono">CORRECT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decisions.slice(0, 50).map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">{new Date(d.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                        <TableCell className="text-[10px] font-mono font-bold">{d.asset_id}</TableCell>
                        <TableCell><DirBadge dir={d.direction_pred} /></TableCell>
                        <TableCell className="text-[10px] font-mono">{(d.probability_pred * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-[10px] font-mono">${Number(d.ref_price).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[9px] font-mono">{d.horizon}</Badge></TableCell>
                        <TableCell className="text-[10px] font-mono">{(d.agreement_score * 100).toFixed(0)}%</TableCell>
                        <TableCell>{d.realized_dir ? <DirBadge dir={d.realized_dir} /> : <span className="text-[10px] text-muted-foreground font-mono">pending</span>}</TableCell>
                        <TableCell>{d.evaluated_at ? (d.correct ? <CheckCircle2 className="h-3.5 w-3.5 text-bullish" /> : <XCircle className="h-3.5 w-3.5 text-bearish" />) : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── OPEN TRADES ─────────────────────────────────── */}
        <TabsContent value="open">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Open & Pending Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-mono">STATUS</TableHead>
                    <TableHead className="text-[10px] font-mono">ASSET</TableHead>
                    <TableHead className="text-[10px] font-mono">TYPE</TableHead>
                    <TableHead className="text-[10px] font-mono">ENTRY ZONE</TableHead>
                    <TableHead className="text-[10px] font-mono">FILL</TableHead>
                    <TableHead className="text-[10px] font-mono">STOP</TableHead>
                    <TableHead className="text-[10px] font-mono">TARGETS</TableHead>
                    <TableHead className="text-[10px] font-mono">REGIME</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...openTrades, ...pendingTrades].length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8 font-mono">No open trades.</TableCell></TableRow>
                  ) : [...openTrades, ...pendingTrades].map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell><Badge variant={t.status === "OPEN" ? "default" : "secondary"} className="text-[9px] font-mono">{t.status}</Badge></TableCell>
                      <TableCell className="text-[10px] font-mono font-bold">{t.asset_id}</TableCell>
                      <TableCell><ScenarioBadge type={t.scenario_type} /></TableCell>
                      <TableCell className="text-[10px] font-mono">${Number(t.entry_zone_low).toLocaleString()}–${Number(t.entry_zone_high).toLocaleString()}</TableCell>
                      <TableCell className="text-[10px] font-mono">{t.fill_price ? `$${Number(t.fill_price).toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono text-bearish">${Number(t.stop_level).toLocaleString()}</TableCell>
                      <TableCell className="text-[10px] font-mono">{(t.targets_json || []).length} targets</TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{t.regime_label || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CLOSED TRADES ───────────────────────────────── */}
        <TabsContent value="closed">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Closed Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-mono">OUTCOME</TableHead>
                    <TableHead className="text-[10px] font-mono">ASSET</TableHead>
                    <TableHead className="text-[10px] font-mono">TYPE</TableHead>
                    <TableHead className="text-[10px] font-mono">FILL</TableHead>
                    <TableHead className="text-[10px] font-mono">EXIT</TableHead>
                    <TableHead className="text-[10px] font-mono">RETURN %</TableHead>
                    <TableHead className="text-[10px] font-mono">RETURN R</TableHead>
                    <TableHead className="text-[10px] font-mono">MAE R</TableHead>
                    <TableHead className="text-[10px] font-mono">MFE R</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedTrades.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8 font-mono">No closed trades yet.</TableCell></TableRow>
                  ) : closedTrades.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell><OutcomeBadge outcome={t.outcome_label} /></TableCell>
                      <TableCell className="text-[10px] font-mono font-bold">{t.asset_id}</TableCell>
                      <TableCell><ScenarioBadge type={t.scenario_type} /></TableCell>
                      <TableCell className="text-[10px] font-mono">{t.fill_price ? `$${Number(t.fill_price).toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono">{t.exit_price ? `$${Number(t.exit_price).toLocaleString()}` : "—"}</TableCell>
                      <TableCell className={`text-[10px] font-mono ${Number(t.return_pct) >= 0 ? "text-bullish" : "text-bearish"}`}>{t.return_pct !== null ? `${Number(t.return_pct).toFixed(2)}%` : "—"}</TableCell>
                      <TableCell className={`text-[10px] font-mono ${Number(t.return_r) >= 0 ? "text-bullish" : "text-bearish"}`}>{t.return_r !== null ? Number(t.return_r).toFixed(3) : "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono text-bearish">{t.mae_r !== null ? Number(t.mae_r).toFixed(3) : "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono text-bullish">{t.mfe_r !== null ? Number(t.mfe_r).toFixed(3) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── LEARNING HEALTH ─────────────────────────────── */}
        <TabsContent value="health">
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
        <TabsContent value="graduation">
          <div className="space-y-4">
            {graduation.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-xs font-mono text-muted-foreground">No graduation data yet. Record decisions and run evaluations to populate.</p>
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
                    <Badge variant={g.integrity_gating_pass ? "default" : "destructive"} className="text-[9px] font-mono">
                      {g.influence_mode}
                    </Badge>
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
                        <span>Progress to Level {g.graduation_level + 1}{g.horizon === "3m" ? " (max)" : ""}</span>
                        <span>{Math.min(100, Math.round((g.n_decisions / (g.horizon === "3m" ? 40 : 500)) * 100))}%</span>
                      </div>
                      <Progress value={Math.min(100, (g.n_decisions / (g.horizon === "3m" ? 40 : 500)) * 100)} className="h-1.5" />
                    </div>
                  )}
                  {g.horizon === "3m" && g.graduation_level >= 1 && (
                    <div className="text-[10px] font-mono text-primary flex items-center gap-1.5 bg-primary/5 rounded-md px-3 py-2 border border-primary/10">
                      <CheckCircle2 className="h-3 w-3" />
                      3m horizon contributed to L1 unlock (capped at L1)
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
        <TabsContent value="bh-learning">
          <div className="space-y-4">
            {/* Toggle */}
            <Card>
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-xs font-mono font-bold">Show learning horizons (advanced)</span>
                  <span className="text-[9px] font-mono text-muted-foreground">Reveals 3m in charts/tables</span>
                </div>
                <Switch checked={showLearning} onCheckedChange={setShowLearning} />
              </CardContent>
            </Card>

            {/* Fast Feedback (3m) Card */}
            <FastFeedbackCard stats={bhHorizonStats["3m"]} />

            {/* All BH Horizon Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleHorizons.map(h => {
                const hStats = bhHorizonStats[h];
                if (!hStats) return null;
                return (
                  <Card key={h} className={`overflow-hidden ${h === "3m" ? "border-primary/20" : ""}`}>
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold">{h.toUpperCase()}</span>
                        {hStats.isLearningOnly && (
                          <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary">LEARNING</Badge>
                        )}
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

            {/* Cadence Reference */}
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

        {/* ─── TRANSFER LEARNING ───────────────────────────── */}
        <TabsContent value="transfer">
          <LearningSourcesPanel selectedAsset={selectedAsset} />
        </TabsContent>

        {/* ─── INDICATOR BREAKDOWN (per-trade) ─────────────── */}
        <TabsContent value="indicator-breakdown">
          <IndicatorBreakdownPanel decisions={decisions} />
        </TabsContent>

        {/* ─── INDICATOR RELIABILITY ───────────────────────── */}
        <TabsContent value="reliability">
          <IndicatorReliabilityPanel selectedAsset={selectedAsset} />
        </TabsContent>

        {/* ─── PATTERNS ────────────────────────────────────── */}
        <TabsContent value="patterns">
          <IndicatorPatternsPanel selectedAsset={selectedAsset} />
        </TabsContent>

        {/* ─── PATTERN TIERS ─────────────────────────────────── */}
        <TabsContent value="pattern-tiers">
          <PatternTierPanel selectedAsset={selectedAsset} />
        </TabsContent>

        {/* ─── ANOMALIES ─────────────────────────────────────── */}
        <TabsContent value="anomalies">
          <AnomalyPanel selectedAsset={selectedAsset} />
        </TabsContent>
      </Tabs>
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
          <p className="text-xs font-mono text-muted-foreground">No 3m horizon data yet. Weekly decisions will populate this.</p>
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
          <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary ml-auto">
            WEEKLY CADENCE
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GateCard label="DirAcc 3m" value={`${dirAccPct}%`} required="≥62%" pass={stats.dirAcc >= 0.62} />
          <GateCard label="EV_BH 3m" value={Number(stats.avgReturnR).toFixed(4)} required=">0" pass={Number(stats.avgReturnR) > 0} />
          <GateCard label="Sample Size" value={stats.totalDecisions} required={40} />
          <div className={`rounded-lg border p-2.5 space-y-1 ${passesL1 ? "border-bullish/30 bg-bullish/5" : stats.contributedToL1 ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30"}`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-muted-foreground uppercase">L1 Unlock</span>
              {passesL1 || stats.contributedToL1 ? <CheckCircle2 className="h-3 w-3 text-bullish" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="text-xs font-mono font-bold">{passesL1 ? "ELIGIBLE" : stats.contributedToL1 ? "CONTRIBUTED" : "NOT YET"}</div>
            <div className="text-[9px] font-mono text-muted-foreground">accelerates L1 only</div>
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

        <div className="text-[9px] font-mono text-muted-foreground bg-secondary/50 rounded-md px-3 py-2 border border-border">
          <strong className="text-foreground">NOTE:</strong> 3m DirAcc contributes to "Learning Confidence" but does NOT override 6m+ gates. Levels 2–3 still require standard 6m+ criteria.
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────

function SummaryCard({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className="py-3 px-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-mono uppercase">{label}</span>
      </div>
      <div className={`text-lg font-mono font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function DirBadge({ dir }: { dir: string }) {
  const cls = dir === "UP" ? "bg-bullish/10 text-bullish border-bullish" : dir === "DOWN" ? "bg-bearish/10 text-bearish border-bearish" : "bg-neutral-signal/10 text-neutral-signal border-neutral-signal";
  return <Badge variant="outline" className={`text-[9px] font-mono ${cls}`}>{dir}</Badge>;
}

function ScenarioBadge({ type }: { type: string }) {
  const cls = type === "bullish" ? "text-bullish" : type === "bearish" ? "text-bearish" : "text-neutral-signal";
  return <span className={`text-[10px] font-mono font-bold uppercase ${cls}`}>{type}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, string> = { WIN: "bg-bullish/10 text-bullish", LOSS: "bg-bearish/10 text-bearish", BREAKEVEN: "bg-secondary text-muted-foreground", EXPIRED: "bg-secondary text-muted-foreground" };
  return <Badge variant="outline" className={`text-[9px] font-mono ${map[outcome] || ""}`}>{outcome}</Badge>;
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
