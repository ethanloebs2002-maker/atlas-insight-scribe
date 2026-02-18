/**
 * ATLAS Memory Bundle Contract — Shared Loader
 *
 * CONTRACT:
 * - DECISION_EMIT happens before a position exists → position_id = NULL
 * - ENTRY_FILLED / EXIT_CLOSED happen after → position_id != NULL
 * - The join key across phases is decision_id
 * - Therefore: Brain cannot build bundles by position_id alone.
 *   It must union:
 *     • ENTRY_FILLED + EXIT_CLOSED by position_id
 *     • DECISION_EMIT by decision_id extracted from those position events
 *
 * BACKBONE SAFE — no external fetches.
 * MEMORY SAFE — reads only, never writes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SB = ReturnType<typeof createClient>;

const FIELDS =
  "id,ts,created_at,trace_id,position_id,decision_id,cohort_id,symbol,timeframe,phase,source,payload";

export type MemoryEventRow = {
  id: string;
  ts?: string;
  created_at?: string;
  trace_id: string | null;
  position_id: string | null;
  decision_id: string | null;
  cohort_id?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  phase: "DECISION_EMIT" | "ENTRY_FILLED" | "EXIT_CLOSED" | string;
  source: string;
  payload: any;
};

export type MemoryBundle = {
  bundle: Record<string, MemoryEventRow>; // key = `${phase}:${source}`
  allIds: string[];
  events: MemoryEventRow[];
  decisionId: string | null;
  traceId: string | null;
};

function keyOf(ev: MemoryEventRow) {
  return `${ev.phase}:${ev.source}`;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Load a complete Memory bundle for a single position.
 * Joins ENTRY_FILLED/EXIT_CLOSED (by position_id) with
 * DECISION_EMIT (by decision_id).
 */
export async function loadCompleteBundleForPosition(
  sb: SB,
  positionId: string,
): Promise<MemoryBundle> {
  // 1) Load position-linked events
  const { data: posData, error: posErr } = await sb
    .from("atlas_memory_events")
    .select(FIELDS)
    .eq("position_id", positionId)
    .in("phase", ["ENTRY_FILLED", "EXIT_CLOSED"])
    .order("ts", { ascending: true });

  if (posErr) {
    throw new Error(`[brain][bundle] position load failed: ${posErr.message}`);
  }

  const posEvents = (posData ?? []) as MemoryEventRow[];
  const decisionId = posEvents.find(e => e.decision_id)?.decision_id ?? null;
  const traceId = posEvents.find(e => e.trace_id)?.trace_id ?? null;

  // 2) Load decision-linked events (DECISION_EMIT only)
  let decEvents: MemoryEventRow[] = [];
  if (decisionId) {
    const { data: decData, error: decErr } = await sb
      .from("atlas_memory_events")
      .select(FIELDS)
      .eq("decision_id", decisionId)
      .eq("phase", "DECISION_EMIT")
      .order("ts", { ascending: true });

    if (decErr) {
      throw new Error(`[brain][bundle] decision load failed: ${decErr.message}`);
    }
    decEvents = (decData ?? []) as MemoryEventRow[];
  }

  const events = [...posEvents, ...decEvents];

  const bundle: Record<string, MemoryEventRow> = {};
  const allIds: string[] = [];
  for (const ev of events) {
    bundle[keyOf(ev)] = ev;
    allIds.push(ev.id);
  }

  return { bundle, allIds, events, decisionId, traceId };
}

/**
 * Load complete Memory bundles for multiple positions in a single batch.
 * Eliminates N+1 problem while respecting the position→decision join contract.
 */
export async function loadCompleteBundleBatch(
  sb: SB,
  positionIds: string[],
): Promise<Map<string, MemoryBundle>> {
  const result = new Map<string, MemoryBundle>();
  if (positionIds.length === 0) return result;

  // 1) Load position-linked events for all positions
  const { data: posData, error: posErr } = await sb
    .from("atlas_memory_events")
    .select(FIELDS)
    .in("position_id", positionIds)
    .in("phase", ["ENTRY_FILLED", "EXIT_CLOSED"])
    .order("ts", { ascending: true });

  if (posErr) {
    throw new Error(`[brain][bundle] batch position load failed: ${posErr.message}`);
  }

  const posEvents = (posData ?? []) as MemoryEventRow[];

  // Collect decision_ids from position events
  const decisionIds = uniq(
    posEvents.map(e => e.decision_id).filter(Boolean),
  ) as string[];

  // 2) Load DECISION_EMIT for those decision_ids
  let decEvents: MemoryEventRow[] = [];
  if (decisionIds.length > 0) {
    const { data: decData, error: decErr } = await sb
      .from("atlas_memory_events")
      .select(FIELDS)
      .in("decision_id", decisionIds)
      .eq("phase", "DECISION_EMIT")
      .order("ts", { ascending: true });

    if (decErr) {
      throw new Error(`[brain][bundle] batch decision load failed: ${decErr.message}`);
    }
    decEvents = (decData ?? []) as MemoryEventRow[];
  }

  // Map decision_id → position_ids
  const decToPos = new Map<string, string[]>();
  for (const ev of posEvents) {
    if (!ev.decision_id || !ev.position_id) continue;
    const arr = decToPos.get(ev.decision_id) ?? [];
    if (!arr.includes(ev.position_id)) arr.push(ev.position_id);
    decToPos.set(ev.decision_id, arr);
  }

  // Group pos events by position_id
  const grouped = new Map<string, MemoryEventRow[]>();
  for (const ev of posEvents) {
    if (!ev.position_id) continue;
    const arr = grouped.get(ev.position_id) ?? [];
    arr.push(ev);
    grouped.set(ev.position_id, arr);
  }

  // Attach DECISION_EMIT events to positions via decision_id
  for (const ev of decEvents) {
    const pids = decToPos.get(ev.decision_id ?? "") ?? [];
    for (const pid of pids) {
      const arr = grouped.get(pid) ?? [];
      arr.push(ev);
      grouped.set(pid, arr);
    }
  }

  // Build bundles
  for (const [pid, evs] of grouped) {
    const bundle: Record<string, MemoryEventRow> = {};
    const allIds: string[] = [];
    for (const ev of evs) {
      bundle[keyOf(ev)] = ev;
      allIds.push(ev.id);
    }

    const decisionId = evs.find(e => e.decision_id)?.decision_id ?? null;
    const traceId = evs.find(e => e.trace_id)?.trace_id ?? null;

    result.set(pid, { bundle, allIds, events: evs, decisionId, traceId });
  }

  return result;
}
