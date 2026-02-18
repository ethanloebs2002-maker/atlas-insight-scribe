// src/lib/cohortFilter.ts
import { COHORTS } from "@/hooks/use-cohort";
import { canShowLegacy } from "@/lib/legacyGate";

type WithCohort = { cohort_id?: string | null };

/**
 * Global standard filter: show Brain rows always, legacy only if unlocked+toggled.
 * Rows with null/unknown cohort_id are hidden by default.
 */
export function applyLegacyGate<T extends WithCohort>(
  rows: T[],
  includeLegacy: boolean,
): T[] {
  const allowLegacy = canShowLegacy(includeLegacy);

  return rows.filter((r) => {
    const c = r.cohort_id ?? null;
    if (!c) return false;
    if (c === COHORTS.brain) return true;
    if (c === COHORTS.legacy) return allowLegacy;
    return false;
  });
}
