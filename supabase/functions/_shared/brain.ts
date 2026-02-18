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
 * Returns EXIT_CLOSED and LEARNING_UPDATE events for closed trade learning.
 */
export async function readMemoryForPosition(
  positionId: string,
  sb: ReturnType<typeof createClient>,
): Promise<any[]> {
  const { data } = await sb
    .from("atlas_memory_events")
    .select("id,trace_id,symbol,timeframe,phase,source,payload")
    .eq("position_id", positionId)
    .in("phase", ["EXIT_CLOSED", "ENTRY_FILLED", "DECISION_EMIT", "LEARNING_UPDATE"])
    .order("ts", { ascending: true });
  return data ?? [];
}

/**
 * Read recent closed-trade memory events (batch mode).
 * For bulk learning sweeps.
 */
export async function readRecentClosedMemory(
  limit: number,
  sb: ReturnType<typeof createClient>,
): Promise<any[]> {
  const { data } = await sb
    .from("atlas_memory_events")
    .select("id,trace_id,position_id,symbol,timeframe,phase,source,payload")
    .eq("phase", "EXIT_CLOSED")
    .eq("source", "execution")
    .order("ts", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export function newBrainTraceId(): string {
  return crypto.randomUUID();
}
