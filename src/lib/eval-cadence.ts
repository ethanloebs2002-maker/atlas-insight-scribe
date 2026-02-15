export type EvalCadence = "1m" | "5m" | "10m" | "20m" | "1h";

export const CADENCE_MS: Record<EvalCadence, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "10m": 10 * 60_000,
  "20m": 20 * 60_000,
  "1h": 60 * 60_000,
};

export const CADENCE_OPTIONS: { value: EvalCadence; label: string }[] = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 min" },
  { value: "10m", label: "10 min" },
  { value: "20m", label: "20 min" },
  { value: "1h", label: "1 hour" },
];

export function getEvalCadence(): EvalCadence {
  if (typeof window !== "undefined" && (window as any).__ATLAS_EVAL_CADENCE) {
    const val = (window as any).__ATLAS_EVAL_CADENCE as string;
    if (val in CADENCE_MS) return val as EvalCadence;
  }
  return "5m";
}

export function setEvalCadence(cadence: EvalCadence): void {
  (window as any).__ATLAS_EVAL_CADENCE = cadence;
}
