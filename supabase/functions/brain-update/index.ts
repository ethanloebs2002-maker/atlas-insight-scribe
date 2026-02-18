/**
 * ATLAS Brain Update — Centralized Learning Dispatcher
 *
 * Reads ONLY from atlas_memory_events (Memory pillar).
 * Updates scenario_reputation, strategy_reputation, and logs to atlas_brain_log.
 *
 * The Brain does NOT:
 * ❌ Fetch prices or external data
 * ❌ Place trades or modify positions
 * ❌ Write to atlas_memory_events
 *
 * It ONLY updates belief state and logs what changed.
 *
 * BACKBONE SAFE — no external fetches.
 * MEMORY SAFE — reads only, never writes to Memory.
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

const EMA_ALPHA = 0.1;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? null;
  const brainTrace = newBrainTraceId();

  // ── Step 1: Read from Memory (the Brain's ONLY input) ─────────────────
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

  let scenarioUpdates = 0;
  let strategyUpdates = 0;
  const brainLogs: any[] = [];

  for (const memEvent of closedEvents) {
    const payload = memEvent.payload ?? {};
    const symbol = memEvent.symbol;
    const pid = memEvent.position_id;
    const memIds = [memEvent.id];

    // Extract outcome from Memory payload
    const outcome = payload.outcome ?? payload.close_reason ?? "UNKNOWN";
    const realizedPnl = Number(payload.realized_pnl ?? 0);
    const realizedR = Number(payload.r_multiple ?? 0);

    const isExpired = outcome === "EXPIRED_NO_FILL" || outcome === "EXPIRED" || outcome === "EXPIRY";
    const isWin = !isExpired && (outcome === "TP" || realizedPnl > 0);
    const isLoss = !isExpired && !isWin && (outcome === "SL" || realizedPnl < 0);

    // ── Scenario Reputation Update (from Memory) ──────────────────────
    if (pid) {
      const { data: attribs } = await sb
        .from("trade_scenario_attribution")
        .select("scenario_key,symbol,timeframe,regime")
        .eq("position_id", pid);

      for (const s of attribs ?? []) {
        const key = String(s.scenario_key);
        const sym = s.symbol ?? symbol ?? "_global_";
        const tf = s.timeframe ?? "_all_";
        const rg = s.regime ?? "_all_";

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
        const cred = clamp(Math.log10(1 + samples1) / 2, 0, 1);

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

        await sb.from("scenario_reputation").upsert({
          scenario_key: key, symbol: sym, timeframe: tf, regime: rg,
          ...posterior,
          updated_at: new Date().toISOString(),
        }, { onConflict: "scenario_key,symbol,timeframe,regime" });

        brainLogs.push({
          trace_id: brainTrace,
          target_table: "scenario_reputation",
          target_key: `${key}|${sym}|${tf}|${rg}`,
          symbol: sym,
          update_type: "BAYESIAN_UPDATE",
          prior_state: { alpha: alpha0, beta: beta0, samples: samples0, ema_winrate: ema0 },
          posterior_state: posterior,
          memory_event_ids: memIds,
          source_function: "brain-update",
          notes: `outcome=${outcome} pnl=${realizedPnl}`,
        });

        scenarioUpdates++;
      }
    }

    // ── Strategy Reputation Update (from Memory) ─────────────────────
    if (pid) {
      // Check if this position has a strategy_blueprint_id via attribution payload
      const bpId = payload.strategy_blueprint_id ?? null;
      if (bpId) {
        const { data: cur } = await sb.from("strategy_reputation")
          .select("*")
          .eq("blueprint_id", bpId)
          .maybeSingle();

        const prevRep = Number(cur?.reputation ?? 0);
        const prevConf = Number(cur?.confidence ?? 0.2);
        const prevSamples = Math.round(prevConf * 50);
        const newSamples = prevSamples + 1;
        const newConf = clamp(Math.log10(1 + newSamples) / 2, 0, 1);

        const winRate = isWin ? 1 : 0;
        const expectancyScore = clamp(realizedR * 10 + 0.5, 0, 1);
        const ddPenalty = realizedR < -3 ? 0.3 : realizedR < -2 ? 0.15 : 0;
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
          notes: JSON.stringify({ outcome, pnl: realizedPnl, r: realizedR }),
        }, { onConflict: "blueprint_id" });

        brainLogs.push({
          trace_id: brainTrace,
          target_table: "strategy_reputation",
          target_key: bpId,
          symbol,
          update_type: "REPUTATION_BLEND",
          prior_state: { reputation: prevRep, confidence: prevConf },
          posterior_state: posterior,
          memory_event_ids: memIds,
          source_function: "brain-update",
          notes: `outcome=${outcome} r=${realizedR}`,
        });

        strategyUpdates++;
      }
    }
  }

  // ── Step 3: Log all brain updates for provenance ────────────────────
  if (brainLogs.length) {
    await brainLog(brainLogs, sb);
  }

  return new Response(JSON.stringify({
    ok: true,
    scenario_updates: scenarioUpdates,
    strategy_updates: strategyUpdates,
    memory_events_processed: closedEvents.length,
    brain_trace: brainTrace,
  }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
