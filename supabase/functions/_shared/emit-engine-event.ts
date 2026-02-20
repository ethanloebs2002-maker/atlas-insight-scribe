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

// ── Canary constants (bump these to verify deployment) ────────────────────────
export const CANARY_VERSION_TAG = "v2.0.4-canary";

/**
 * emitEngineEvent — canonical paper_engine_events writer.
 *
 * @param sb            Supabase client (service role)
 * @param emitterTag    e.g. "paper-engine v2.0.4-canary" — identifies the fn
 * @param runId         run_id (nullable)
 * @param entityType    e.g. "POSITION", "ORDER", "DECISION", "ENGINE"
 * @param entityId      entity primary-key (nullable)
 * @param eventType     e.g. "POSITION_CLOSED"
 * @param payload       caller payload
 */
export async function emitEngineEvent(
  sb: any,
  emitterTag: string,
  runId: string | null,
  entityType: string,
  entityId: string | null,
  eventType: string,
  payload: Record<string, any> = {},
): Promise<void> {
  try {
    // Stamp + coerce undefined → null (prevents silent JSONB key drops)
    const rawPayload = { ...payload, __emitter: emitterTag };
    const finalPayload: Record<string, any> = JSON.parse(
      JSON.stringify(rawPayload, (_k, v) => (v === undefined ? null : v)),
    );

    // ─────────────────────────────────────────────────────────────
    // Canonical ID stamping (telemetry-only)
    // Goal: event payload ALWAYS carries decision_id / position_id when inferable
    // ─────────────────────────────────────────────────────────────

    const hasKey = (k: string) => Object.prototype.hasOwnProperty.call(finalPayload, k);

    // 1) DECISION_* events: decision_id should be entity_id
    if (entityType === "DECISION" && entityId && !hasKey("decision_id")) {
      finalPayload.decision_id = entityId;
    }

    // 2) POSITION_* events: position_id should be entity_id
    if (entityType === "POSITION" && entityId && !hasKey("position_id")) {
      finalPayload.position_id = entityId;
    }

    // 3) ORDER_* events: try to infer position_id from paper_orders.position_id
    //    (entityId is the order id in paper_orders)
    if (entityType === "ORDER" && entityId && !hasKey("position_id")) {
      const { data: ord, error: ordErr } = await sb
        .from("paper_orders")
        .select("position_id")
        .eq("id", entityId)
        .maybeSingle();

      if (!ordErr && ord?.position_id) {
        finalPayload.position_id = ord.position_id;
      }
    }

    // 4) If we have a position_id but no decision_id, infer via paper_positions.decision_id
    if (hasKey("position_id") && finalPayload.position_id && !hasKey("decision_id")) {
      const { data: pos, error: posErr } = await sb
        .from("paper_positions")
        .select("decision_id")
        .eq("id", finalPayload.position_id)
        .maybeSingle();

      if (!posErr && pos?.decision_id) {
        finalPayload.decision_id = pos.decision_id;
      }
    }

    // (Optional) If we have decision_id but no position_id for POSITION events, we don't backfill the reverse.
    // Reverse lookup is ambiguous / expensive without an index; keep it one-way.

    // ── CANARY DEBUG: log for key event types only (safe, low volume) ─────────
    if (
      eventType === "POSITION_CLOSED" ||
      eventType === "ORDER_PLACED" ||
      eventType === "POSITION_CREATED" ||
      eventType === "DECISION_EMITTED"
    ) {
      console.log(
        `[CANARY ${emitterTag}] ${eventType} keys:`,
        Object.keys(finalPayload),
        "| position_id:",
        finalPayload.position_id ?? null,
        "| decision_id:",
        finalPayload.decision_id ?? null,
      );
    }

    await sb.from("paper_engine_events").insert({
      run_id: runId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      version_tag: "v2.0.4-canary", // bump so we can verify this exact patch
      ts: new Date().toISOString(),
      payload: finalPayload,
    });
  } catch (e) {
    // Non-critical telemetry — never let emit failure propagate to engine logic
    console.error(
      `[emitEngineEvent] FAILED to emit ${eventType}:`,
      (e as Error)?.message ?? e,
    );
  }
}
