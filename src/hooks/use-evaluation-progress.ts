import { useState, useCallback, useRef, useEffect } from "react";

// ─── TYPES ────────────────────────────────────────────────────────
export type EvalPhase =
  | "BOOTSTRAP"
  | "DATA_FETCH"
  | "DATA_CLEAN"
  | "INDICATORS"
  | "PATTERNS"
  | "NEWS_SIGNALS"
  | "CROSS_REFERENCE"
  | "CONSENSUS_BUILD"
  | "SCENARIO_BUILD"
  | "FINALIZE";

export type EvalStatus = "IDLE" | "EVALUATING" | "READY" | "PAUSED" | "ERROR";

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  status: "OK" | "IN_PROGRESS" | "BLOCKED";
  detail: string;
}

export interface EvaluationProgress {
  status: EvalStatus;
  progress: number; // 0..100
  etaSeconds: number | null;
  startedAt: number | null;
  updatedAt: number | null;
  phase: EvalPhase;
  phaseDetail: string;
  blockers: string[];
  checklist: ChecklistItem[];
}

// ─── MILESTONE CONFIG ─────────────────────────────────────────────
interface Milestone {
  phase: EvalPhase;
  weight: number;
  label: string;
  detail: string;
  fallbackSeconds: number;
}

const MILESTONES: Milestone[] = [
  { phase: "BOOTSTRAP",       weight: 0,  label: "Bootstrapping",        detail: "Initializing evaluation pipeline", fallbackSeconds: 1 },
  { phase: "DATA_FETCH",      weight: 20, label: "Data Fetch",           detail: "Loading price bars & market data", fallbackSeconds: 3 },
  { phase: "DATA_CLEAN",      weight: 10, label: "Data Clean",           detail: "Validating & cleaning data integrity", fallbackSeconds: 1 },
  { phase: "INDICATORS",      weight: 20, label: "Indicators",           detail: "Computing technical indicators", fallbackSeconds: 2 },
  { phase: "PATTERNS",        weight: 10, label: "Pattern Scan",         detail: "Scanning for pattern matches", fallbackSeconds: 2 },
  { phase: "NEWS_SIGNALS",    weight: 10, label: "News Signals",         detail: "Processing linked news events", fallbackSeconds: 2 },
  { phase: "CROSS_REFERENCE", weight: 10, label: "Cross-Reference",      detail: "Cross-referencing vol/whale/on-chain", fallbackSeconds: 2 },
  { phase: "CONSENSUS_BUILD", weight: 10, label: "Consensus Build",      detail: "Building multi-source consensus", fallbackSeconds: 2 },
  { phase: "SCENARIO_BUILD",  weight: 5,  label: "Scenario Build",       detail: "Constructing trade scenarios", fallbackSeconds: 1 },
  { phase: "FINALIZE",        weight: 5,  label: "Finalize",             detail: "Finalizing evaluation & updating graduation", fallbackSeconds: 1 },
];

const TOTAL_WEIGHT = MILESTONES.reduce((s, m) => s + m.weight, 0);
const TOTAL_FALLBACK = MILESTONES.reduce((s, m) => s + m.fallbackSeconds, 0);

// ─── ROLLING PHASE TIMING ─────────────────────────────────────────
interface PhaseTiming {
  samples: number[];
  avg: number;
}

const MAX_SAMPLES = 10;

