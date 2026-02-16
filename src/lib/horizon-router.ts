export type Timeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
export type Horizon = "4h" | "6h" | "12h" | "24h" | "72h";
export type Direction = "LONG" | "SHORT";
export type Regime = "TRENDING" | "CHOPPY" | "TRANSITIONAL";

/** Window range in minutes */
export interface ScenarioWindow {
  minMinutes: number;
  maxMinutes: number;
  label: string; // e.g. "4–12h"
}

// ─── Base windows per timeframe (minutes) ───────────────────────
const BASE_WINDOWS: Record<Timeframe, { min: number; max: number }> = {
  "5m":  { min: 30,   max: 90 },
  "15m": { min: 60,   max: 240 },
  "30m": { min: 120,  max: 480 },
  "1h":  { min: 240,  max: 720 },
  "4h":  { min: 720,  max: 2880 },
  "1d":  { min: 2880, max: 8640 },
};

// ─── Multipliers ────────────────────────────────────────────────
const DIRECTION_MULT: Record<Direction, number> = {
  LONG: 1.0,
  SHORT: 0.6,   // bearish moves resolve faster
};

const REGIME_MULT: Record<Regime, number> = {
  TRENDING: 1.4,      // trends persist → extend window
  CHOPPY: 0.65,       // chop resolves fast → shrink
  TRANSITIONAL: 1.0,
};

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = minutes / 60;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Compute dynamic scenario resolution window.
 *
 * window ∈ f(timeframe, direction, regime)
 *   = base_window × regime_multiplier × direction_multiplier
 */
export function routeScenarioWindow(args: {
  timeframe: string;
  direction?: Direction;
  regime?: Regime;
}): ScenarioWindow {
  const tf = args.timeframe as Timeframe;
  const base = BASE_WINDOWS[tf] ?? BASE_WINDOWS["1h"]; // fallback
  const dirMult = args.direction ? DIRECTION_MULT[args.direction] : 1.0;
  const regMult = args.regime ? REGIME_MULT[args.regime] : 1.0;

  const mult = dirMult * regMult;
  const minM = Math.round(base.min * mult);
  const maxM = Math.round(base.max * mult);

  return {
    minMinutes: minM,
    maxMinutes: maxM,
    label: `${fmtDuration(minM)}–${fmtDuration(maxM)}`,
  };
}

// ─── Legacy horizon router (kept for backward compat) ───────────
const TF_TO_BASE_HORIZON: Record<string, Horizon> = {
  "15m": "4h",
  "30m": "6h",
  "1h": "12h",
  "4h": "24h",
  "1d": "72h",
};

const ORDER: Horizon[] = ["4h", "6h", "12h", "24h", "72h"];

export function routeHorizon(args: {
  timeframe: Timeframe;
  regime?: Regime;
}): Horizon {
  const base = TF_TO_BASE_HORIZON[args.timeframe];
  if (!base) return "24h";
  const idx = ORDER.indexOf(base);

  if (!args.regime) return base;

  if (args.regime === "TRENDING") return ORDER[Math.min(idx + 1, ORDER.length - 1)];
  if (args.regime === "CHOPPY") return ORDER[Math.max(idx - 1, 0)];
  return base;
}
