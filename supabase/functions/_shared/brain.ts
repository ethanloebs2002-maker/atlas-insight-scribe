/**
 * ATLAS Brain Pillar — Shared Helper
 *
 * The Brain reads ONLY from atlas_memory_events.
 * It writes belief updates to reputation/policy tables
 * and logs every update to atlas_brain_log for full provenance.
 *
 * The Brain does NOT act — it advises.
 * ❌ No trade placement
 * ❌ No price fetching
 * ❌ No execution
 * ❌ No Memory mutation
 *
 * COLOSSAL PATCH: cohort-aware readers + DEFAULT_BRAIN_COHORT guard.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BrainLogEntry {
  trace_id: string;
  target_table: string;
  target_key: string;
  symbol?: string | null;
  update_type: string;
  prior_state: Record<string, unknown>;
  posterior_state: Record<string, unknown>;
  memory_event_ids: string[];
  source_function: string;
  notes?: string | null;
}

const ALLOWED_UPDATE_TYPES = [
  "BAYESIAN_UPDATE",
  "EMA_UPDATE",
  "REPUTATION_BLEND",
  "CONFIDENCE_RECAL",
  "POLICY_TUNE",
  "GRADUATION_CHECK",
];

const DEFAULT_BRAIN_COHORT = Deno.env.get("BRAIN_DEFAULT_COHORT") ?? "brain_online_2026_02_17";

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Log a brain update to atlas_brain_log for full provenance.
 * Every belief change MUST be logged through this function.
 */
