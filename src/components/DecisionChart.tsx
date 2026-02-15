import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  Customized,
} from "recharts";

export interface Candle {
  t: number;       // timestamp ms
  open: number;
  high: number;
  low: number;
  close: number;
}

interface DecisionChartProps {
  symbol: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  candles?: Candle[];
  /** @deprecated kept for backwards-compat; ignored when candles provided */
  refPrice?: number;
}

// ─── Candlestick rendering layer ─────────────────────────────────
function CandlesLayer(props: any) {
  const { xAxisMap, yAxisMap, offset } = props;
  if (!xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const data: { idx: number; open: number; close: number; high: number; low: number }[] =
    (props as any).formattedGraphicalItems?.[0]?.props?.data ?? [];

  // Use the actual chart data from the composed chart
  const chartData = xAxis.categoricalDomain
    ? (props as any).formattedGraphicalItems?.[0]?.props?.points?.map((_: any, i: number) => i) ?? []
    : [];

  const items = (xAxis.categoricalDomain ?? []).map((_: any, i: number) => {
    const item = (props as any).formattedGraphicalItems?.[0]?.props?.data?.[i];
    return item;
  });

  if (!items.length) return null;

  const bandwidth = Math.max(2, (xAxis.width / items.length) * 0.6);

  return (
    <g>
      {items.map((d: any, i: number) => {
        if (!d) return null;
        const x = xAxis.scale(i) + (offset?.left ?? 0);
        const yO = yAxis.scale(d.open);
        const yC = yAxis.scale(d.close);
        const yH = yAxis.scale(d.high);
        const yL = yAxis.scale(d.low);
        const bullish = d.close >= d.open;
        const color = bullish ? "hsl(160 80% 48%)" : "hsl(0 72% 55%)";

        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={1} />
            <rect
              x={x - bandwidth / 2}
              y={Math.min(yO, yC)}
              width={bandwidth}
              height={Math.max(1, Math.abs(yC - yO))}
              fill={bullish ? color : color}
              fillOpacity={bullish ? 0.3 : 0.6}
              stroke={color}
              strokeWidth={0.5}
            />
          </g>
        );
      })}
    </g>
  );
}

// ─── Synthetic fallback candle generator ─────────────────────────
function generateSyntheticCandles(refPrice: number, stopLoss: number, takeProfit: number): Candle[] {
  const count = 30;
  const volatility = Math.abs(takeProfit - stopLoss) * 0.02;
  const data: Candle[] = [];
  let price = refPrice * 0.998;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * volatility;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    data.push({
      t: now - (count - i) * 60_000,
      open: +open.toFixed(2),
      close: +close.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
    });
    price = close;
  }
  return data;
}

export default function DecisionChart({
  symbol,
  timeframe,
  entry,
  stopLoss,
  takeProfit,
  candles: externalCandles,
  refPrice,
}: DecisionChartProps) {
  const candles = useMemo(() => {
    if (externalCandles && externalCandles.length > 0) return externalCandles;
    return generateSyntheticCandles(refPrice ?? entry, stopLoss, takeProfit);
  }, [externalCandles, refPrice, entry, stopLoss, takeProfit]);

  // Map to chart-friendly format with index for x-axis
  const chartData = useMemo(
    () =>
      candles.map((c, i) => ({
        idx: i,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        t: c.t,
      })),
    [candles]
  );

  // Compute domain
  const allPrices = [
    ...candles.flatMap((c) => [c.high, c.low]),
    entry,
    stopLoss,
    takeProfit,
  ];
  const yMin = Math.min(...allPrices) * 0.999;
  const yMax = Math.max(...allPrices) * 1.001;

  // Format time labels
  const formatTime = (idx: number) => {
    const d = chartData[idx];
    if (!d) return "";
    const date = new Date(d.t);
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="w-full h-52 bg-secondary/30 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-mono text-muted-foreground uppercase">
          {symbol} • {timeframe}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          E: ${entry.toLocaleString()} | SL: ${stopLoss.toLocaleString()} | TP: ${takeProfit.toLocaleString()}
        </span>
        {externalCandles && externalCandles.length > 0 && (
          <span className="text-[8px] font-mono text-primary/60 ml-auto">LIVE</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(220 15% 18% / 0.5)"
            vertical={false}
          />
          <XAxis
            dataKey="idx"
            tick={{ fontSize: 8, fill: "hsl(215 12% 50%)", fontFamily: "var(--font-mono)" }}
            tickFormatter={formatTime}
            interval={Math.max(1, Math.floor(chartData.length / 6))}
            axisLine={{ stroke: "hsl(220 15% 18%)" }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 9, fill: "hsl(215 12% 50%)", fontFamily: "var(--font-mono)" }}
            width={60}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toLocaleString()}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(220 18% 10%)",
              border: "1px solid hsl(220 15% 18%)",
              borderRadius: "6px",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
            }}
            labelFormatter={(idx: number) => formatTime(idx)}
            formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
          />

          {/* Candlestick bodies rendered as custom layer */}
          <Customized component={CandlesLayer} />

          {/* Entry reference line */}
          <ReferenceLine
            y={entry}
            stroke="hsl(175 80% 50%)"
            strokeWidth={1.5}
            strokeDasharray="none"
            label={{
              value: "ENTRY",
              position: "right",
              fill: "hsl(175 80% 50%)",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
            }}
          />

          {/* Stop Loss reference line */}
          <ReferenceLine
            y={stopLoss}
            stroke="hsl(0 72% 55%)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            label={{
              value: "SL",
              position: "right",
              fill: "hsl(0 72% 55%)",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
            }}
          />

          {/* Take Profit reference line */}
          <ReferenceLine
            y={takeProfit}
            stroke="hsl(160 80% 48%)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            label={{
              value: "TP",
              position: "right",
              fill: "hsl(160 80% 48%)",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
