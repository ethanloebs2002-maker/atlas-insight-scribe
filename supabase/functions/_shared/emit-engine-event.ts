/**
 * ATLAS Canonical Engine Event Emitter
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE ONLY PLACE ALLOWED TO INSERT INTO paper_engine_events.
 *
 * All paper-engine and paper-engine-tick call sites must import and use
 * emitEngineEvent() — never insert into paper_engine_events directly.
 *
 * Canary: v2.0.3-canary
 *   - Hardcodes version_tag so any unstamped row proves a third emitter.
 *   - Injects payload.__emitter so we can trace exact function + build.
 *   - Coerces undefined → null to prevent silent key-drops in JSONB.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Canary constants (bump these to verify deployment) ────────────────────────
export const CANARY_VERSION_TAG = "v2.0.3-canary";

/**
 * emitEngineEvent — canonical paper_engine_events writer.
 *
 * @param sb            Supabase client (service role)
 * @param emitterTag    e.g. "paper-engine v2.0.3-canary" — identifies the fn
 * @param runId         run_id (nullable)
 * @param entityType    e.g. "POSITION", "ORDER", "DECISION", "ENGINE"
 * @param entityId      entity primary-key (nullable)
 * @param eventType     e.g. "POSITION_CLOSED"
 * @param payload       caller payload — position_id/decision_id must be included by caller for relevant events
 */
export async function emitEngineEvent(
  sb: SupabaseClient,
  emitterTag: string,
  runId: string | null,
  entityType: string,
  entityId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    // Stamp __emitter + coerce undefined → null (prevents silent JSONB key drops)
    const rawPayload = { ...payload, __emitter: emitterTag };
    const finalPayload: Record<string, unknown> = JSON.parse(
      JSON.stringify(rawPayload, (_k, v) => (v === undefined ? null : v)),
    );

    // ── CANARY DEBUG: log key presence for POSITION_CLOSED only ──────────────
    if (eventType === "POSITION_CLOSED") {
      console.log(`[CANARY ${emitterTag}] POSITION_CLOSED payload keys:`, Object.keys(finalPayload));
      console.log(
        `[CANARY ${emitterTag}] has position_id:`,
        Object.prototype.hasOwnProperty.call(finalPayload, "position_id"),
        "| has decision_id:",
        Object.prototype.hasOwnProperty.call(finalPayload, "decision_id"),
      );
      console.log(
        `[CANARY ${emitterTag}] position_id =`, finalPayload["position_id"],
        "| decision_id =", finalPayload["decision_id"],
      );
    }

    await sb.from("paper_engine_events").insert({
      run_id: runId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      version_tag: CANARY_VERSION_TAG,   // hardcoded — proves this code path ran
      ts: new Date().toISOString(),
      payload: finalPayload,
    });
  } catch (e) {
    // Non-critical telemetry — never let emit failure propagate to engine logic
    console.error(`[emitEngineEvent] FAILED to emit ${eventType}:`, (e as Error)?.message ?? e);
  }
}
