import { useState } from "react";
import { usePaperStats, useEvaluate } from "@/hooks/use-paper-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Download, RotateCcw, Shield, Target, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Minus } from "lucide-react";

const ASSETS = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK"];

export default function PaperTrades() {
  const [selectedAsset, setSelectedAsset] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const { data: statsRes, isLoading } = usePaperStats(selectedAsset);
  const evaluate = useEvaluate();

  const stats = statsRes?.data;
  const decisions = stats?.decisions || [];
  const trades = stats?.trades || [];
  const graduation = stats?.graduation || [];
  const confusionMatrix = stats?.confusionMatrix || { UP: { UP: 0, DOWN: 0, NEUTRAL: 0 }, DOWN: { UP: 0, DOWN: 0, NEUTRAL: 0 }, NEUTRAL: { UP: 0, DOWN: 0, NEUTRAL: 0 } };

  const openTrades = trades.filter((t: any) => t.status === "OPEN");
  const closedTrades = trades.filter((t: any) => t.status === "CLOSED");
  const pendingTrades = trades.filter((t: any) => t.status === "PENDING");

  // Compute summary stats
  const evaluatedDecisions = decisions.filter((d: any) => d.evaluated_at);
  const correctDecisions = evaluatedDecisions.filter((d: any) => d.correct);
  const dirAcc = evaluatedDecisions.length > 0 ? (correctDecisions.length / evaluatedDecisions.length * 100) : 0;

  const closedReturns = closedTrades.filter((t: any) => t.return_r !== null).map((t: any) => t.return_r);
  const avgR = closedReturns.length > 0 ? closedReturns.reduce((a: number, b: number) => a + b, 0) / closedReturns.length : 0;
  const sortedR = [...closedReturns].sort((a: number, b: number) => a - b);
  const medianR = sortedR.length > 0 ? sortedR[Math.floor(sortedR.length / 2)] : 0;

  const wins = closedTrades.filter((t: any) => t.outcome_label === "WIN").length;
  const losses = closedTrades.filter((t: any) => t.outcome_label === "LOSS").length;

  return (
    <div className="space-y-6">
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
          <Button variant="outline" size="sm" className="h-8 text-xs font-mono gap-1.5" onClick={() => selectedAsset && evaluate.mutate(selectedAsset)} disabled={!selectedAsset || evaluate.isPending}>
            <Target className="h-3 w-3" />
            Evaluate
          </Button>
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
        </TabsList>

        {/* ─── DECISIONS STREAM ────────────────────────────── */}
        <TabsContent value="decisions">
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
                    <TableHead className="text-[10px] font-mono">AGREEMENT</TableHead>
                    <TableHead className="text-[10px] font-mono">REALIZED</TableHead>
                    <TableHead className="text-[10px] font-mono">CORRECT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decisions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8 font-mono">No decisions recorded yet. Run an analysis to generate decisions.</TableCell></TableRow>
                  ) : decisions.slice(0, 50).map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{new Date(d.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                      <TableCell className="text-[10px] font-mono font-bold">{d.asset_id}</TableCell>
                      <TableCell><DirBadge dir={d.direction_pred} /></TableCell>
                      <TableCell className="text-[10px] font-mono">{(d.probability_pred * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-[10px] font-mono">${Number(d.ref_price).toLocaleString()}</TableCell>
                      <TableCell className="text-[10px] font-mono">{(d.agreement_score * 100).toFixed(0)}%</TableCell>
                      <TableCell>{d.realized_dir ? <DirBadge dir={d.realized_dir} /> : <span className="text-[10px] text-muted-foreground font-mono">pending</span>}</TableCell>
                      <TableCell>{d.evaluated_at ? (d.correct ? <CheckCircle2 className="h-3.5 w-3.5 text-bullish" /> : <XCircle className="h-3.5 w-3.5 text-bearish" />) : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
            {/* Confusion Matrix */}
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

            {/* R Distribution */}
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
                  </div>
                  <div className="flex items-center gap-2">
                    <GraduationLevelBadge level={g.graduation_level} />
                    <Badge variant={g.integrity_gating_pass ? "default" : "destructive"} className="text-[9px] font-mono">
                      {g.influence_mode}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Gates */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <GateCard label="Decisions" value={g.n_decisions} required={500} />
                    <GateCard label="Opened Trades" value={g.n_opened_trades} required={150} />
                    <GateCard label="Dir. Accuracy" value={`${(Number(g.dir_acc) * 100).toFixed(1)}%`} required="≥65%" pass={Number(g.dir_acc) >= 0.65} />
                    <GateCard label="Avg Return R" value={Number(g.avg_return_r).toFixed(4)} required=">0.00" pass={Number(g.avg_return_r) > 0} />
                  </div>
                  {/* Progress to next level */}
                  {g.graduation_level < 3 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Progress to Level {g.graduation_level + 1}</span>
                        <span>{Math.min(100, Math.round((g.n_decisions / 500) * 100))}%</span>
                      </div>
                      <Progress value={Math.min(100, (g.n_decisions / 500) * 100)} className="h-1.5" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Learning Firewall Legend */}
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
      </Tabs>
    </div>
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
