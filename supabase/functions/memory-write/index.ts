/**
 * ATLAS Memory Write — Edge Function
 *
 * HTTP endpoint for writing memory events.
 * Validates source + phase, inserts into atlas_memory_events.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { memoryWrite, newTraceId } from "../_shared/memory.ts";
import type { MemoryEvent } from "../_shared/memory.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const events: MemoryEvent[] = Array.isArray(body.events) ? body.events : [body];

    // Auto-assign trace_id if missing
    const traceId = body.trace_id ?? newTraceId();
    for (const e of events) {
      if (!e.trace_id) e.trace_id = traceId;
    }

    const result = await memoryWrite(events);

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
