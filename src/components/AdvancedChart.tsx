import { useMemo, useState, useCallback } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Customized,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ZoomIn, ZoomOut, RotateCcw, Layers, TrendingUp } from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────
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

interface IndicatorData extends KlinePoint {
  rsi?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHist?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  vwap?: number;
  atr?: number;
  volumeColor?: string;
}

interface AdvancedChartProps {
  data: KlinePoint[];
  symbol: string;
  entryZones?: { low: number; high: number }[];
  stopLevel?: number;
  targets?: { price: number; label: string }[];
}

// ─── TIMEFRAME CONFIG ───────────────────────────────────────────
const TIMEFRAMES = [
  { value: '1m', label: '1m' }, { value: '5m', label: '5m' },
  { value: '15m', label: '15m' }, { value: '1h', label: '1H' },
  { value: '4h', label: '4H' }, { value: '1d', label: '1D' },
  { value: '1w', label: '1W' }, { value: '1M', label: '1M' },
];

// ─── INDICATOR COMPUTATION ──────────────────────────────────────
function computeEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
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
  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeMACD(prices: number[]): { line: number[]; signal: number[]; hist: number[] } {
  const ema12 = computeEMA(prices, 12);
  const ema26 = computeEMA(prices, 26);
  const line = ema12.map((v, i) => v - ema26[i]);
  const signal = computeEMA(line, 9);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

function computeBollingerBands(prices: number[], period = 20, mult = 2) {
  const upper: (number | undefined)[] = [];
  const middle: (number | undefined)[] = [];
  const lower: (number | undefined)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(undefined); middle.push(undefined); lower.push(undefined);
      continue;
    }
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    middle.push(mean);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, middle, lower };
}

function computeATR(data: KlinePoint[], period = 14): number[] {
  const atr: number[] = new Array(data.length).fill(0);
  const trs: number[] = [data[0].high - data[0].low];
  for (let i = 1; i < data.length; i++) {
    trs.push(Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    ));
  }
  for (let i = period - 1; i < trs.length; i++) {
    const slice = trs.slice(i - period + 1, i + 1);
    atr[i] = slice.reduce((a, b) => a + b, 0) / period;
  }
  return atr;
}

// ─── FORMATTING ─────────────────────────────────────────────────
const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`;
};

const formatPrice = (val: number) => {
  if (val >= 10000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${val.toFixed(0)}`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
};

