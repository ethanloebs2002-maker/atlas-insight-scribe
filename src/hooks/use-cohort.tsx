import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type CohortMode = "single" | "all" | "compare";

export interface CohortState {
  cohortId: string | null; // null = "All Cohorts"
  setCohortId: (id: string | null) => void;
  mode: CohortMode;
  setMode: (m: CohortMode) => void;
  label: string;
}

const COHORTS = {
  brain: "brain_online_2026_02_17",
  legacy: "legacy_prebrain",
} as const;

export { COHORTS };

const LS_KEY = "atlas_selected_cohort_id";
const LS_MODE_KEY = "atlas_cohort_mode";

const CohortContext = createContext<CohortState | null>(null);

function resolveLabel(cohortId: string | null): string {
  if (!cohortId) return "All Cohorts";
  if (cohortId === COHORTS.brain) return "Brain Online";
  if (cohortId === COHORTS.legacy) return "Legacy (Pre-Brain)";
  return cohortId;
}

export function CohortProvider({ children }: { children: ReactNode }) {
  const [cohortId, setCohortIdRaw] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === "null" || stored === null) return COHORTS.brain;
      return stored;
    } catch {
      return COHORTS.brain;
    }
  });

  const [mode, setModeRaw] = useState<CohortMode>(() => {
    try {
      const stored = localStorage.getItem(LS_MODE_KEY);
      if (stored === "compare") return "compare";
      if (stored === "all") return "all";
      return "single";
    } catch {
      return "single";
    }
  });

  const setCohortId = (id: string | null) => {
    setCohortIdRaw(id);
    try { localStorage.setItem(LS_KEY, id ?? "null"); } catch {}
  };

  const setMode = (m: CohortMode) => {
    setModeRaw(m);
    try { localStorage.setItem(LS_MODE_KEY, m); } catch {}
    if (m === "compare") {
      setCohortId(COHORTS.brain);
    }
  };

  useEffect(() => {
    if (mode === "all") setCohortIdRaw(null);
    else if (mode === "single" && !cohortId) setCohortIdRaw(COHORTS.brain);
  }, [mode]);

  const label = mode === "compare" ? "Compare" : resolveLabel(cohortId);

  return (
    <CohortContext.Provider value={{ cohortId, setCohortId, mode, setMode, label }}>
      {children}
    </CohortContext.Provider>
  );
}

export function useCohort(): CohortState {
  const ctx = useContext(CohortContext);
  if (!ctx) throw new Error("useCohort must be used within CohortProvider");
  return ctx;
}
