/**
 * ATLAS Memory Fan-Out — Unified Experiential Store
 *
 * Ensures every registered Memory source emits a fingerprint
 * at each lifecycle choke point. No silent gaps.
 *
 * BACKBONE SAFE — This file MUST NOT call fetch() to external URLs.
 * All data comes from canonical DB tables only.
 *
 * MEMORY SAFE — reads only, never writes raw data.
 * All writes go through memoryWrite().
 *
 * Usage:
 *   import { memoryFanOut } from "../_shared/memory_fanout.ts";
 *   await memoryFanOut(sb, phase, traceId, common, knownEvents);
 *
 * knownEvents = sources that have real data (status: OK)
 * All other registered sources get a MISSING event automatically.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { memoryWrite, type MemoryEvent } from "./memory.ts";

/** All 10 registered sources */
const ALL_SOURCES = [
  "consensus", "market", "orderbook", "derivatives",
  "execution", "risk_lab", "policy", "whale", "news", "strategy",
];

/** Max payload sizes */
const MAX_OK_BYTES = 5120;
const MAX_ABSENT_BYTES = 512;

export type MemoryStatus = "OK" | "MISSING" | "FAILED";

export interface SourceEvent {
  source: string;
  status: MemoryStatus;
  data?: Record<string, unknown>;
  reason?: string;
}

interface FanOutCommon {
  position_id?: string | null;
  decision_id?: string | null;
  symbol: string;
  timeframe?: string | null;
}

/**
 * Truncate payload to size cap.
 * OK events → 5KB, MISSING/FAILED → 512B
 */
function capPayload(payload: Record<string, unknown>, status: MemoryStatus): Record<string, unknown> {
  const limit = status === "OK" ? MAX_OK_BYTES : MAX_ABSENT_BYTES;
  const json = JSON.stringify(payload);
  if (json.length <= limit) return payload;

  // For OK events, keep status + truncated flag + first few keys
  if (status === "OK") {
    return { status: "OK", _truncated: true, _original_size: json.length };
  }
  // For MISSING/FAILED, keep status + reason only
  return { status, reason: String(payload.reason ?? "payload truncated").slice(0, 200) };
}

/**
 * Fan out Memory events for ALL registered sources at a lifecycle choke point.
 *
 * BACKBONE SAFE: This function does NOT call fetch() to any external URL.
 * All source data must be provided by the caller (who reads from canonical DB tables).
 *
 * @param sb       - Supabase admin client
 * @param phase    - DECISION_EMIT | ENTRY_FILLED | EXIT_CLOSED
 * @param traceId  - shared trace_id for this lifecycle moment
 * @param common   - shared fields (position_id, decision_id, symbol, timeframe)
 * @param known    - array of source events with real data or explicit failures
 *
 * Sources not present in `known` get an automatic MISSING event.
 */
export async function memoryFanOut(
  sb: ReturnType<typeof createClient>,
  phase: string,
  traceId: string,
  common: FanOutCommon,
  known: SourceEvent[],
): Promise<{ ok: boolean; written: number; error?: string }> {
  const knownMap = new Map<string, SourceEvent>();
  for (const k of known) {
    knownMap.set(k.source, k);
  }

  const events: MemoryEvent[] = [];

  for (const source of ALL_SOURCES) {
    const k = knownMap.get(source);
    if (k) {
      const rawPayload: Record<string, unknown> = {
        status: k.status,
        ...(k.data ? { data: k.data } : {}),
        ...(k.reason ? { reason: k.reason } : {}),
      };
      events.push({
        trace_id: traceId,
        position_id: common.position_id ?? null,
        decision_id: common.decision_id ?? null,
        symbol: common.symbol,
        timeframe: common.timeframe ?? null,
        phase,
        source,
        payload: capPayload(rawPayload, k.status),
      });
    } else {
      // Automatic MISSING for unrepresented sources
      events.push({
        trace_id: traceId,
        position_id: common.position_id ?? null,
        decision_id: common.decision_id ?? null,
        symbol: common.symbol,
        timeframe: common.timeframe ?? null,
        phase,
        source,
        payload: {
          status: "MISSING" as const,
          reason: `${source} not available at ${phase}`,
        },
      });
    }
  }

  const result = await memoryWrite(events, sb);
  return { ok: result.ok, written: events.length, error: result.error };
}
