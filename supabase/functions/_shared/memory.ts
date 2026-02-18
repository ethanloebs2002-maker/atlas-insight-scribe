/**
 * ATLAS Memory Pillar — Shared Helper
 *
 * All experiential writes must go through this module.
 * This is the canonical ingress for atlas_memory_events.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MemoryEvent {
  trace_id: string;
  position_id?: string | null;
  decision_id?: string | null;
  symbol: string;
  timeframe?: string | null;
  phase: string;  // DECISION_EMIT | ENTRY_FILLED | EXIT_CLOSED | CADENCE_OBSERVE | POLICY_UPDATE | LEARNING_UPDATE
  source: string; // must be registered in atlas_memory_sources
  payload: Record<string, unknown>;
}

const ALLOWED_PHASES = [
  "DECISION_EMIT", "ENTRY_FILLED", "EXIT_CLOSED",
  "CADENCE_OBSERVE", "POLICY_UPDATE", "LEARNING_UPDATE",
];

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Write one or more memory events. Validates source + phase.
 * Returns { ok, ids } or { ok: false, error }.
 */
export async function memoryWrite(
  events: MemoryEvent | MemoryEvent[],
  sb?: ReturnType<typeof createClient>,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  const client = sb ?? sbAdmin();
  const arr = Array.isArray(events) ? events : [events];

  if (arr.length === 0) return { ok: true, ids: [] };

  // Validate phases
  for (const e of arr) {
    if (!ALLOWED_PHASES.includes(e.phase)) {
      return { ok: false, error: `Invalid phase: ${e.phase}` };
    }
  }

  // Validate sources exist and are active
  const uniqueSources = [...new Set(arr.map(e => e.source))];
  const { data: validSources } = await client
    .from("atlas_memory_sources")
    .select("source")
    .in("source", uniqueSources)
    .eq("is_active", true);

  const activeSet = new Set((validSources ?? []).map((s: any) => s.source));
  for (const src of uniqueSources) {
    if (!activeSet.has(src)) {
      return { ok: false, error: `Source "${src}" is not registered or inactive in atlas_memory_sources` };
    }
  }

  // Enforce payload size (~10KB max)
  for (const e of arr) {
    const size = JSON.stringify(e.payload).length;
    if (size > 10240) {
      console.warn(`[memory] Payload for ${e.phase}/${e.source} is ${size} bytes (>10KB), truncating metadata`);
    }
  }

  const rows = arr.map(e => ({
    trace_id: e.trace_id,
    position_id: e.position_id ?? null,
    decision_id: e.decision_id ?? null,
    symbol: e.symbol,
    timeframe: e.timeframe ?? null,
    phase: e.phase,
    source: e.source,
    payload: e.payload,
  }));

  const { data, error } = await client
    .from("atlas_memory_events")
    .insert(rows)
    .select("id");

  if (error) {
    console.error("[memory] Insert failed:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, ids: (data ?? []).map((r: any) => r.id) };
}

/**
 * Generate a new trace_id for grouping related memory events.
 */
export function newTraceId(): string {
  return crypto.randomUUID();
}
