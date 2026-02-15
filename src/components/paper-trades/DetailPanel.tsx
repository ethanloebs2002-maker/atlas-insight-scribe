import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { asProbability } from "@/types/probability";
import DecisionChart, { type Candle } from "@/components/DecisionChart";
import { useAssetAnalysis } from "@/hooks/use-crypto-data";
import { useLivePrice } from "@/hooks/use-live-price";
import { Target, ShieldAlert, ChevronDown, Bug, BarChart3 } from "lucide-react";
import { useState } from "react";

export interface SelectedItem {
  kind: "decision" | "open" | "closed";
  id: string;
  asset_id: string;
  timeframe: string;
  horizon?: string;
  direction_pred?: string;
  probability_pred?: number;
  ref_price?: number;
  agreement_score?: number;
  consensus_score?: number;
  realized_dir?: string;
  correct?: boolean | null;
  evaluated_at?: string;
  emitted_by?: string;
  emit_run_id?: string;
  emitted_at?: string;
  ts?: string;
  evidence_snapshot_json?: any;
  // Trade fields
  status?: string;
  scenario_type?: string;
  fill_price?: number | null;
  entry_zone_low?: number;
  entry_zone_high?: number;
  stop_level?: number | null;
  targets_json?: any;
  regime_label?: string;
  return_r?: number | null;
  return_pct?: number | null;
  outcome_label?: string;
  close_reason?: string;
  exit_price?: number | null;
  time_window_end?: string;
}

function DirBadge({ dir }: { dir: string }) {
  const cls =
    dir === "UP"
      ? "bg-bullish/10 text-bullish border-bullish"
      : dir === "DOWN"
        ? "bg-bearish/10 text-bearish border-bearish"
        : "bg-neutral-signal/10 text-neutral-signal border-neutral-signal";
  return (
    <Badge variant="outline" className={`text-[9px] font-mono ${cls}`}>
      {dir}
    </Badge>
  );
}

