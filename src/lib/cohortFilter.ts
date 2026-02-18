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

/**
 * Exclude rows flagged as legacy_oversized or is_test_trade in meta.
 * Apply AFTER applyLegacyGate for a fully coherent dataset.
 */
export function excludeMetaRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter((r) => {
    const m = (r as any)?.meta ?? {};
    const legacy = m?.legacy_oversized === true || m?.legacy_oversized === "true";
    const test = m?.is_test_trade === true || m?.is_test_trade === "true";
    return !legacy && !test;
  });
}
