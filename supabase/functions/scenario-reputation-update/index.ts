/**
 * ATLAS Scenario Reputation Update (BRAIN-COMPLIANT)
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

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

const EMA_ALPHA = 0.1;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? body?.trade_id ?? null;
  const outcomeType: string | null = body?.outcome_type ?? null;
  const brainTrace = newBrainTraceId();

  // ── Read from Memory (Brain's ONLY input) ─────────────────────────
  let closedEvents: any[] = [];

  if (positionId) {
    closedEvents = await readMemoryForPosition(positionId, sb);
    closedEvents = closedEvents.filter(e => e.phase === "EXIT_CLOSED");
  } else {
    closedEvents = await readRecentClosedMemory(body?.limit ?? 50, sb);
  }

  if (!closedEvents.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no closed memory events" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let updated = 0;
  const brainLogs: any[] = [];

  for (const memEvent of closedEvents) {
    const payload = memEvent.payload ?? {};
    const pid = memEvent.position_id;
    const symbol = memEvent.symbol;
    const memIds = [memEvent.id];

    // Extract outcome from Memory payload
    const effectiveOutcome = outcomeType ?? payload.outcome ?? payload.close_reason ?? "UNKNOWN";
    const isExpired = effectiveOutcome === "EXPIRED_NO_FILL" || effectiveOutcome === "EXPIRED" || effectiveOutcome === "EXPIRY";
    const isWin = !isExpired && (
      effectiveOutcome === "TP" ||
      Number(payload.realized_pnl ?? 0) > 0
    );
    const isLoss = !isExpired && !isWin && (
      effectiveOutcome === "SL" ||
      Number(payload.realized_pnl ?? 0) < 0
    );

    if (!pid) continue;

    const { data: attribs } = await sb
      .from("trade_scenario_attribution")
      .select("scenario_key,symbol,timeframe,regime")
      .eq("position_id", pid);

    for (const s of attribs ?? []) {
      const key = String(s.scenario_key);
      const sym = s.symbol ?? symbol ?? '_global_';
      const tf = s.timeframe ?? '_all_';
      const rg = s.regime ?? '_all_';

      const { data: cur } = await sb
        .from("scenario_reputation")
        .select("alpha,beta,samples,wins,losses,expires,ema_winrate")
        .eq("scenario_key", key)
        .eq("symbol", sym)
        .eq("timeframe", tf)
        .eq("regime", rg)
        .maybeSingle();

      const alpha0 = Number(cur?.alpha ?? 1);
      const beta0 = Number(cur?.beta ?? 1);
      const samples0 = Number(cur?.samples ?? 0);
      const wins0 = Number(cur?.wins ?? 0);
      const losses0 = Number(cur?.losses ?? 0);
      const expires0 = Number(cur?.expires ?? 0);
      const ema0 = Number(cur?.ema_winrate ?? 0.5);

      const alpha1 = alpha0 + (isWin ? 1 : 0);
      const beta1 = beta0 + (isLoss ? 1 : 0);
      const samples1 = samples0 + 1;
      const mean = alpha1 / (alpha1 + beta1);
      const cred = clamp01(Math.log10(1 + samples1) / 2);

      let ema1 = ema0;
      if (isWin) ema1 = ema0 * (1 - EMA_ALPHA) + 1 * EMA_ALPHA;
      else if (isLoss) ema1 = ema0 * (1 - EMA_ALPHA) + 0 * EMA_ALPHA;

      const posterior = {
        alpha: alpha1, beta: beta1, posterior_mean: mean,
        credibility: cred, samples: samples1,
        wins: wins0 + (isWin ? 1 : 0),
        losses: losses0 + (isLoss ? 1 : 0),
        expires: expires0 + (isExpired ? 1 : 0),
        ema_winrate: ema1,
      };

      const up = await sb.from("scenario_reputation").upsert({
        scenario_key: key, symbol: sym, timeframe: tf, regime: rg,
        ...posterior,
        updated_at: new Date().toISOString(),
      }, { onConflict: "scenario_key,symbol,timeframe,regime" });

      if (!up.error) {
        brainLogs.push({
          trace_id: brainTrace,
          target_table: "scenario_reputation",
          target_key: `${key}|${sym}|${tf}|${rg}`,
          symbol: sym,
          update_type: "BAYESIAN_UPDATE",
          prior_state: { alpha: alpha0, beta: beta0, samples: samples0, ema_winrate: ema0 },
          posterior_state: posterior,
          memory_event_ids: memIds,
          source_function: "scenario-reputation-update",
          notes: `outcome=${effectiveOutcome}`,
        });
        updated++;
      }
    }
  }

  // Log all brain updates
  if (brainLogs.length) {
    await brainLog(brainLogs, sb);
  }

  return new Response(JSON.stringify({ ok: true, updated, brain_trace: brainTrace }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
