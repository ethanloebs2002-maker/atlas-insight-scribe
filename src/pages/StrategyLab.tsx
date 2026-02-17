import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  useStrategyBlueprints,
  useShadowSignals,
  useTournamentTick,
  useStrategyEvolve,
  useStrategyReputationUpdate,
} from "@/hooks/use-strategy-lab";
import { useRiskPerformance } from "@/hooks/use-risk-lab";
import { Dna, FlaskConical, Zap, Trophy, ChevronRight, Play, Sparkles, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";

export default function StrategyLab() {
  const { profile } = useAuth();
  const [selectedBp, setSelectedBp] = useState<string | null>(null);
  const [riskSymbol, setRiskSymbol] = useState<string>("all");
  const [riskRegime, setRiskRegime] = useState<string>("all");
  const { data: blueprints, isLoading } = useStrategyBlueprints();
  const { data: shadows } = useShadowSignals(selectedBp ?? undefined);
  const { data: riskPerf } = useRiskPerformance(
    riskSymbol !== "all" || riskRegime !== "all"
      ? { ...(riskSymbol !== "all" ? { symbol: riskSymbol } : {}), ...(riskRegime !== "all" ? { regime: riskRegime } : {}) }
      : undefined
  );
  const tournamentTick = useTournamentTick();
  const evolve = useStrategyEvolve();
  const repUpdate = useStrategyReputationUpdate();

  const isAdmin = true; // simplified; in production check user_roles

  const sortedBlueprints = (blueprints ?? []).sort((a: any, b: any) => {
    const ra = a.strategy_reputation?.[0]?.reputation ?? 0;
    const rb = b.strategy_reputation?.[0]?.reputation ?? 0;
    return rb - ra;
  });

  const selectedGenome = selectedBp
    ? sortedBlueprints.find((b: any) => b.id === selectedBp)?.genome
    : null;

  const shadowStats = (shadows ?? []).reduce(
    (acc: any, s: any) => {
      acc.total++;
      if (s.vetoed) acc.vetoed++;
      else acc.passed++;
      if (s.direction === "LONG") acc.long++;
      if (s.direction === "SHORT") acc.short++;
      return acc;
    },
    { total: 0, vetoed: 0, passed: 0, long: 0, short: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dna className="h-6 w-6 text-primary" />
          <h1 className="font-mono text-xl font-bold text-foreground">Strategy Lab</h1>
          <Badge variant="outline" className="font-mono text-xs">
            {sortedBlueprints.length} blueprints
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => {
              tournamentTick.mutate(undefined, {
                onSuccess: (d) => toast.success(`Tournament tick: ${d.signals} signals from ${d.blueprints} blueprints`),
                onError: (e) => toast.error(e.message),
              });
            }}
            disabled={tournamentTick.isPending}
          >
            <Play className="h-3 w-3 mr-1" />
            Run Tournament
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => {
              repUpdate.mutate(undefined, {
                onSuccess: (d) => toast.success(`Reputation updated: ${d.updated} blueprints`),
                onError: (e) => toast.error(e.message),
              });
            }}
            disabled={repUpdate.isPending}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Update Reputation
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              className="font-mono text-xs bg-primary text-primary-foreground"
              onClick={() => {
                evolve.mutate(undefined, {
                  onSuccess: (d) => toast.success(`Evolution: ${d.created} children from ${d.parents} parents`),
                  onError: (e) => toast.error(e.message),
                });
              }}
              disabled={evolve.isPending}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Evolve
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList className="font-mono">
          <TabsTrigger value="leaderboard" className="text-xs">
            <Trophy className="h-3 w-3 mr-1" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="genome" className="text-xs">
            <Dna className="h-3 w-3 mr-1" /> Genome
          </TabsTrigger>
          <TabsTrigger value="shadow" className="text-xs">
            <FlaskConical className="h-3 w-3 mr-1" /> Shadow vs Live
          </TabsTrigger>
          <TabsTrigger value="risklab" className="text-xs">
            <Shield className="h-3 w-3 mr-1" /> Risk Lab
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">Blueprint Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="font-mono text-xs">#</TableHead>
                    <TableHead className="font-mono text-xs">Name</TableHead>
                    <TableHead className="font-mono text-xs">Reputation</TableHead>
                    <TableHead className="font-mono text-xs">Confidence</TableHead>
                    <TableHead className="font-mono text-xs">Tags</TableHead>
                    <TableHead className="font-mono text-xs">Active</TableHead>
                    <TableHead className="font-mono text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBlueprints.map((bp: any, i: number) => {
                    const rep = bp.strategy_reputation?.[0];
                    return (
                      <TableRow
                        key={bp.id}
                        className={`border-border cursor-pointer hover:bg-secondary/50 ${
                          selectedBp === bp.id ? "bg-primary/5" : ""
                        }`}
                        onClick={() => setSelectedBp(bp.id)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs font-medium text-foreground">{bp.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className={rep?.reputation > 0.5 ? "text-bullish" : rep?.reputation > 0.3 ? "text-neutral" : "text-muted-foreground"}>
                            {(rep?.reputation ?? 0).toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {(rep?.confidence ?? 0.2).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(bp.tags ?? []).map((t: string) => (
                              <Badge key={t} variant="outline" className="text-[10px] font-mono px-1 py-0">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`h-2 w-2 rounded-full inline-block ${bp.is_active ? "bg-bullish" : "bg-muted-foreground"}`} />
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!sortedBlueprints.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center font-mono text-xs text-muted-foreground py-8">
                        No blueprints yet. Run Evolution to generate initial strategies.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="genome">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">
                Genome Viewer {selectedBp ? `— ${sortedBlueprints.find((b: any) => b.id === selectedBp)?.name}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedGenome ? (
                <div className="space-y-4">
                  {Object.entries(selectedGenome).map(([slot, prims]: [string, any]) => (
                    <div key={slot}>
                      <h3 className="font-mono text-xs font-bold text-primary uppercase mb-2">{slot}</h3>
                      {Array.isArray(prims) ? (
                        <div className="space-y-1">
                          {prims.map((p: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded text-xs font-mono">
                              <Zap className="h-3 w-3 text-primary" />
                              <span className="font-medium text-foreground">{p.key}</span>
                              <span className="text-muted-foreground">
                                {JSON.stringify(p.params ?? p.default_params ?? {}).slice(0, 60)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono">Empty slot</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-xs text-muted-foreground text-center py-8">
                  Select a blueprint from the leaderboard to view its genome.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shadow">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Total Signals</p>
                <p className="font-mono text-2xl font-bold text-foreground">{shadowStats.total}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Passed Gates</p>
                <p className="font-mono text-2xl font-bold text-bullish">{shadowStats.passed}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Vetoed</p>
                <p className="font-mono text-2xl font-bold text-bearish">{shadowStats.vetoed}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Long / Short</p>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {shadowStats.long} / {shadowStats.short}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">Recent Shadow Signals</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="font-mono text-xs">Time</TableHead>
                    <TableHead className="font-mono text-xs">Symbol</TableHead>
                    <TableHead className="font-mono text-xs">Direction</TableHead>
                    <TableHead className="font-mono text-xs">Entry</TableHead>
                    <TableHead className="font-mono text-xs">SL / TP</TableHead>
                    <TableHead className="font-mono text-xs">Vetoed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(shadows ?? []).slice(0, 20).map((s: any) => (
                    <TableRow key={s.id} className="border-border">
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.symbol}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] ${
                            s.direction === "LONG" ? "text-bullish border-bullish/30" : s.direction === "SHORT" ? "text-bearish border-bearish/30" : "text-muted-foreground"
                          }`}
                        >
                          {s.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.entry_price?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {s.stop_price?.toFixed(2) ?? "—"} / {s.tp_price?.toFixed(2) ?? "—"}
                      </TableCell>
                      <TableCell>
                        {s.vetoed ? (
                          <Badge variant="outline" className="text-[10px] font-mono text-bearish border-bearish/30">
                            {s.veto_reason?.replace("GATE_FAIL:", "") ?? "YES"}
                          </Badge>
                        ) : (
                          <span className="text-bullish text-xs">✓</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!(shadows ?? []).length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center font-mono text-xs text-muted-foreground py-8">
                        No shadow signals yet. Run a tournament tick to generate signals.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risklab">
          <div className="flex items-center gap-3 mb-4">
            <Select value={riskSymbol} onValueChange={setRiskSymbol}>
              <SelectTrigger className="w-[140px] font-mono text-xs h-8">
                <SelectValue placeholder="Symbol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Symbols</SelectItem>
                <SelectItem value="BTCUSDT">BTC</SelectItem>
                <SelectItem value="ETHUSDT">ETH</SelectItem>
                <SelectItem value="SOLUSDT">SOL</SelectItem>
                <SelectItem value="BNBUSDT">BNB</SelectItem>
                <SelectItem value="XRPUSDT">XRP</SelectItem>
                <SelectItem value="ADAUSDT">ADA</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskRegime} onValueChange={setRiskRegime}>
              <SelectTrigger className="w-[140px] font-mono text-xs h-8">
                <SelectValue placeholder="Regime" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regimes</SelectItem>
                <SelectItem value="compression">Compression</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="expansion">Expansion</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">Risk Profile Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="font-mono text-xs">Symbol</TableHead>
                    <TableHead className="font-mono text-xs">TF</TableHead>
                    <TableHead className="font-mono text-xs">Regime</TableHead>
                    <TableHead className="font-mono text-xs">Spread</TableHead>
                    <TableHead className="font-mono text-xs">Profile</TableHead>
                    <TableHead className="font-mono text-xs">Trades</TableHead>
                    <TableHead className="font-mono text-xs">Win %</TableHead>
                    <TableHead className="font-mono text-xs">Avg R</TableHead>
                    <TableHead className="font-mono text-xs">Σ PnL</TableHead>
                    <TableHead className="font-mono text-xs">Champion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(riskPerf ?? []).map((r: any, i: number) => {
                    // Determine if this is the champion for its group
                    const isChampion = i === 0 || (
                      (riskPerf ?? [])[i - 1]?.symbol !== r.symbol ||
                      (riskPerf ?? [])[i - 1]?.timeframe !== r.timeframe ||
                      (riskPerf ?? [])[i - 1]?.regime !== r.regime ||
                      (riskPerf ?? [])[i - 1]?.spread_bucket !== r.spread_bucket
                    );
                    return (
                      <TableRow key={r.id} className={`border-border ${isChampion ? "bg-primary/5" : ""}`}>
                        <TableCell className="font-mono text-xs">{r.symbol}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.timeframe}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">{r.regime}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.spread_bucket}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] ${
                              r.risk_profile_key?.includes("1p2") ? "text-bearish border-bearish/30" :
                              r.risk_profile_key?.includes("2p0") ? "text-bullish border-bullish/30" :
                              "text-primary border-primary/30"
                            }`}
                          >
                            {r.risk_profile_key}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.trades}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className={Number(r.win_rate) > 0.5 ? "text-bullish" : "text-bearish"}>
                            {(Number(r.win_rate) * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className={Number(r.avg_r) > 0 ? "text-bullish" : "text-bearish"}>
                            {Number(r.avg_r).toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className={Number(r.sum_pnl) > 0 ? "text-bullish" : "text-bearish"}>
                            ${Number(r.sum_pnl).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isChampion && r.trades >= 12 && (
                            <Badge className="bg-primary/20 text-primary text-[9px] font-mono">★</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!(riskPerf ?? []).length && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center font-mono text-xs text-muted-foreground py-8">
                        No risk performance data yet. Trades with risk profiles must close first.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
