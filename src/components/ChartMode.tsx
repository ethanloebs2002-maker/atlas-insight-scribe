import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Customized,
} from "recharts";
import { X, ZoomIn, ZoomOut, RotateCcw, Crosshair } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";

interface KlinePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20: number | null;
  ema50: number | null;
}

interface ChartModeProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: KlinePoint[];
  symbol: string;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  entryZones?: { low: number; high: number }[];
  stopLevel?: number;
  targets?: { price: number; label: string }[];
}

const TIMEFRAMES = [
  { value: "1m", label: "1m" }, { value: "5m", label: "5m" },
  { value: "15m", label: "15m" }, { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hour" }, { value: "1d", label: "1 Day" },
  { value: "1w", label: "1 Week" }, { value: "1M", label: "1 Month" },
];

function computeEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  return ema;
}

function computeRSI(prices: number[], period = 14): number[] {
  const rsi: number[] = new Array(prices.length).fill(50);
  if (prices.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeMACD(prices: number[]) {
  const ema12 = computeEMA(prices, 12);
  const ema26 = computeEMA(prices, 26);
  const line = ema12.map((v, i) => v - ema26[i]);
  const signal = computeEMA(line, 9);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
};
const formatPrice = (val: number) => {
  if (val >= 10000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${val.toFixed(0)}`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
};

function CandlesLayer(props: any) {
  const { xAxisMap, yAxisMap, formattedGraphicalItems } = props;
  if (!xAxisMap || !yAxisMap) return null;
  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;
  const firstLine = formattedGraphicalItems?.[0];
  if (!firstLine) return null;
  const data = firstLine.props?.points?.map((p: any) => p.payload) || [];
  if (!data.length) return null;
  const bandwidth = Math.max(2, (xAxis.scale.range()[1] - xAxis.scale.range()[0]) / data.length * 0.6);

  return (
    <g>
      {data.map((d: any, i: number) => {
        const x = xAxis.scale(d.time);
        if (x === undefined || isNaN(x)) return null;
        const isBullish = d.close >= d.open;
        const bodyTop = yAxis.scale(Math.max(d.open, d.close));
        const bodyBottom = yAxis.scale(Math.min(d.open, d.close));
        const wickTop = yAxis.scale(d.high);
        const wickBottom = yAxis.scale(d.low);
        if ([bodyTop, bodyBottom, wickTop, wickBottom].some(v => v === undefined || isNaN(v))) return null;
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        const fill = isBullish ? "hsl(160, 80%, 48%)" : "hsl(0, 72%, 55%)";
        const stroke = isBullish ? "hsl(160, 80%, 58%)" : "hsl(0, 72%, 65%)";
        const halfW = bandwidth / 2;
        return (
          <g key={i}>
            <line x1={x} y1={wickTop} x2={x} y2={bodyTop} stroke={stroke} strokeWidth={1} />
            <line x1={x} y1={bodyBottom} x2={x} y2={wickBottom} stroke={stroke} strokeWidth={1} />
            <rect x={x - halfW} y={bodyTop} width={bandwidth} height={bodyHeight} fill={fill} stroke={stroke} strokeWidth={0.5} rx={0.5} opacity={0.9} />
          </g>
        );
      })}
    </g>
  );
}

const ChartTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isBullish = d.close >= d.open;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-[10px] font-mono shadow-xl space-y-1 max-w-[220px]">
      <div className="text-muted-foreground">{new Date(d.time).toLocaleString()}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">Open</span><span className="text-right">${Number(d.open).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">High</span><span className="text-right text-bullish">${Number(d.high).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">Low</span><span className="text-right text-bearish">${Number(d.low).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">Close</span><span className={`text-right font-bold ${isBullish ? "text-bullish" : "text-bearish"}`}>${Number(d.close).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        {d.rsi != null && <><span className="text-muted-foreground">RSI</span><span className="text-right">{d.rsi.toFixed(1)}</span></>}
        {d.macdLine != null && <><span className="text-muted-foreground">MACD</span><span className="text-right">{d.macdLine.toFixed(2)}</span></>}
      </div>
      <div className="text-muted-foreground pt-0.5 border-t border-border">Volume: {Number(d.volume).toLocaleString()}</div>
    </div>
  );
};

export default function ChartMode({ open, onOpenChange, data, symbol, timeframe, onTimeframeChange, entryZones, stopLevel, targets }: ChartModeProps) {
  const [visibleCount, setVisibleCount] = useState(80);
  const [showEMA, setShowEMA] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showATLAS, setShowATLAS] = useState(true);
  const [view, setView] = useState<"simple" | "advanced">("advanced");

  const enriched = useMemo(() => {
    if (!data.length) return [];
    const closes = data.map(d => d.close);
    const rsi = computeRSI(closes);
    const macd = computeMACD(closes);
    return data.map((d, i) => ({
      ...d,
      rsi: rsi[i],
      macdLine: macd.line[i],
      macdSignal: macd.signal[i],
      macdHist: macd.hist[i],
    }));
  }, [data]);

  const visible = useMemo(() => enriched.slice(-visibleCount), [enriched, visibleCount]);
  const { yMin, yMax } = useMemo(() => {
    if (!visible.length) return { yMin: 0, yMax: 0 };
    let min = Infinity, max = -Infinity;
    for (const d of visible) {
      if (d.low < min) min = d.low;
      if (d.high > max) max = d.high;
    }
    const pad = (max - min) * 0.08;
    return { yMin: min - pad, yMax: max + pad };
  }, [visible]);

  const isSimple = view === "simple";
  const chartH = isSimple ? 500 : 420;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full p-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono font-bold text-primary">{symbol}/USD</span>
            <Tabs value={view} onValueChange={(v) => setView(v as "simple" | "advanced")}>
              <TabsList className="h-7 bg-secondary">
                <TabsTrigger value="simple" className="text-[9px] h-5 px-2">
                  Simple View
                </TabsTrigger>
                <TabsTrigger value="advanced" className="text-[9px] h-5 px-2">
                  Advanced View
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <HelpTooltip id={isSimple ? "chart-simple-view" : "chart-advanced-view"} />
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => onTimeframeChange(tf.value)}
                  className={`px-2 py-1 text-[9px] font-mono transition-colors ${
                    timeframe === tf.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {!isSimple && (
              <div className="flex items-center gap-1.5 text-[9px] font-mono">
                {[
                  { label: "EMA", active: showEMA, set: setShowEMA, tip: "chart-ema" },
                  { label: "RSI", active: showRSI, set: setShowRSI, tip: "chart-rsi" },
                  { label: "MACD", active: showMACD, set: setShowMACD, tip: "chart-macd" },
                  { label: "Volume", active: showVolume, set: setShowVolume, tip: "chart-volume" },
                  { label: "ATLAS", active: showATLAS, set: setShowATLAS, tip: "chart-atlas-overlays" },
                ].map(t => (
                  <HelpTooltip key={t.label} id={t.tip}>
                    <button
                      onClick={() => t.set(!t.active)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                        t.active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  </HelpTooltip>
                ))}
              </div>
            )}

            {/* Zoom */}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleCount(c => Math.min(data.length, c + 20))}>
                <ZoomOut className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleCount(c => Math.max(15, c - 20))}>
                <ZoomIn className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleCount(80)}>
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chart area */}
        <div className="flex-1 p-2 overflow-hidden">
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart data={visible} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatTime}
                tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "hsl(215, 12%, 50%)" }}
                axisLine={{ stroke: "hsl(220, 15%, 18%)" }} tickLine={false} />
              <YAxis domain={[yMin, yMax]} tickFormatter={formatPrice}
                tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "hsl(215, 12%, 50%)" }}
                axisLine={false} tickLine={false} width={65} orientation="right" />
              <RTooltip content={<ChartTooltipContent />} />

              {showATLAS && entryZones?.map((ez, i) => (
                <ReferenceArea key={`ez-${i}`} y1={ez.low} y2={ez.high} fill="hsl(175, 80%, 50%)" fillOpacity={0.08} />
              ))}
              {showATLAS && stopLevel && (
                <ReferenceLine y={stopLevel} stroke="hsl(0, 72%, 55%)" strokeDasharray="4 2" strokeWidth={1}
                  label={{ value: "Stop Loss", position: "left", fontSize: 9, fill: "hsl(0, 72%, 55%)" }} />
              )}
              {showATLAS && targets?.map((t, i) => (
                <ReferenceLine key={`tp-${i}`} y={t.price} stroke="hsl(160, 80%, 48%)" strokeDasharray="4 2" strokeWidth={0.8}
                  label={{ value: t.label, position: "left", fontSize: 9, fill: "hsl(160, 80%, 48%)" }} />
              ))}

              <Customized component={CandlesLayer} />
              {(!isSimple && showEMA) && (
                <>
                  <Line type="monotone" dataKey="ema20" stroke="hsl(175, 80%, 50%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="ema50" stroke="hsl(45, 80%, 55%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Volume */}
          {!isSimple && showVolume && (
            <ResponsiveContainer width="100%" height={60}>
              <ComposedChart data={visible} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} hide />
                <YAxis hide />
                <Bar dataKey="volume" fill="hsl(215, 12%, 30%)" opacity={0.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* RSI */}
          {!isSimple && showRSI && (
            <ResponsiveContainer width="100%" height={80}>
              <ComposedChart data={visible} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 8, fontFamily: "JetBrains Mono", fill: "hsl(215, 12%, 50%)" }}
                  axisLine={false} tickLine={false} width={65} orientation="right" tickCount={3} />
                <ReferenceLine y={70} stroke="hsl(0, 72%, 55%)" strokeDasharray="2 2" strokeWidth={0.5} />
                <ReferenceLine y={30} stroke="hsl(160, 80%, 48%)" strokeDasharray="2 2" strokeWidth={0.5} />
                <Line type="monotone" dataKey="rsi" stroke="hsl(280, 60%, 60%)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* MACD */}
          {!isSimple && showMACD && (
            <ResponsiveContainer width="100%" height={80}>
              <ComposedChart data={visible} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} hide />
                <YAxis tick={{ fontSize: 8, fontFamily: "JetBrains Mono", fill: "hsl(215, 12%, 50%)" }}
                  axisLine={false} tickLine={false} width={65} orientation="right" tickCount={3} />
                <ReferenceLine y={0} stroke="hsl(220, 15%, 25%)" strokeWidth={0.5} />
                <Bar dataKey="macdHist" fill="hsl(215, 12%, 35%)" opacity={0.6} isAnimationActive={false} />
                <Line type="monotone" dataKey="macdLine" stroke="hsl(175, 80%, 50%)" strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="macdSignal" stroke="hsl(0, 72%, 55%)" strokeWidth={1} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
