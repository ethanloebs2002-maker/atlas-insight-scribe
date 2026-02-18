// src/lib/cohortFilter.ts
import { COHORTS } from "@/hooks/use-cohort";
import { canShowLegacy } from "@/lib/legacyGate";
import { passesBrainEpoch } from "@/lib/epochGate";

type WithCohort = Record<string, unknown> & {
  cohort_id?: string | null;
  created_at?: string | null;
  ts?: string | null;
};

function rowTime(r: WithCohort): string | null {
  return (r.created_at ?? r.ts ?? null) as string | null;
}

/**
 * Global visibility gate:
 * - NULL/unknown cohorts → hidden
 * - BRAIN rows → shown only if they pass the epoch gate
 * - LEGACY rows → shown only if (unlocked AND includeLegacy toggle ON)
 */
export function applyLegacyGate<T extends WithCohort>(
  rows: T[],
  includeLegacy: boolean,
): T[] {
  const allowLegacy = canShowLegacy(includeLegacy);

  return (rows ?? []).filter((r) => {
    const c = r.cohort_id ?? null;
    if (!c) return false;

    if (c === COHORTS.brain) {
      return passesBrainEpoch(rowTime(r));
    }

    if (c === COHORTS.legacy) {
      return allowLegacy;
    }

    return false;
  });
}