export default function DetailPanel({ item }: { item: SelectedItem | null }) {
  const [debugOpen, setDebugOpen] = useState(false);

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-6">
        <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-xs font-mono text-muted-foreground">
          Select a decision or trade to view details
        </p>
      </div>
    );
  }

  // Derive chart props
  const isDecision = item.kind === "decision";
  const evidence = item.evidence_snapshot_json || {};

  let entryPrice: number;
  let stopLoss: number;
  let targetsArr: number[] = [];
  let entryLabel = "Entry";

  if (isDecision) {
    entryPrice = Number(item.ref_price);
    stopLoss = evidence.stopLoss?.level
      ? Number(evidence.stopLoss.level)
      : entryPrice * (item.direction_pred === "UP" ? 0.97 : 1.03);
    targetsArr = Array.isArray(evidence.targets)
      ? evidence.targets.map((t: any) => Number(t.price)).filter((n: number) => !isNaN(n) && n > 0)
      : [];
    if (targetsArr.length === 0) {
      targetsArr.push(entryPrice * (item.direction_pred === "UP" ? 1.05 : 0.95));
    }
    entryLabel = "Planned Entry";
  } else {
    const fillPrice = item.fill_price ? Number(item.fill_price) : null;
    entryPrice = fillPrice ?? ((Number(item.entry_zone_low) + Number(item.entry_zone_high)) / 2);
    stopLoss = Number(item.stop_level) || entryPrice * 0.97;
    targetsArr = Array.isArray(item.targets_json)
      ? item.targets_json.map((tp: any) => Number(tp.price ?? tp)).filter((n: number) => !isNaN(n) && n > 0)
      : [];
    entryLabel = fillPrice ? "Fill" : "Mid Entry";
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono font-bold">{item.asset_id}</span>
        {item.direction_pred && <DirBadge dir={item.direction_pred} />}
        {!isDecision && item.scenario_type && (
          <Badge variant="outline" className={`text-[8px] font-mono py-0 h-4 ${item.scenario_type === "bullish" ? "bg-bullish/10 text-bullish border-bullish" : "bg-bearish/10 text-bearish border-bearish"}`}>
            {item.scenario_type === "bullish" ? "LONG" : "SHORT"}
          </Badge>
        )}
        {item.scenario_type && (
          <Badge variant="outline" className="text-[9px] font-mono uppercase">
            {item.scenario_type}
          </Badge>
        )}
        <Badge variant="secondary" className="text-[9px] font-mono">{item.timeframe}</Badge>
        {item.horizon && (
          <Badge variant="secondary" className="text-[9px] font-mono">{item.horizon}</Badge>
        )}
        {item.status && (
          <Badge variant={item.status === "OPEN" ? "default" : "outline"} className="text-[9px] font-mono">
            {item.status}
          </Badge>
        )}
        {item.outcome_label && (
          <Badge
            variant="outline"
            className={`text-[9px] font-mono ${item.outcome_label === "WIN" ? "text-bullish border-bullish" : item.outcome_label === "LOSS" ? "text-bearish border-bearish" : ""}`}
          >
            {item.outcome_label}
          </Badge>
        )}
      </div>

      {/* Chart */}
      <div className="min-w-0">
        <ChartWithData
          symbol={item.asset_id}
          timeframe={item.timeframe || "4h"}
          entry={entryPrice}
          entryLabel={entryLabel}
          stopLoss={stopLoss}
          targets={targetsArr}
        />
      </div>

      {/* Key Levels */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3 w-3" />
            Key Levels
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <LevelItem label={entryLabel} value={entryPrice} />
            <LevelItem label="Stop Loss" value={stopLoss} color="text-bearish" />
            {targetsArr.map((tp, i) => (
              <LevelItem key={i} label={`TP${i + 1}`} value={tp} color="text-bullish" />
            ))}
            {item.exit_price && <LevelItem label="Exit" value={Number(item.exit_price)} />}
          </div>
          {item.return_r != null && (
            <div className="mt-2 pt-2 border-t border-border flex justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Return R</span>
              <span className={Number(item.return_r) >= 0 ? "text-bullish font-bold" : "text-bearish font-bold"}>
                {Number(item.return_r).toFixed(3)}
              </span>
            </div>
          )}
          {item.return_pct != null && (
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Return %</span>
              <span className={Number(item.return_pct) >= 0 ? "text-bullish font-bold" : "text-bearish font-bold"}>
                {Number(item.return_pct).toFixed(2)}%
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decision-specific info */}
      {isDecision && item.probability_pred != null && (
        <Card>
          <CardContent className="py-3 px-3 space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Probability</span>
              <span className="font-bold">{Math.round(asProbability(item.probability_pred, "detail") * 100)}%</span>
            </div>
            {item.agreement_score != null && (
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">Agreement</span>
                <span className="font-bold">{Math.round(asProbability(item.agreement_score, "detail") * 100)}%</span>
              </div>
            )}
            {item.close_reason && (
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">Close Reason</span>
                <span className="truncate ml-2">{item.close_reason}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trade close reason */}
      {!isDecision && item.close_reason && (
        <Card>
          <CardContent className="py-3 px-3">
            <div className="text-[10px] font-mono">
              <span className="text-muted-foreground">Close Reason: </span>
              <span className="break-words">{item.close_reason}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug section */}
      <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors w-full">
          <Bug className="h-3 w-3" />
          Debug Info
          <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${debugOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="py-2 px-3 space-y-1 text-[9px] font-mono text-muted-foreground">
              {item.emitted_by && <div>emitted_by: <span className="text-foreground">{item.emitted_by}</span></div>}
              {item.emit_run_id && <div>emit_run_id: <span className="text-foreground break-all">{item.emit_run_id}</span></div>}
              {item.emitted_at && <div>emitted_at: <span className="text-foreground">{new Date(item.emitted_at).toLocaleString()}</span></div>}
              {item.regime_label && <div>regime: <span className="text-foreground">{item.regime_label}</span></div>}
              {item.time_window_end && <div>expires: <span className="text-foreground">{new Date(item.time_window_end).toLocaleString()}</span></div>}
              <div>id: <span className="text-foreground break-all">{item.id}</span></div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function LevelItem({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded border border-border bg-secondary/40 p-2">
      <div className="text-[9px] font-mono text-muted-foreground uppercase">{label}</div>
      <div className={`text-xs font-mono font-bold ${color || ""}`}>${value.toLocaleString()}</div>
    </div>
  );
}

function ChartWithData({ symbol, timeframe, entry, entryLabel, stopLoss, targets }: {
  symbol: string; timeframe: string; entry: number; entryLabel?: string; stopLoss: number; targets?: number[];
}) {
  const { data: analysis } = useAssetAnalysis(symbol, timeframe);
  const livePrice = useLivePrice({ symbol, pollMs: 5000, enabled: true });
  const candles: Candle[] | undefined = analysis?.chartData?.map((c: any) => ({
    t: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
  }));
  return (
    <DecisionChart
      symbol={symbol}
      timeframe={timeframe}
      entry={entry}
      entryLabel={entryLabel}
      stopLoss={stopLoss}
      targets={targets}
      candles={candles}
      livePrice={livePrice}
      refPrice={entry}
    />
  );
}