// ─── TOOLTIP ────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as IndicatorData;
  const isBullish = d.close >= d.open;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-[10px] font-mono shadow-xl space-y-1 max-w-[220px]">
      <div className="text-muted-foreground">{new Date(d.time).toLocaleString()}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">O</span>
        <span className="text-right">${Number(d.open).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">H</span>
        <span className="text-right text-bullish">${Number(d.high).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">L</span>
        <span className="text-right text-bearish">${Number(d.low).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">C</span>
        <span className={`text-right font-bold ${isBullish ? 'text-bullish' : 'text-bearish'}`}>
          ${Number(d.close).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        {d.rsi !== undefined && (<><span className="text-muted-foreground">RSI</span><span className="text-right">{d.rsi.toFixed(1)}</span></>)}
        {d.macdLine !== undefined && (<><span className="text-muted-foreground">MACD</span><span className="text-right">{d.macdLine.toFixed(2)}</span></>)}
        {d.atr !== undefined && d.atr > 0 && (<><span className="text-muted-foreground">ATR</span><span className="text-right">${d.atr.toFixed(2)}</span></>)}
      </div>
      <div className="text-muted-foreground pt-0.5 border-t border-border">
        Vol: {Number(d.volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
};

// ─── CANDLES LAYER ──────────────────────────────────────────────
function CandlesLayer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
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
      {data.map((d: KlinePoint, i: number) => {
        const x = xAxis.scale(d.time);
        if (x === undefined || isNaN(x)) return null;

        const isBullish = d.close >= d.open;
        const bodyTop = yAxis.scale(Math.max(d.open, d.close));
        const bodyBottom = yAxis.scale(Math.min(d.open, d.close));
        const wickTop = yAxis.scale(d.high);
        const wickBottom = yAxis.scale(d.low);

        if ([bodyTop, bodyBottom, wickTop, wickBottom].some(v => v === undefined || isNaN(v))) return null;

        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        const fill = isBullish ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)';
        const stroke = isBullish ? 'hsl(160, 80%, 58%)' : 'hsl(0, 72%, 65%)';
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

// ─── MAIN COMPONENT ─────────────────────────────────────────────
export default function AdvancedChart({ data, symbol, entryZones, stopLevel, targets }: AdvancedChartProps) {
  const [visibleCount, setVisibleCount] = useState(40);
  const [timeframe, setTimeframe] = useState('4h');
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showATLAS, setShowATLAS] = useState(true);

  const enrichedData = useMemo((): IndicatorData[] => {
    if (!data.length) return [];
    const closes = data.map(d => d.close);
    const rsiArr = computeRSI(closes);
    const macd = computeMACD(closes);
    const bb = computeBollingerBands(closes);
    const atr = computeATR(data);

    return data.map((d, i) => ({
      ...d,
      rsi: rsiArr[i],
      macdLine: macd.line[i],
      macdSignal: macd.signal[i],
      macdHist: macd.hist[i],
      bbUpper: bb.upper[i],
      bbMiddle: bb.middle[i],
      bbLower: bb.lower[i],
      atr: atr[i],
      volumeColor: d.close >= d.open ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)',
    }));
  }, [data]);

  const visibleData = useMemo(() => enrichedData.slice(-visibleCount), [enrichedData, visibleCount]);

  const { yMin, yMax } = useMemo(() => {
    if (!visibleData.length) return { yMin: 0, yMax: 0 };
    let min = Infinity, max = -Infinity;
    for (const d of visibleData) {
      if (d.low < min) min = d.low;
      if (d.high > max) max = d.high;
      if (d.ema20 && d.ema20 < min) min = d.ema20;
      if (d.ema20 && d.ema20 > max) max = d.ema20;
      if (d.ema50 && d.ema50 < min) min = d.ema50;
      if (d.ema50 && d.ema50 > max) max = d.ema50;
      if (showBB && d.bbUpper && d.bbUpper > max) max = d.bbUpper;
      if (showBB && d.bbLower && d.bbLower < min) min = d.bbLower;
    }
    const pad = (max - min) * 0.08;
    return { yMin: min - pad, yMax: max + pad };
  }, [visibleData, showBB]);

  const lastPrice = data[data.length - 1]?.close;
  const mainChartHeight = 300;
  const subChartHeight = showRSI || showMACD ? 100 : 0;
  const volumeHeight = showVolume ? 60 : 0;

  return (
    <Card>
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {symbol}/USD • Advanced Chart
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Timeframe selector */}
          <div className="flex rounded-md border border-border overflow-hidden">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors ${
                  timeframe === tf.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Indicator toggles */}
          <div className="flex items-center gap-2 ml-2 text-[9px] font-mono">
            <TogglePill label="RSI" active={showRSI} onChange={setShowRSI} />
            <TogglePill label="MACD" active={showMACD} onChange={setShowMACD} />
            <TogglePill label="BB" active={showBB} onChange={setShowBB} />
            <TogglePill label="VOL" active={showVolume} onChange={setShowVolume} />
            <TogglePill label="ATLAS" active={showATLAS} onChange={setShowATLAS} color="text-primary" />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 ml-2">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleCount(c => Math.min(data.length, c + 10))}>
              <ZoomOut className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleCount(c => Math.max(15, c - 10))}>
              <ZoomIn className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleCount(40)}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 ml-2 text-[9px] font-mono">
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-primary inline-block rounded" />EMA20</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-neutral-signal inline-block rounded" />EMA50</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 pr-2 pb-2 space-y-0">
        {/* Main price chart */}
        <ResponsiveContainer width="100%" height={mainChartHeight}>
          <ComposedChart data={visibleData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime}
              tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 50%)' }}
              axisLine={{ stroke: 'hsl(220, 15%, 18%)' }} tickLine={false} tickCount={8} scale="linear" />
            <YAxis domain={[yMin, yMax]} tickFormatter={formatPrice}
              tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 50%)' }}
              axisLine={false} tickLine={false} width={60} orientation="right" />
            <Tooltip content={<ChartTooltip />} />

            {/* Bollinger Bands */}
            {showBB && <Line type="monotone" dataKey="bbUpper" stroke="hsl(220, 40%, 60%)" strokeWidth={0.8} dot={false} isAnimationActive={false} strokeDasharray="3 3" connectNulls />}
            {showBB && <Line type="monotone" dataKey="bbMiddle" stroke="hsl(220, 40%, 50%)" strokeWidth={0.8} dot={false} isAnimationActive={false} strokeDasharray="2 2" connectNulls />}
            {showBB && <Line type="monotone" dataKey="bbLower" stroke="hsl(220, 40%, 60%)" strokeWidth={0.8} dot={false} isAnimationActive={false} strokeDasharray="3 3" connectNulls />}

            {/* ATLAS overlays: entry zones, stop, targets */}
            {showATLAS && entryZones?.map((ez, i) => (
              <ReferenceArea key={`ez-${i}`} y1={ez.low} y2={ez.high} fill="hsl(175, 80%, 50%)" fillOpacity={0.08} />
            ))}
            {showATLAS && stopLevel && (
              <ReferenceLine y={stopLevel} stroke="hsl(0, 72%, 55%)" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'STOP', position: 'left', fontSize: 8, fill: 'hsl(0, 72%, 55%)' }} />
            )}
            {showATLAS && targets?.map((t, i) => (
              <ReferenceLine key={`tp-${i}`} y={t.price} stroke="hsl(160, 80%, 48%)" strokeDasharray="4 2" strokeWidth={0.8} label={{ value: t.label, position: 'left', fontSize: 8, fill: 'hsl(160, 80%, 48%)' }} />
            ))}

            {lastPrice && <ReferenceLine y={lastPrice} stroke="hsl(175, 80%, 50%)" strokeDasharray="3 3" strokeWidth={0.5} />}

            <Customized component={CandlesLayer} />
            <Line type="monotone" dataKey="ema20" stroke="hsl(175, 80%, 50%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="ema50" stroke="hsl(45, 80%, 55%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Volume sub-chart */}
        {showVolume && (
          <ResponsiveContainer width="100%" height={volumeHeight}>
            <ComposedChart data={visibleData} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis hide />
              {visibleData.map((d, i) => null)}
              <Bar dataKey="volume" fill="hsl(215, 12%, 30%)" opacity={0.5} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* RSI sub-chart */}
        {showRSI && (
          <ResponsiveContainer width="100%" height={subChartHeight}>
            <ComposedChart data={visibleData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 50%)' }}
                axisLine={false} tickLine={false} width={60} orientation="right" tickCount={3} />
              <ReferenceLine y={70} stroke="hsl(0, 72%, 55%)" strokeDasharray="2 2" strokeWidth={0.5} />
              <ReferenceLine y={30} stroke="hsl(160, 80%, 48%)" strokeDasharray="2 2" strokeWidth={0.5} />
              <ReferenceLine y={50} stroke="hsl(220, 15%, 25%)" strokeWidth={0.5} />
              <Line type="monotone" dataKey="rsi" stroke="hsl(280, 60%, 60%)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* MACD sub-chart */}
        {showMACD && (
          <ResponsiveContainer width="100%" height={subChartHeight}>
            <ComposedChart data={visibleData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 50%)' }}
                axisLine={false} tickLine={false} width={60} orientation="right" tickCount={3} />
              <ReferenceLine y={0} stroke="hsl(220, 15%, 25%)" strokeWidth={0.5} />
              <Bar dataKey="macdHist" fill="hsl(215, 12%, 35%)" opacity={0.6} isAnimationActive={false} />
              <Line type="monotone" dataKey="macdLine" stroke="hsl(175, 80%, 50%)" strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="macdSignal" stroke="hsl(0, 72%, 55%)" strokeWidth={1} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}


// ─── TOGGLE PILL ────────────────────────────────────────────────
function TogglePill({ label, active, onChange, color }: { label: string; active: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors border ${
        active
          ? `border-primary/50 bg-primary/10 ${color || 'text-primary'}`
          : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
