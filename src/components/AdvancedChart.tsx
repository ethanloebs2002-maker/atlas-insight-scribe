import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Customized,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, Expand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HelpTooltip from '@/components/HelpTooltip';

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
  atr?: number;
}

interface AdvancedChartProps {
  data: KlinePoint[];
  symbol: string;
  entryZones?: { low: number; high: number }[];
  stopLevel?: number;
  targets?: { price: number; label: string }[];
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  isLoading?: boolean;
  chartView?: 'simple' | 'advanced';
}

// ─── INDICATOR COMPUTATION ──────────────────────────────────────
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

function computeATR(data: KlinePoint[], period = 14): number[] {
  const atr: number[] = new Array(data.length).fill(0);
  const trs: number[] = [data[0].high - data[0].low];
  for (let i = 1; i < data.length; i++) {
    trs.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
  }
  for (let i = period - 1; i < trs.length; i++) {
    atr[i] = trs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  }
  return atr;
}

// ─── FORMATTING ─────────────────────────────────────────────────
const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
const formatPrice = (val: number) => {
  if (val >= 10000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${val.toFixed(0)}`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
};

// ─── SIMPLE LINE TOOLTIP (Coinbase style) ───────────────────────
const SimpleTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono shadow-xl">
      <div className="text-foreground font-bold">${Number(d.close).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      <div className="text-muted-foreground text-[10px]">{new Date(d.time).toLocaleString()}</div>
    </div>
  );
};

// ─── ADVANCED OHLC TOOLTIP (TradingView style) ─────────────────
const AdvancedTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as IndicatorData;
  const isBullish = d.close >= d.open;
  return (
    <div className="rounded border border-border bg-card p-2 text-[10px] font-mono shadow-xl space-y-0.5 min-w-[180px]">
      <div className="text-muted-foreground text-[9px]">{new Date(d.time).toLocaleString()}</div>
      <div className="grid grid-cols-4 gap-x-2 text-[10px]">
        <span className="text-muted-foreground">O</span>
        <span>{d.open.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">H</span>
        <span className="text-bullish">{d.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">L</span>
        <span className="text-bearish">{d.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">C</span>
        <span className={isBullish ? 'text-bullish font-bold' : 'text-bearish font-bold'}>{d.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="text-muted-foreground border-t border-border pt-0.5 mt-0.5">Vol: {Number(d.volume).toLocaleString()}</div>
    </div>
  );
};

// ─── CANDLES LAYER (TradingView-style) ──────────────────────────
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
  const bandwidth = Math.max(3, (xAxis.scale.range()[1] - xAxis.scale.range()[0]) / data.length * 0.7);

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
        const fill = isBullish ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)';
        const stroke = isBullish ? 'hsl(160, 80%, 55%)' : 'hsl(0, 72%, 62%)';
        const halfW = bandwidth / 2;
        return (
          <g key={i}>
            <line x1={x} y1={wickTop} x2={x} y2={wickBottom} stroke={stroke} strokeWidth={1} />
            <rect x={x - halfW} y={bodyTop} width={bandwidth} height={bodyHeight} fill={fill} stroke={stroke} strokeWidth={0.5} rx={0.5} />
          </g>
        );
      })}
    </g>
  );
}

// ─── VOLUME BARS LAYER (colored by candle direction) ────────────
function VolumeLayer(props: any) {
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
  const yRange = yAxis.scale.range();
  const yBottom = Math.max(...yRange);

  return (
    <g>
      {data.map((d: any, i: number) => {
        const x = xAxis.scale(d.time);
        const top = yAxis.scale(d.volume);
        if (x === undefined || isNaN(x) || top === undefined || isNaN(top)) return null;
        const isBullish = d.close >= d.open;
        const fill = isBullish ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)';
        return (
          <rect key={i} x={x - bandwidth / 2} y={top} width={bandwidth} height={Math.max(0, yBottom - top)} fill={fill} opacity={0.35} />
        );
      })}
    </g>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────
export default function AdvancedChart({
  data, symbol, entryZones, stopLevel, targets,
  timeframe, onTimeframeChange, isLoading,
  chartView = 'simple',
}: AdvancedChartProps) {
  const [visibleCount, setVisibleCount] = useState(60);
  const [showEMA, setShowEMA] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showATLAS, setShowATLAS] = useState(true);

  const isSimple = chartView === 'simple';

  const enrichedData = useMemo((): IndicatorData[] => {
    if (!data.length) return [];
    const closes = data.map(d => d.close);
    const rsiArr = computeRSI(closes);
    const macd = computeMACD(closes);
    const atr = computeATR(data);
    return data.map((d, i) => ({
      ...d,
      rsi: rsiArr[i],
      macdLine: macd.line[i],
      macdSignal: macd.signal[i],
      macdHist: macd.hist[i],
      atr: atr[i],
    }));
  }, [data]);

  const visibleData = useMemo(() => enrichedData.slice(-visibleCount), [enrichedData, visibleCount]);

  const { yMin, yMax } = useMemo(() => {
    if (!visibleData.length) return { yMin: 0, yMax: 0 };
    let min = Infinity, max = -Infinity;
    for (const d of visibleData) {
      if (d.low < min) min = d.low;
      if (d.high > max) max = d.high;
    }
    const pad = (max - min) * 0.08;
    return { yMin: min - pad, yMax: max + pad };
  }, [visibleData]);

  const lastPoint = visibleData[visibleData.length - 1];
  const firstPoint = visibleData[0];
  const priceChange = lastPoint && firstPoint ? lastPoint.close - firstPoint.close : 0;
  const isUp = priceChange >= 0;

  // ─── SIMPLE VIEW (Coinbase-style line chart) ──────────────────
  if (isSimple) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-0 relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/70 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Loading {timeframe} data…
              </div>
            </div>
          )}

          {/* Price header inside chart area */}
          {lastPoint && (
            <div className="absolute top-4 left-5 z-10">
              <div className="text-2xl font-mono font-bold text-foreground">
                ${lastPoint.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-mono ${isUp ? 'text-bullish' : 'text-bearish'}`}>
                {isUp ? '▲' : '▼'} ${Math.abs(priceChange).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {' '}({((priceChange / (firstPoint?.close || 1)) * 100).toFixed(2)}%)
              </div>
            </div>
          )}

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={visibleData} margin={{ top: 60, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isUp ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isUp ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime}
                tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 40%)' }}
                axisLine={false} tickLine={false} tickCount={6} />
              <YAxis domain={[yMin, yMax]} hide />
              <Tooltip content={<SimpleTooltip />} cursor={{ stroke: 'hsl(215, 12%, 30%)', strokeDasharray: '4 2' }} />
              <Area type="monotone" dataKey="close" stroke="none" fill="url(#lineGradient)" isAnimationActive={false} />
              <Line type="monotone" dataKey="close"
                stroke={isUp ? 'hsl(160, 80%, 48%)' : 'hsl(0, 72%, 55%)'}
                strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  // ─── ADVANCED VIEW (TradingView-style) ────────────────────────
  const lastData = visibleData[visibleData.length - 1];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0 relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/70 backdrop-blur-[2px] rounded-b-lg">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading {timeframe} data…
            </div>
          </div>
        )}

        {/* TradingView-style OHLC header bar */}
        {lastData && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
            <span className="text-xs font-mono font-bold text-foreground">{symbol}/USD</span>
            <span className="text-[10px] font-mono text-muted-foreground">O</span>
            <span className="text-[10px] font-mono text-foreground">{lastData.open.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className="text-[10px] font-mono text-muted-foreground">H</span>
            <span className="text-[10px] font-mono text-bullish">{lastData.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className="text-[10px] font-mono text-muted-foreground">L</span>
            <span className="text-[10px] font-mono text-bearish">{lastData.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className="text-[10px] font-mono text-muted-foreground">C</span>
            <span className={`text-[10px] font-mono font-bold ${lastData.close >= lastData.open ? 'text-bullish' : 'text-bearish'}`}>
              {lastData.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className={`text-[10px] font-mono ${isUp ? 'text-bullish' : 'text-bearish'}`}>
              {isUp ? '+' : ''}{priceChange.toFixed(2)} ({((priceChange / (firstPoint?.close || 1)) * 100).toFixed(2)}%)
            </span>

            <div className="ml-auto flex items-center gap-1">
              {/* Indicator toggles */}
              {[
                { label: 'EMA', active: showEMA, set: setShowEMA },
                { label: 'RSI', active: showRSI, set: setShowRSI },
                { label: 'MACD', active: showMACD, set: setShowMACD },
                { label: 'Vol', active: showVolume, set: setShowVolume },
                { label: 'ATLAS', active: showATLAS, set: setShowATLAS },
              ].map(t => (
                <button
                  key={t.label}
                  onClick={(e) => { e.stopPropagation(); t.set(!t.active); }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                    t.active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}

              {/* Zoom */}
              <div className="flex items-center gap-0.5 ml-1.5 border-l border-border pl-1.5">
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setVisibleCount(c => Math.min(data.length, c + 15)); }}>
                  <ZoomOut className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setVisibleCount(c => Math.max(15, c - 15)); }}>
                  <ZoomIn className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setVisibleCount(60); }}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>

              <Expand className="h-3.5 w-3.5 text-muted-foreground ml-1" />
            </div>
          </div>
        )}

        {/* Main candlestick chart */}
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={visibleData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime}
              tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 40%)' }}
              axisLine={{ stroke: 'hsl(220, 15%, 15%)' }} tickLine={false} tickCount={8} />
            <YAxis domain={[yMin, yMax]} tickFormatter={formatPrice}
              tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 40%)' }}
              axisLine={false} tickLine={false} width={65} orientation="right" />
            <Tooltip content={<AdvancedTooltip />} />

            {/* ATLAS overlays */}
            {showATLAS && entryZones?.map((ez, i) => (
              <ReferenceArea key={`ez-${i}`} y1={ez.low} y2={ez.high} fill="hsl(175, 80%, 50%)" fillOpacity={0.06} />
            ))}
            {showATLAS && stopLevel && (
              <ReferenceLine y={stopLevel} stroke="hsl(0, 72%, 55%)" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: 'Stop Loss', position: 'left', fontSize: 8, fill: 'hsl(0, 72%, 55%)' }} />
            )}
            {showATLAS && targets?.map((t, i) => (
              <ReferenceLine key={`tp-${i}`} y={t.price} stroke="hsl(160, 80%, 48%)" strokeDasharray="4 2" strokeWidth={0.8}
                label={{ value: t.label, position: 'left', fontSize: 8, fill: 'hsl(160, 80%, 48%)' }} />
            ))}

            {/* Current price line */}
            {lastData && (
              <ReferenceLine y={lastData.close} stroke="hsl(215, 12%, 35%)" strokeDasharray="2 2" strokeWidth={0.5} />
            )}

            <Customized component={CandlesLayer} />
            {showEMA && (
              <>
                <Line type="monotone" dataKey="ema20" stroke="hsl(175, 80%, 50%)" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="ema50" stroke="hsl(45, 80%, 55%)" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Volume sub-chart with colored bars */}
        {showVolume && (
          <ResponsiveContainer width="100%" height={60}>
            <ComposedChart data={visibleData} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis hide />
              <Customized component={VolumeLayer} />
              {/* invisible line to seed axis data */}
              <Line type="monotone" dataKey="volume" stroke="transparent" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* RSI sub-chart */}
        {showRSI && (
          <ResponsiveContainer width="100%" height={80}>
            <ComposedChart data={visibleData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 40%)' }}
                axisLine={false} tickLine={false} width={65} orientation="right" tickCount={3} />
              <ReferenceLine y={70} stroke="hsl(0, 72%, 55%)" strokeDasharray="2 2" strokeWidth={0.5} />
              <ReferenceLine y={30} stroke="hsl(160, 80%, 48%)" strokeDasharray="2 2" strokeWidth={0.5} />
              <Line type="monotone" dataKey="rsi" stroke="hsl(280, 60%, 60%)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* MACD sub-chart */}
        {showMACD && (
          <ResponsiveContainer width="100%" height={80}>
            <ComposedChart data={visibleData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis tick={{ fontSize: 8, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 40%)' }}
                axisLine={false} tickLine={false} width={65} orientation="right" tickCount={3} />
              <ReferenceLine y={0} stroke="hsl(220, 15%, 20%)" strokeWidth={0.5} />
              <Bar dataKey="macdHist" fill="hsl(215, 12%, 30%)" opacity={0.6} isAnimationActive={false} />
              <Line type="monotone" dataKey="macdLine" stroke="hsl(175, 80%, 50%)" strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="macdSignal" stroke="hsl(0, 72%, 55%)" strokeWidth={1} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* EMA legend at bottom */}
        {showEMA && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border text-[9px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded inline-block" style={{ background: 'hsl(175, 80%, 50%)' }} />EMA 20</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded inline-block" style={{ background: 'hsl(45, 80%, 55%)' }} />EMA 50</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
