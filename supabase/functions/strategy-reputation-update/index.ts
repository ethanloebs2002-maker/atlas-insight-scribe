/**
 * ATLAS Strategy Reputation Update (BRAIN-COMPLIANT)
 *
 * Reads from atlas_memory_events (Memory pillar) — NOT from paper_positions.
 * Logs all updates to atlas_brain_log for provenance.
 *
 * BACKBONE SAFE — no external fetches.
 * MEMORY SAFE — reads only.
 * BRAIN COMPLIANT — all learning flows from Memory.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brainLog, readMemoryForPosition, readRecentClosedMemory, newBrainTraceId } from "../_shared/brain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? null;
  const brainTrace = newBrainTraceId();

  // ── Read from Memory (Brain's ONLY input) ─────────────────────────
  let closedEvents: any[] = [];

  if (positionId) {
    closedEvents = await readMemoryForPosition(positionId, sb);
    closedEvents = closedEvents.filter(e => e.phase === "EXIT_CLOSED");
  } else {
    closedEvents = await readRecentClosedMemory(body?.limit ?? 100, sb);
  }

  if (!closedEvents.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no closed memory events" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Group by strategy_blueprint_id from Memory payload
  const byBlueprint = new Map<string, { events: any[]; memIds: string[] }>();
  for (const memEvent of closedEvents) {
    const payload = memEvent.payload ?? {};
    const bpId = payload.strategy_blueprint_id;
    if (!bpId) continue;
    if (!byBlueprint.has(bpId)) byBlueprint.set(bpId, { events: [], memIds: [] });
    byBlueprint.get(bpId)!.events.push(memEvent);
    byBlueprint.get(bpId)!.memIds.push(memEvent.id);
  }

  if (!byBlueprint.size) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no blueprint-linked memory events" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let updated = 0;
  const brainLogs: any[] = [];

  for (const [bpId, { events, memIds }] of byBlueprint) {
    const { data: cur } = await sb.from("strategy_reputation")
      .select("*")
      .eq("blueprint_id", bpId)
      .maybeSingle();

    const wins = events.filter((e: any) => {
      const p = e.payload ?? {};
      return p.outcome === "TP" || Number(p.realized_pnl ?? 0) > 0;
    }).length;
    const losses = events.filter((e: any) => {
      const p = e.payload ?? {};
      return p.outcome === "SL" || Number(p.realized_pnl ?? 0) < 0;
    }).length;
    const total = events.length;
    const winRate = total > 0 ? wins / total : 0;

    const avgR = events.reduce((s: number, e: any) => s + Number(e.payload?.r_multiple ?? 0), 0) / Math.max(total, 1);
    const maxDD = Math.min(...events.map((e: any) => Number(e.payload?.r_multiple ?? 0)));

    const prevRep = Number(cur?.reputation ?? 0);
    const prevConf = Number(cur?.confidence ?? 0.2);
    const prevSamples = Math.round(prevConf * 50);
    const newSamples = prevSamples + total;
    const newConf = clamp(Math.log10(1 + newSamples) / 2, 0, 1);

    const expectancyScore = clamp(avgR * 10 + 0.5, 0, 1);
    const ddPenalty = maxDD < -3 ? 0.3 : maxDD < -2 ? 0.15 : 0;
    const rawRep = winRate * 0.4 + expectancyScore * 0.4 + (1 - ddPenalty) * 0.2;
    const newRep = prevRep * 0.7 + rawRep * 0.3;

    const posterior = {
      reputation: clamp(newRep, 0, 1),
      confidence: newConf,
    };

    await sb.from("strategy_reputation").upsert({
      blueprint_id: bpId,
      ...posterior,
      last_updated: new Date().toISOString(),
      notes: JSON.stringify({ wins, losses, total, avgR: avgR.toFixed(4), winRate: winRate.toFixed(3) }),
    }, { onConflict: "blueprint_id" });

    brainLogs.push({
      trace_id: brainTrace,
      target_table: "strategy_reputation",
      target_key: bpId,
      symbol: events[0]?.symbol,
      update_type: "REPUTATION_BLEND",
      prior_state: { reputation: prevRep, confidence: prevConf },
      posterior_state: posterior,
      memory_event_ids: memIds,
      source_function: "strategy-reputation-update",
      notes: `wins=${wins} losses=${losses} avgR=${avgR.toFixed(4)}`,
    });

    updated++;
  }

  // Log all brain updates
  if (brainLogs.length) {
    await brainLog(brainLogs, sb);
  }

  return new Response(JSON.stringify({ ok: true, updated, brain_trace: brainTrace }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
