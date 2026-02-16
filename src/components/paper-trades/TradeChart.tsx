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
import type { PriceLevel, UIStatus } from "@/types/trade-vm";

export interface Candle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradeChartModel {
  candles: Candle[];
  levels: PriceLevel[];
  side: "LONG" | "SHORT";
  status: UIStatus;
}

interface TradeChartProps extends TradeChartModel {
  symbol: string;
  timeframe: string;
}

// ─── Style mapping for PriceLevel ───────────────────────────────
const LEVEL_COLORS: Record<PriceLevel["kind"], string> = {
  ENTRY: "hsl(175 80% 50%)",
  TP: "hsl(160 80% 48%)",
  SL: "hsl(0 72% 55%)",
  LIVE: "hsl(45 100% 60%)",
  EXIT: "hsl(270 60% 65%)",
};

const STYLE_DASH: Record<PriceLevel["style"], string> = {
  solid: "none",
  dashed: "6 3",
  ghost: "2 4",
};

// ─── Candlestick rendering layer ─────────────────────────────────
function CandlesLayer(props: any) {
  const { xAxisMap, yAxisMap, offset } = props;
  if (!xAxisMap || !yAxisMap) return null;
  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const items = (xAxis.categoricalDomain ?? []).map((_: any, i: number) => {
    return (props as any).formattedGraphicalItems?.[0]?.props?.data?.[i];
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
              fill={color}
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
function generateSyntheticCandles(refPrice: number, range: number): Candle[] {
  const count = 30;
  const volatility = range * 0.02;
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

export default function TradeChart({ candles: externalCandles, levels, symbol, timeframe }: TradeChartProps) {
  // Filter to levels with actual values
  const activeLevels = levels.filter((l) => l.value != null);

  const levelPrices = activeLevels.map((l) => l.value!);
  const priceRange = levelPrices.length >= 2
    ? Math.max(...levelPrices) - Math.min(...levelPrices)
    : (levelPrices[0] ?? 1000) * 0.1;
  const refPrice = levelPrices[0] ?? 1000;

  const candles = useMemo(() => {
    if (externalCandles && externalCandles.length > 0) return externalCandles;
    return generateSyntheticCandles(refPrice, priceRange);
  }, [externalCandles, refPrice, priceRange]);

  const chartData = useMemo(
    () => candles.map((c, i) => ({ idx: i, open: c.open, high: c.high, low: c.low, close: c.close, t: c.t })),
    [candles]
  );

  const allPrices = [
    ...candles.flatMap((c) => [c.high, c.low]),
    ...levelPrices,
  ];
  const yMin = Math.min(...allPrices) * 0.999;
  const yMax = Math.max(...allPrices) * 1.001;

  const formatTime = (idx: number) => {
    const d = chartData[idx];
    if (!d) return "";
    return new Date(d.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  // Build summary string from levels
  const summaryParts = activeLevels
    .filter((l) => l.kind !== "LIVE")
    .map((l) => `${l.label}: $${l.value!.toLocaleString()}`);

  return (
    <div className="w-full h-52 bg-secondary/30 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-mono text-muted-foreground uppercase">
          {symbol} • {timeframe}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground truncate">
          {summaryParts.join(" | ") || "—"}
        </span>
        {externalCandles && externalCandles.length > 0 && (
          <span className="text-[8px] font-mono text-primary/60 ml-auto">LIVE</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 18% / 0.5)" vertical={false} />
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
          <Customized component={CandlesLayer} />

          {/* Render all active levels as reference lines */}
          {activeLevels.map((level, i) => (
            <ReferenceLine
              key={`${level.kind}-${i}`}
              y={level.value!}
              stroke={LEVEL_COLORS[level.kind]}
              strokeWidth={level.kind === "LIVE" ? 1 : 1.5}
              strokeDasharray={STYLE_DASH[level.style]}
              label={{
                value: level.kind === "LIVE"
                  ? `LIVE $${level.value!.toLocaleString()}`
                  : level.label,
                position: "right",
                fill: LEVEL_COLORS[level.kind],
                fontSize: level.kind === "LIVE" ? 8 : 9,
                fontFamily: "var(--font-mono)",
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
