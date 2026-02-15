import { useEffect, useRef, useState, useCallback } from "react";
import { CADENCE_MS, readEvalCadence, writeEvalCadence, type EvalCadence } from "@/lib/eval-cadence";

/**
 * Single auto-evaluation scheduler. Owns exactly ONE setInterval.
 * Clears + restarts when cadence changes. Prevents duplicate loops.
 */
export function useAutoEvaluationScheduler(
  runAutoEvaluation: () => Promise<void> | void,
  enabled: boolean = true
) {
  const intervalRef = useRef<number | null>(null);
  const runRef = useRef(runAutoEvaluation);
  runRef.current = runAutoEvaluation;

  const [cadence, setCadenceState] = useState<EvalCadence>(() => readEvalCadence());
  const [runCount, setRunCount] = useState(0);
  const [lastRunAt, setLastRunAt] = useState<string>("—");

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (c: EvalCadence) => {
      stop();
      if (!enabled) return;
      intervalRef.current = window.setInterval(async () => {
        setRunCount((n) => n + 1);
        setLastRunAt(new Date().toLocaleTimeString());
        console.log(`[ATLAS auto-eval] tick cadence=${c} at ${new Date().toISOString()}`);
        await runRef.current();
      }, CADENCE_MS[c]);
    },
    [stop, enabled]
  );

  // Restart when cadence or enabled changes
  useEffect(() => {
    if (enabled) {
      start(cadence);
    } else {
      stop();
    }
    return stop;
  }, [cadence, enabled, start, stop]);

  const setCadence = useCallback((c: EvalCadence) => {
    writeEvalCadence(c);
    setCadenceState(c);
  }, []);

  return { cadence, setCadence, runCount, lastRunAt, stop, start: () => start(cadence) };
}
