import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";

export type CohortMode = "single" | "all";

export interface CohortState {
  cohortId: string | null;
  setCohortId: (id: string | null) => void;
  mode: CohortMode;
  setMode: (m: CohortMode) => void;
  includeLegacy: boolean;
  setIncludeLegacy: (v: boolean) => void;
  label: string;
}

export const COHORTS = {
  brain: "brain_online_2026_02_17",
  legacy: "legacy_prebrain",
} as const;

const LS_KEY = "atlas_selected_cohort_id";
const LS_MODE_KEY = "atlas_cohort_mode";
const LS_LEGACY_KEY = "atlas_include_legacy_metrics";

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
      if (stored === null || stored === "null") return COHORTS.brain;
      return stored;
    } catch {
      return COHORTS.brain;
    }
  });

  const [mode, setModeRaw] = useState<CohortMode>(() => {
    try {
      const stored = localStorage.getItem(LS_MODE_KEY);
      if (stored === "all") return "all";
      return "single";
    } catch {
      return "single";
    }
  });

  const [includeLegacy, setIncludeLegacyRaw] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_LEGACY_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setCohortId = (id: string | null) => {
    setCohortIdRaw(id);
    try { localStorage.setItem(LS_KEY, id ?? "null"); } catch {}
  };

  const setMode = (m: CohortMode) => {
    setModeRaw(m);
    try { localStorage.setItem(LS_MODE_KEY, m); } catch {}
  };

  const setIncludeLegacy = (v: boolean) => {
    setIncludeLegacyRaw(v);
    try { localStorage.setItem(LS_LEGACY_KEY, String(v)); } catch {}
  };

  // Mode enforcement
  useEffect(() => {
    if (mode === "all") {
      setCohortIdRaw(null);
    } else if (!cohortId) {
      setCohortIdRaw(COHORTS.brain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Auto-disable includeLegacy when not on Brain cohort
  useEffect(() => {
    if (cohortId !== COHORTS.brain && includeLegacy) {
      setIncludeLegacy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  const label = useMemo(() => {
    if (includeLegacy && cohortId === COHORTS.brain) return "Brain + Legacy";
    return resolveLabel(cohortId);
  }, [cohortId, includeLegacy]);

  return (
    <CohortContext.Provider value={{ cohortId, setCohortId, mode, setMode, includeLegacy, setIncludeLegacy, label }}>
      {children}
    </CohortContext.Provider>
  );
}

export function useCohort(): CohortState {
  const ctx = useContext(CohortContext);
  if (!ctx) throw new Error("useCohort must be used within CohortProvider");
  return ctx;
}
