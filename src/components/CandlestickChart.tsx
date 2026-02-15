import { useMemo, useState, useCallback } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Customized,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

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

interface CandlestickChartProps {
  data: KlinePoint[];
  symbol: string;
}

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

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isBullish = d.close >= d.open;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-[10px] font-mono shadow-xl space-y-1">
      <div className="text-muted-foreground">{new Date(d.time).toLocaleString()}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">Open</span>
        <span className="text-right">${Number(d.open).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">High</span>
        <span className="text-right text-bullish">${Number(d.high).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">Low</span>
        <span className="text-right text-bearish">${Number(d.low).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className="text-muted-foreground">Close</span>
        <span className={`text-right font-bold ${isBullish ? 'text-bullish' : 'text-bearish'}`}>
          ${Number(d.close).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        {d.ema20 && (
          <>
            <span className="text-muted-foreground">EMA 20</span>
            <span className="text-right text-primary">${Number(d.ema20).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </>
        )}
        {d.ema50 && (
          <>
            <span className="text-muted-foreground">EMA 50</span>
            <span className="text-right text-neutral-signal">${Number(d.ema50).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </>
        )}
      </div>
      <div className="text-muted-foreground pt-0.5 border-t border-border">
        Vol: {Number(d.volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
};

// Render candlesticks as a Customized layer using chart internals
function CandlesLayer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap, offset } = props;
  if (!xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;

  // Get data from the first line's points
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
            <rect
              x={x - halfW}
              y={bodyTop}
              width={bandwidth}
              height={bodyHeight}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.5}
              rx={0.5}
              opacity={0.9}
            />
          </g>
        );
      })}
    </g>
  );
}

export default function CandlestickChart({ data, symbol }: CandlestickChartProps) {
  const [visibleCount, setVisibleCount] = useState(40);

  const visibleData = useMemo(() => data.slice(-visibleCount), [data, visibleCount]);

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
    }
    const pad = (max - min) * 0.08;
    return { yMin: min - pad, yMax: max + pad };
  }, [visibleData]);

  const lastPrice = data[data.length - 1]?.close;

  return (
    <Card>
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {symbol}/USD • 4H Candlestick
        </CardTitle>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 mr-3 text-[9px] font-mono">
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3 bg-primary inline-block rounded" />
              EMA 20
            </span>
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3 bg-neutral-signal inline-block rounded" />
              EMA 50
            </span>
          </div>
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
      </CardHeader>
      <CardContent className="p-0 pr-2 pb-2">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={visibleData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTime}
              tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 50%)' }}
              axisLine={{ stroke: 'hsl(220, 15%, 18%)' }}
              tickLine={false}
              tickCount={8}
              scale="linear"
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={formatPrice}
              tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215, 12%, 50%)' }}
              axisLine={false}
              tickLine={false}
              width={60}
              orientation="right"
            />
            <Tooltip content={<CustomTooltip />} />

            {lastPrice && (
              <ReferenceLine y={lastPrice} stroke="hsl(175, 80%, 50%)" strokeDasharray="3 3" strokeWidth={0.5} />
            )}

            {/* Candlesticks rendered via Customized */}
            <Customized component={CandlesLayer} />

            {/* EMA 20 */}
            <Line type="monotone" dataKey="ema20" stroke="hsl(175, 80%, 50%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />

            {/* EMA 50 */}
            <Line type="monotone" dataKey="ema50" stroke="hsl(45, 80%, 55%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
