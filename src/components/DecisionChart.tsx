import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  Line,
} from "recharts";

interface DecisionChartProps {
  symbol: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  refPrice: number;
}

export default function DecisionChart({
  symbol,
  timeframe,
  entry,
  stopLoss,
  takeProfit,
  refPrice,
}: DecisionChartProps) {
  // Generate synthetic candle data around the ref price for visualization
  const candles = useMemo(() => {
    const count = 30;
    const volatility = Math.abs(takeProfit - stopLoss) * 0.02;
    const data: { time: string; open: number; close: number; high: number; low: number }[] = [];
    let price = refPrice * 0.998;

    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.48) * volatility;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * volatility * 0.5;
      const low = Math.min(open, close) - Math.random() * volatility * 0.5;
      data.push({
        time: `${i + 1}`,
        open: +open.toFixed(2),
        close: +close.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
      });
      price = close;
    }
    return data;
  }, [refPrice, stopLoss, takeProfit]);

  // Compute domain
  const allPrices = [
    ...candles.flatMap((c) => [c.high, c.low]),
    entry,
    stopLoss,
    takeProfit,
  ];
  const yMin = Math.min(...allPrices) * 0.999;
  const yMax = Math.max(...allPrices) * 1.001;

  return (
    <div className="w-full h-48 bg-secondary/30 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-mono text-muted-foreground uppercase">
          {symbol} • {timeframe}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          E: ${entry.toLocaleString()} | SL: ${stopLoss.toLocaleString()} | TP: ${takeProfit.toLocaleString()}
        </span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={candles} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(220 15% 18% / 0.5)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={false}
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
            labelFormatter={() => ""}
            formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
          />

          {/* Price line */}
          <Line
            type="monotone"
            dataKey="close"
            stroke="hsl(175 80% 50%)"
            strokeWidth={1.5}
            dot={false}
            name="Price"
          />

          {/* High/Low as thin bars for wick effect */}
          <Bar dataKey="high" fill="transparent" />

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
