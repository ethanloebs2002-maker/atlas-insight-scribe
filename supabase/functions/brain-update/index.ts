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
 * ❌ Read from trade_scenario_attribution (scenarios come from Memory)
 * ❌ Read from paper_positions or paper_decisions
 * ❌ Read from sensor tables (market_context_snapshots, derivatives_context_snapshots, etc.)
 *
 * It ONLY reads from atlas_memory_events and brain output tables.
 * It updates belief state and logs what changed.
 *
 * BACKBONE SAFE — no external fetches.
 * MEMORY SAFE — reads only, never writes to Memory.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brainLog, readRecentClosedMemory, newBrainTraceId } from "../_shared/brain.ts";

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

/** Load the full Memory bundle for a position across all phases */
async function loadMemoryBundle(positionId: string, sb: ReturnType<typeof createClient>) {
  const { data } = await sb
    .from("atlas_memory_events")
    .select("id,trace_id,symbol,timeframe,phase,source,payload")
    .eq("position_id", positionId)
    .in("phase", ["DECISION_EMIT", "ENTRY_FILLED", "EXIT_CLOSED"])
    .order("ts", { ascending: true });

  const events = data ?? [];
  const bundle: Record<string, Record<string, any>> = {};
  const allIds: string[] = [];

  for (const ev of events) {
    const key = `${ev.phase}:${ev.source}`;
    bundle[key] = ev;
    allIds.push(ev.id);
  }

  return { bundle, allIds, events };
}

/** Extract scenario keys from DECISION_EMIT consensus Memory event */
function extractScenarioKeys(bundle: Record<string, any>): {
  keys: string[];
  weights: Record<string, number>;
  direction: string | null;
  probability: number | null;
  regime: string | null;
  timeframe: string | null;
  strategyBlueprintId: string | null;
} {
  const consensusEvent = bundle["DECISION_EMIT:consensus"];
  const payload = consensusEvent?.payload ?? {};
  const data = payload.data ?? payload;

  return {
    keys: Array.isArray(data.scenario_keys) ? data.scenario_keys : [],
    weights: (typeof data.scenario_weights === "object" && data.scenario_weights) ? data.scenario_weights : {},
    direction: data.direction ?? null,
    probability: typeof data.probability === "number" ? data.probability : null,
    regime: data.regime ?? null,
    timeframe: consensusEvent?.timeframe ?? null,
    strategyBlueprintId: data.strategy_blueprint_id ?? null,
  };
}

/** Extract outcome from EXIT_CLOSED execution Memory event */
function extractOutcome(bundle: Record<string, any>): {
  outcome: string;
  realizedPnl: number;
  realizedR: number;
  strategyBlueprintId: string | null;
} {
  const execEvent = bundle["EXIT_CLOSED:execution"];
  const payload = execEvent?.payload ?? {};
  const data = payload.data ?? payload;

  return {
    outcome: data.outcome ?? data.close_reason ?? "UNKNOWN",
    realizedPnl: Number(data.realized_pnl ?? 0),
    realizedR: Number(data.r_multiple ?? data.realized_r ?? 0),
    strategyBlueprintId: data.strategy_blueprint_id ?? null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? null;
  const brainTrace = newBrainTraceId();

  // ── Step 1: Read from Memory (the Brain's ONLY input) ─────────────────
  let closedEvents: any[] = [];

  if (positionId) {
    // Single position mode — get EXIT_CLOSED execution event
    const { data } = await sb
      .from("atlas_memory_events")
      .select("id,trace_id,position_id,symbol,timeframe,phase,source,payload")
      .eq("position_id", positionId)
      .eq("phase", "EXIT_CLOSED")
      .eq("source", "execution")
      .order("ts", { ascending: false })
      .limit(1);
    closedEvents = data ?? [];
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
    const pid = memEvent.position_id;
    if (!pid) continue;

    // ── Step 2: Load full Memory bundle for this position ────────────
    const { bundle, allIds } = await loadMemoryBundle(pid, sb);
    const symbol = memEvent.symbol;

    // ── Extract outcome from EXIT_CLOSED execution event ─────────────
    const { outcome, realizedPnl, realizedR, strategyBlueprintId: exitBpId } = extractOutcome(bundle);

    const isExpired = outcome === "EXPIRED_NO_FILL" || outcome === "EXPIRED" || outcome === "EXPIRY";
    const isWin = !isExpired && (outcome === "TP" || realizedPnl > 0);
    const isLoss = !isExpired && !isWin && (outcome === "SL" || realizedPnl < 0);

    // ── Extract scenario keys from DECISION_EMIT consensus event ─────
    const { keys: scenarioKeys, regime, timeframe, strategyBlueprintId: decBpId } = extractScenarioKeys(bundle);

    // ── Scenario Reputation Update (from Memory only) ────────────────
    for (const key of scenarioKeys) {
      const sym = symbol ?? "_global_";
      const tf = timeframe ?? "_all_";
      const rg = regime ?? "_all_";

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
        memory_event_ids: allIds,
        source_function: "brain-update",
        notes: `outcome=${outcome} pnl=${realizedPnl} scenarios=${scenarioKeys.length} trace=${brainTrace}`,
      });

      scenarioUpdates++;
    }

    // ── Strategy Reputation Update (from Memory only) ────────────────
    const bpId = decBpId ?? exitBpId ?? null;
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
        memory_event_ids: allIds,
        source_function: "brain-update",
        notes: `outcome=${outcome} r=${realizedR} trace=${brainTrace}`,
      });

      strategyUpdates++;
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
