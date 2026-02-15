export type Timeframe = "15m" | "30m" | "1h" | "4h" | "1d";
export type Horizon = "4h" | "6h" | "12h" | "24h" | "72h";

const TF_TO_BASE_HORIZON: Record<Timeframe, Horizon> = {
  "15m": "4h",
  "30m": "6h",
  "1h": "12h",
  "4h": "24h",
  "1d": "72h",
};

const ORDER: Horizon[] = ["4h", "6h", "12h", "24h", "72h"];

export function routeHorizon(args: {
  timeframe: Timeframe;
  regime?: "TRENDING" | "CHOPPY" | "TRANSITIONAL";
}): Horizon {
  const base = TF_TO_BASE_HORIZON[args.timeframe];
  if (!base) return "24h"; // fallback for unknown TFs
  const idx = ORDER.indexOf(base);

  if (!args.regime) return base;

  if (args.regime === "TRENDING") return ORDER[Math.min(idx + 1, ORDER.length - 1)];
  if (args.regime === "CHOPPY") return ORDER[Math.max(idx - 1, 0)];
  return base; // TRANSITIONAL
}