function getStoredTimings(): Record<string, PhaseTiming> {
  try {
    const raw = localStorage.getItem("atlas_eval_phase_timings");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeTimings(timings: Record<string, PhaseTiming>) {
  try {
    localStorage.setItem("atlas_eval_phase_timings", JSON.stringify(timings));
  } catch { /* ignore */ }
}

function recordPhaseDuration(phase: string, durationSeconds: number) {
  const timings = getStoredTimings();
  const entry = timings[phase] || { samples: [], avg: 0 };
  entry.samples.push(durationSeconds);
  if (entry.samples.length > MAX_SAMPLES) entry.samples.shift();
  entry.avg = entry.samples.reduce((a, b) => a + b, 0) / entry.samples.length;
  timings[phase] = entry;
  storeTimings(timings);
}

function getExpectedDuration(phase: string, fallback: number): number {
  const timings = getStoredTimings();
  const entry = timings[phase];
  if (entry && entry.samples.length >= 3) return entry.avg;
  return fallback;
}

// ─── DEFAULT CHECKLIST ────────────────────────────────────────────
function buildChecklist(phaseIndex: number): ChecklistItem[] {
  const items: { key: string; label: string; phases: number[] }[] = [
    { key: "data_loaded",       label: "Data loaded",                phases: [1] },
    { key: "data_clean",        label: "Data integrity verified",    phases: [2] },
    { key: "indicators",        label: "Indicators computed",        phases: [3] },
    { key: "patterns",          label: "Pattern scan complete",      phases: [4] },
    { key: "news_signals",      label: "News signals processed",    phases: [5] },
    { key: "cross_ref",         label: "Cross-reference complete",  phases: [6] },
    { key: "consensus",         label: "Consensus computed",        phases: [7] },
    { key: "scenarios",         label: "Scenarios built",           phases: [8] },
  ];

  return items.map(item => {
    const maxPhase = Math.max(...item.phases);
    const ok = phaseIndex > maxPhase;
    const inProgress = phaseIndex === maxPhase;
    return {
      key: item.key,
      label: item.label,
      ok,
      status: ok ? "OK" as const : inProgress ? "IN_PROGRESS" as const : "BLOCKED" as const,
      detail: ok ? "Done" : inProgress ? "In progress…" : "Pending",
    };
  });
}

// ─── HOOK ─────────────────────────────────────────────────────────
const INITIAL: EvaluationProgress = {
  status: "IDLE",
  progress: 0,
  etaSeconds: null,
  startedAt: null,
  updatedAt: null,
  phase: "BOOTSTRAP",
  phaseDetail: "",
  blockers: [],
  checklist: buildChecklist(-1),
};

export function useEvaluationProgress() {
  const [state, setState] = useState<EvaluationProgress>(INITIAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseStartRef = useRef<number>(0);
  const currentPhaseRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const tick = useCallback(() => {
    setState(prev => {
      if (prev.status !== "EVALUATING") return prev;

      const now = Date.now();
      const elapsed = (now - (prev.startedAt || now)) / 1000;

      // Determine current phase based on cumulative expected durations
      let cumTime = 0;
      let phaseIndex = 0;
      for (let i = 0; i < MILESTONES.length; i++) {
        const expected = getExpectedDuration(MILESTONES[i].phase, MILESTONES[i].fallbackSeconds);
        if (elapsed < cumTime + expected) {
          phaseIndex = i;
          break;
        }
        cumTime += expected;
        if (i === MILESTONES.length - 1) phaseIndex = i;
      }

      // Track phase transitions for timing
      if (phaseIndex !== currentPhaseRef.current) {
        const prevPhase = MILESTONES[currentPhaseRef.current];
        const phaseDuration = (now - phaseStartRef.current) / 1000;
        if (prevPhase && phaseDuration > 0) {
          recordPhaseDuration(prevPhase.phase, phaseDuration);
        }
        currentPhaseRef.current = phaseIndex;
        phaseStartRef.current = now;
      }

      // Compute progress (completed phases + partial current)
      let completedWeight = 0;
      for (let i = 0; i < phaseIndex; i++) {
        completedWeight += MILESTONES[i].weight;
      }
      const currentMilestone = MILESTONES[phaseIndex];
      const phaseExpected = getExpectedDuration(currentMilestone.phase, currentMilestone.fallbackSeconds);
      const phaseElapsed = (now - phaseStartRef.current) / 1000;
      const phasePartial = Math.min(1, phaseElapsed / Math.max(0.1, phaseExpected));
      completedWeight += currentMilestone.weight * phasePartial;
      const progress = Math.min(95, Math.round((completedWeight / TOTAL_WEIGHT) * 100));

      // Compute ETA
      let remainingSeconds = 0;
      // Remaining of current phase
      remainingSeconds += Math.max(0, phaseExpected - phaseElapsed);
      // Future phases
      for (let i = phaseIndex + 1; i < MILESTONES.length; i++) {
        remainingSeconds += getExpectedDuration(MILESTONES[i].phase, MILESTONES[i].fallbackSeconds);
      }
      const etaSeconds = Math.round(remainingSeconds);

      // Blockers
      const blockers: string[] = [];
      if (elapsed > 30 && progress < 50) {
        blockers.push("Evaluation taking longer than expected");
      }

      return {
        ...prev,
        progress,
        etaSeconds: etaSeconds > 0 ? etaSeconds : null,
        updatedAt: now,
        phase: currentMilestone.phase,
        phaseDetail: currentMilestone.detail,
        blockers,
        checklist: buildChecklist(phaseIndex),
      };
    });
  }, []);

  const start = useCallback(() => {
    cleanup();
    const now = Date.now();
    currentPhaseRef.current = 0;
    phaseStartRef.current = now;
    setState({
      status: "EVALUATING",
      progress: 0,
      etaSeconds: Math.round(MILESTONES.reduce((s, m) => s + getExpectedDuration(m.phase, m.fallbackSeconds), 0)),
      startedAt: now,
      updatedAt: now,
      phase: "BOOTSTRAP",
      phaseDetail: MILESTONES[0].detail,
      blockers: [],
      checklist: buildChecklist(0),
    });
    intervalRef.current = setInterval(tick, 250);
  }, [cleanup, tick]);

  const complete = useCallback(() => {
    cleanup();
    // Record final phase timing
    const lastPhase = MILESTONES[currentPhaseRef.current];
    if (lastPhase) {
      const dur = (Date.now() - phaseStartRef.current) / 1000;
      if (dur > 0) recordPhaseDuration(lastPhase.phase, dur);
    }
    setState(prev => ({
      ...prev,
      status: "READY",
      progress: 100,
      etaSeconds: 0,
      phase: "FINALIZE",
      phaseDetail: "Evaluation complete",
      updatedAt: Date.now(),
      blockers: [],
      checklist: buildChecklist(MILESTONES.length),
    }));
    // Reset to IDLE after a brief display
    setTimeout(() => setState(INITIAL), 4000);
  }, [cleanup]);

  const error = useCallback((message?: string) => {
    cleanup();
    setState(prev => ({
      ...prev,
      status: "ERROR",
      etaSeconds: null,
      updatedAt: Date.now(),
      blockers: [message || "Evaluation failed. Please retry."],
    }));
    setTimeout(() => setState(INITIAL), 6000);
  }, [cleanup]);

  return { state, start, complete, error };
}