export async function brainLog(
  entries: BrainLogEntry | BrainLogEntry[],
  sb?: ReturnType<typeof createClient>,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  const client = sb ?? sbAdmin();
  const arr = Array.isArray(entries) ? entries : [entries];

  if (arr.length === 0) return { ok: true, ids: [] };

  for (const e of arr) {
    if (!ALLOWED_UPDATE_TYPES.includes(e.update_type)) {
      return { ok: false, error: `Invalid update_type: ${e.update_type}` };
    }
  }

  const rows = arr.map(e => ({
    trace_id: e.trace_id,
    target_table: e.target_table,
    target_key: e.target_key,
    symbol: e.symbol ?? null,
    update_type: e.update_type,
    prior_state: e.prior_state,
    posterior_state: e.posterior_state,
    memory_event_ids: e.memory_event_ids,
    source_function: e.source_function,
    notes: e.notes ?? null,
  }));

  const { data, error } = await client
    .from("atlas_brain_log")
    .insert(rows)
    .select("id");

  if (error) {
    console.error("[brain] Log insert failed:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, ids: (data ?? []).map((r: any) => r.id) };
}

/**
 * Read memory events for a given position (the Brain's ONLY data source).
 * Now cohort-aware: defaults to DEFAULT_BRAIN_COHORT to prevent legacy contamination.
 * Pass cohortId=null explicitly to read all cohorts.
 */
export async function readMemoryForPosition(
  positionId: string,
  sb: ReturnType<typeof createClient>,
  cohortId?: string | null,
): Promise<any[]> {
  const cohort = cohortId === undefined ? DEFAULT_BRAIN_COHORT : cohortId;

  let q = sb
    .from("atlas_memory_events")
    .select("id,trace_id,symbol,timeframe,phase,source,payload,decision_id,position_id,cohort_id,ts")
    .eq("position_id", positionId)
    .in("phase", ["EXIT_CLOSED", "ENTRY_FILLED", "DECISION_EMIT", "LEARNING_UPDATE"])
    .order("ts", { ascending: true });

  if (cohort) q = q.eq("cohort_id", cohort);

  const { data } = await q;
  return data ?? [];
}

/**
 * Read recent closed-trade memory events (batch mode).
 * Now cohort-aware: defaults to DEFAULT_BRAIN_COHORT.
 * Pass cohortId=null explicitly to read all cohorts.
 */
export async function readRecentClosedMemory(
  limit: number,
  sb: ReturnType<typeof createClient>,
  cohortId?: string | null,
): Promise<any[]> {
  const cohort = cohortId === undefined ? DEFAULT_BRAIN_COHORT : cohortId;

  let q = sb
    .from("atlas_memory_events")
    .select("id,trace_id,position_id,symbol,timeframe,phase,source,payload,cohort_id,ts")
    .eq("phase", "EXIT_CLOSED")
    .eq("source", "execution")
    .order("ts", { ascending: false })
    .limit(limit);

  if (cohort) q = q.eq("cohort_id", cohort);

  const { data } = await q;
  return data ?? [];
}

/**
 * Batch load Memory bundles for multiple positions in a single query.
 * Eliminates N+1 problem in brain-update batch mode.
 * Now cohort-aware.
 *
 * Returns a Map: position_id → { bundle, allIds, events }
 * where bundle is keyed by "PHASE:source".
 */
export async function loadMemoryBundleBatch(
  positionIds: string[],
  sb: ReturnType<typeof createClient>,
  cohortId?: string | null,
): Promise<Map<string, { bundle: Record<string, any>; allIds: string[]; events: any[] }>> {
  const result = new Map<string, { bundle: Record<string, any>; allIds: string[]; events: any[] }>();

  if (positionIds.length === 0) return result;

  const cohort = cohortId === undefined ? DEFAULT_BRAIN_COHORT : cohortId;

  // Step 1: Load ENTRY_FILLED + EXIT_CLOSED by position_id
  let posQ = sb
    .from("atlas_memory_events")
    .select("id,trace_id,position_id,decision_id,symbol,timeframe,phase,source,payload,cohort_id")
    .in("position_id", positionIds)
    .in("phase", ["ENTRY_FILLED", "EXIT_CLOSED"])
    .order("ts", { ascending: true });

  if (cohort) posQ = posQ.eq("cohort_id", cohort);

  const { data: posEvents, error: posErr } = await posQ;

  if (posErr) {
    console.error("[brain] Batch memory load (pos) failed:", posErr.message);
    return result;
  }

  const allPosEvents = posEvents ?? [];

  // Collect decision_ids so we can fetch DECISION_EMIT (which has position_id=NULL)
  const decisionIds = [...new Set(
    allPosEvents.map(e => e.decision_id).filter(Boolean),
  )];

  let decisionEvents: any[] = [];
  if (decisionIds.length > 0) {
    let decQ = sb
      .from("atlas_memory_events")
      .select("id,trace_id,position_id,decision_id,symbol,timeframe,phase,source,payload,cohort_id")
      .in("decision_id", decisionIds)
      .eq("phase", "DECISION_EMIT")
      .order("ts", { ascending: true });

    if (cohort) decQ = decQ.eq("cohort_id", cohort);

    const { data: decData, error: decErr } = await decQ;

    if (decErr) {
      console.error("[brain] Batch memory load (dec) failed:", decErr.message);
    } else {
      decisionEvents = decData ?? [];
    }
  }

  // Build decision_id → position_id(s) mapping
  const decToPos = new Map<string, string[]>();
  for (const ev of allPosEvents) {
    if (!ev.decision_id || !ev.position_id) continue;
    const arr = decToPos.get(ev.decision_id) ?? [];
    if (!arr.includes(ev.position_id)) arr.push(ev.position_id);
    decToPos.set(ev.decision_id, arr);
  }

  // Merge all events, grouping by position_id
  const grouped = new Map<string, any[]>();
  for (const ev of allPosEvents) {
    if (!ev.position_id) continue;
    const arr = grouped.get(ev.position_id) ?? [];
    arr.push(ev);
    grouped.set(ev.position_id, arr);
  }

  // Attach DECISION_EMIT events to their position(s) via decision_id
  for (const ev of decisionEvents) {
    const pids = decToPos.get(ev.decision_id) ?? [];
    for (const pid of pids) {
      const arr = grouped.get(pid) ?? [];
      arr.push(ev);
      grouped.set(pid, arr);
    }
  }

  // Build bundles
  for (const [pid, evs] of grouped) {
    const bundle: Record<string, any> = {};
    const allIds: string[] = [];
    for (const ev of evs) {
      const key = `${ev.phase}:${ev.source}`;
      bundle[key] = ev;
      allIds.push(ev.id);
    }
    result.set(pid, { bundle, allIds, events: evs });
  }

  return result;
}

export function newBrainTraceId(): string {
  return crypto.randomUUID();
}
