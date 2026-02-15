export type EvalCadence = "1m" | "5m" | "10m" | "20m" | "1h";

const VALID_CADENCES: readonly EvalCadence[] = ["1m", "5m", "10m", "20m", "1h"] as const;

export const CADENCE_MS: Record<EvalCadence, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "10m": 600_000,
  "20m": 1_200_000,
  "1h": 3_600_000,
};

export const CADENCE_OPTIONS: { value: EvalCadence; label: string }[] = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 min" },
  { value: "10m", label: "10 min" },
  { value: "20m", label: "20 min" },
  { value: "1h", label: "1 hour" },
];

const CADENCE_KEY = "ATLAS_EVAL_CADENCE";

export function readEvalCadence(): EvalCadence {
  try {
    const raw = (localStorage.getItem(CADENCE_KEY) || "5m").trim() as EvalCadence;
    return VALID_CADENCES.includes(raw) ? raw : "5m";
  } catch {
    return "5m";
  }
}

export function writeEvalCadence(v: EvalCadence): void {
  try {
    localStorage.setItem(CADENCE_KEY, v);
  } catch {
    // storage unavailable
  }
}

// Legacy compat — kept for any remaining callers but localStorage is source of truth
export const getEvalCadence = readEvalCadence;
export const setEvalCadence = writeEvalCadence;
