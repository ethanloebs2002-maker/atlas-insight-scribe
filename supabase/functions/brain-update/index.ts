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
 * ❌ Read from Backbone tables (latest_prices, latest_orderbook)
 *
 * It ONLY reads from atlas_memory_events and brain output tables.
 * It updates belief state and logs what changed.
 *
 * BACKBONE SAFE — no external fetches.
 * MEMORY SAFE — reads only, never writes to Memory.
 *
 * LEARNING BOUNDARY:
 * - Brain NEVER learns from legacy_prebrain cohort.
 * - Brain requires DECISION_EMIT:consensus in every bundle (fail-closed).
 * - Optional epoch gate via BRAIN_EPOCH_START_TS env var.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brainLog, newBrainTraceId } from "../_shared/brain.ts";
import {
  loadCompleteBundleForPosition,
  loadCompleteBundleBatch,
  type MemoryBundle,
  type MemoryEventRow,
} from "../_shared/memoryBundleContract.ts";

// ── Learning Boundary Constants ─────────────────────────────────────────
const COHORT_BRAIN = "brain_online_2026_02_17";
const COHORT_LEGACY = "legacy_prebrain";

// Optional epoch gate: Brain ignores EXIT_CLOSED before this timestamp.
const BRAIN_EPOCH_START_TS = Deno.env.get("BRAIN_EPOCH_START_TS") || "";

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

// ── Cursor Helpers (idempotency) ────────────────────────────────────────

type SB = ReturnType<typeof createClient>;

async function readCursor(sb: SB): Promise<string> {
  const { data, error } = await sb
    .from("atlas_brain_cursor")
    .select("last_ts")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`[brain] cursor read failed: ${error.message}`);
  return (data?.last_ts ?? "1970-01-01T00:00:00Z") as string;
}

async function writeCursorCAS(sb: SB, expectedOld: string, newTs: string): Promise<boolean> {
  const { data, error } = await sb
    .from("atlas_brain_cursor")
    .update({ last_ts: newTs })
    .eq("id", 1)
    .eq("last_ts", expectedOld)
    .select("last_ts")
    .maybeSingle();
  if (error) throw new Error(`[brain] cursor CAS write failed: ${error.message}`);
  return !!data; // true if we won the race
}

async function acquireLease(sb: SB, owner: string, leaseSeconds = 90): Promise<boolean> {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const { data, error } = await sb
    .from("atlas_brain_cursor")
    .update({ locked_until: until, lock_owner: owner })
    .eq("id", 1)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .select("lock_owner")
    .maybeSingle();
  if (error) throw new Error(`[brain] lease acquire failed: ${error.message}`);
  return data?.lock_owner === owner;
}

async function releaseLease(sb: SB, owner: string): Promise<void> {
  const { error } = await sb
    .from("atlas_brain_cursor")
    .update({ locked_until: null, lock_owner: null })
    .eq("id", 1)
    .eq("lock_owner", owner);
  if (error) throw new Error(`[brain] lease release failed: ${error.message}`);
}

function bumpMaxHandled(current: string | null, ts?: string | null): string | null {
  if (!ts) return current;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return current;
  if (!current) return ts;
  return ms > Date.parse(current) ? ts : current;
}

// ── Boundary Helpers ────────────────────────────────────────────────────

function getExitClosedEvent(mb: MemoryBundle): MemoryEventRow | null {
  return (Object.values(mb.bundle) as MemoryEventRow[]).find(e => e.phase === "EXIT_CLOSED") ?? null;
}

function parseTs(ev: MemoryEventRow): number | null {
  const t = ev?.ts ?? ev?.created_at;
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function epochAllows(ev: MemoryEventRow): boolean {
  if (!BRAIN_EPOCH_START_TS) return true;
  const gate = Date.parse(BRAIN_EPOCH_START_TS);
  if (!Number.isFinite(gate)) return true;
  const evTs = parseTs(ev);
  if (evTs == null) return true;
  return evTs >= gate;
}

function cohortAllows(ev: MemoryEventRow): boolean {
  const c = ev?.cohort_id ?? null;
  // Fail closed: if cohort_id missing, do not learn
  if (!c) return false;
  if (c === COHORT_LEGACY) return false;
  return c === COHORT_BRAIN;
}

// ── Extractors ──────────────────────────────────────────────────────────

/** Extract scenario keys from DECISION_EMIT consensus Memory event */
function extractScenarioKeys(bundle: Record<string, MemoryEventRow>): {
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
  const data = (typeof payload === "object" && payload !== null && "data" in payload) ? (payload as any).data : payload;

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
function extractOutcome(bundle: Record<string, MemoryEventRow>): {
  outcome: string;
  realizedPnl: number;
  realizedR: number;
  strategyBlueprintId: string | null;
} {
  const execEvent = bundle["EXIT_CLOSED:execution"];
  const payload = execEvent?.payload ?? {};
  const data = (typeof payload === "object" && payload !== null && "data" in payload) ? (payload as any).data : payload;

  return {
    outcome: data.outcome ?? data.close_reason ?? "UNKNOWN",
    realizedPnl: Number(data.realized_pnl ?? 0),
    realizedR: Number(data.r_multiple ?? data.realized_r ?? 0),
    strategyBlueprintId: data.strategy_blueprint_id ?? null,
  };
}

// ── Main Handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? null;
  const brainTrace = newBrainTraceId();
  const isBatch = !positionId;

  // ── Lease lock: prevent concurrent batch runs from double-learning ────
  if (isBatch) {
    const gotLock = await acquireLease(sb, brainTrace, 90);
    if (!gotLock) {
      return new Response(JSON.stringify({
        ok: true, updated: 0, msg: "lease busy; retry next cron",
      }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }
  }

  try {
    return await runBrainUpdate(sb, body, positionId, brainTrace, isBatch);
  } finally {
    if (isBatch) await releaseLease(sb, brainTrace);
  }
});

async function runBrainUpdate(
  sb: SB, body: any, positionId: string | null, brainTrace: string, isBatch: boolean,
): Promise<Response> {
  // ── Step 1: Read from Memory (the Brain's ONLY input) ─────────────────
  let closedEvents: any[] = [];
  let cursorTs: string | null = null;

  if (positionId) {
    const { data } = await sb
      .from("atlas_memory_events")
      .select("id,ts,trace_id,position_id,decision_id,cohort_id,symbol,timeframe,phase,source,payload")
      .eq("position_id", positionId)
      .eq("phase", "EXIT_CLOSED")
      .order("ts", { ascending: false })
      .limit(1);
    closedEvents = data ?? [];
  } else {
    cursorTs = await readCursor(sb);
    const { data, error } = await sb
      .from("atlas_memory_events")
      .select("id,ts,trace_id,position_id,decision_id,cohort_id,symbol,timeframe,phase,source,payload")
      .eq("phase", "EXIT_CLOSED")
      .gt("ts", cursorTs)
      .order("ts", { ascending: true })
      .limit(body?.limit ?? 50);
    if (error) throw new Error(`[brain] EXIT_CLOSED load failed: ${error.message}`);
    closedEvents = data ?? [];
  }

  if (!closedEvents.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no new closed memory events", cursor: cursorTs }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // ── Step 2: Load complete bundles using the contract loader ────────────
  const positionIds = [...new Set(closedEvents.map(e => e.position_id).filter(Boolean))];

  let bundleMap: Map<string, MemoryBundle>;

  if (positionId) {
    const mb = await loadCompleteBundleForPosition(sb, positionId);
    bundleMap = new Map([[positionId, mb]]);
  } else {
    bundleMap = await loadCompleteBundleBatch(sb, positionIds);
  }

  // ── Step 3: Process each closed trade ─────────────────────────────────
  let scenarioUpdates = 0;
  let strategyUpdates = 0;
  let skippedCohort = 0;
  let skippedEpoch = 0;
  let skippedNoConsensus = 0;
  let maxHandledTs: string | null = null;
  const brainLogs: any[] = [];

  for (const memEvent of closedEvents) {
    const pid = memEvent.position_id;
    if (!pid) continue;

    const mb = bundleMap.get(pid);
    if (!mb) continue;

    const { bundle, allIds } = mb;
    const symbol = memEvent.symbol;

    // ── Boundary enforcement ──────────────────────────────────────────
    const exitEv = getExitClosedEvent(mb);
    if (!exitEv) {
      console.log("[brain] skip: no EXIT_CLOSED in bundle", { positionId: pid });
      continue;
    }

    if (!cohortAllows(exitEv)) {
      console.log("[brain] skip: cohort blocked", { positionId: pid, cohort_id: exitEv.cohort_id });
      maxHandledTs = bumpMaxHandled(maxHandledTs, exitEv.ts ?? exitEv.created_at);
      skippedCohort++;
      continue;
    }

    if (!epochAllows(exitEv)) {
      console.log("[brain] skip: before epoch", { positionId: pid, ts: exitEv.ts ?? exitEv.created_at });
      maxHandledTs = bumpMaxHandled(maxHandledTs, exitEv.ts ?? exitEv.created_at);
      skippedEpoch++;
      continue;
    }

    // ── Contract assertion: DECISION_EMIT:consensus must be present ──
    const consensus = bundle["DECISION_EMIT:consensus"];
    if (!consensus) {
      console.log("[brain] skip: missing DECISION_EMIT:consensus (bundle contract violated)", {
        positionId: pid, decisionId: mb.decisionId, keysPresent: Object.keys(bundle),
      });
      skippedNoConsensus++;
      // Do NOT bump cursor — this is potentially fixable
      continue;
    }

    // ── Boundary proof log ────────────────────────────────────────────
    console.log("[brain] learn: bundle ok", {
      positionId: pid, decisionId: mb.decisionId, traceId: mb.traceId,
      cohort_id: exitEv.cohort_id ?? null, hasConsensus: true,
      phases: [...new Set(mb.events.map(e => e.phase))].sort(),
    });

    // Extract outcome from EXIT_CLOSED execution event
    const { outcome, realizedPnl, realizedR, strategyBlueprintId: exitBpId } = extractOutcome(bundle);

    const isExpired = outcome === "EXPIRED_NO_FILL" || outcome === "EXPIRED" || outcome === "EXPIRY";
    const isWin = !isExpired && (outcome === "TP" || realizedPnl > 0);
    const isLoss = !isExpired && !isWin && (outcome === "SL" || realizedPnl < 0);

    // Extract scenario keys from DECISION_EMIT consensus event
    const { keys: scenarioKeys, regime, timeframe, strategyBlueprintId: decBpId } = extractScenarioKeys(bundle);

    // ── Output boundary assertion ────────────────────────────────────
    if (exitEv.cohort_id !== COHORT_BRAIN) {
      throw new Error(`[brain] OUTPUT BOUNDARY VIOLATION: cohort=${exitEv.cohort_id} position=${pid}`);
    }

    // ── Scenario Reputation Update (from Memory only) ────────────────
    for (const key of scenarioKeys) {
      const sym = symbol ?? "_global_";
      const tf = timeframe ?? "_all_";
      const rg = regime ?? "_all_";

      const { data: cur } = await sb
        .from("scenario_reputation")
        .select("alpha,beta,samples,wins,losses,expires,ema_winrate")
        .eq("scenario_key", key).eq("symbol", sym).eq("timeframe", tf).eq("regime", rg)
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
        wins: wins0 + (isWin ? 1 : 0), losses: losses0 + (isLoss ? 1 : 0),
        expires: expires0 + (isExpired ? 1 : 0), ema_winrate: ema1,
      };

      await sb.from("scenario_reputation").upsert({
        scenario_key: key, symbol: sym, timeframe: tf, regime: rg,
        cohort_id: COHORT_BRAIN, ...posterior, updated_at: new Date().toISOString(),
      }, { onConflict: "scenario_key,symbol,timeframe,regime" });

      brainLogs.push({
        trace_id: brainTrace, target_table: "scenario_reputation",
        target_key: `${key}|${sym}|${tf}|${rg}`, symbol: sym, cohort_id: COHORT_BRAIN,
        update_type: "BAYESIAN_UPDATE",
        prior_state: { alpha: alpha0, beta: beta0, samples: samples0, ema_winrate: ema0 },
        posterior_state: posterior, memory_event_ids: allIds,
        source_function: "brain-update",
        notes: `outcome=${outcome} pnl=${realizedPnl} scenarios=${scenarioKeys.length} trace=${brainTrace}`,
      });

      scenarioUpdates++;
    }

    // ── Strategy Reputation Update (from Memory only) ────────────────
    const bpId = decBpId ?? exitBpId ?? null;
    if (bpId) {
      const { data: cur } = await sb.from("strategy_reputation")
        .select("*").eq("blueprint_id", bpId).maybeSingle();

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

      const posterior = { reputation: clamp(newRep, 0, 1), confidence: newConf };

      await sb.from("strategy_reputation").upsert({
        blueprint_id: bpId, cohort_id: COHORT_BRAIN, ...posterior,
        last_updated: new Date().toISOString(),
        notes: JSON.stringify({ outcome, pnl: realizedPnl, r: realizedR }),
      }, { onConflict: "blueprint_id" });

      brainLogs.push({
        trace_id: brainTrace, target_table: "strategy_reputation",
        target_key: bpId, symbol, cohort_id: COHORT_BRAIN,
        update_type: "REPUTATION_BLEND",
        prior_state: { reputation: prevRep, confidence: prevConf },
        posterior_state: posterior, memory_event_ids: allIds,
        source_function: "brain-update",
        notes: `outcome=${outcome} r=${realizedR} trace=${brainTrace}`,
      });

      strategyUpdates++;
    }

    // ── Bump cursor: this event was successfully learned ──────────────
    maxHandledTs = bumpMaxHandled(maxHandledTs, exitEv.ts ?? exitEv.created_at);
  }

  // ── Step 4: Log all brain updates for provenance ────────────────────
  if (brainLogs.length) {
    await brainLog(brainLogs, sb);
  }

  // ── Step 5: Advance cursor via CAS (batch mode only, while holding lease)
  let cursorAdvanced = false;
  if (isBatch && maxHandledTs && cursorTs) {
    const ok = await writeCursorCAS(sb, cursorTs, maxHandledTs);
    if (!ok) {
      console.log("[brain] cursor CAS lost race (unexpected under lease)", {
        expected: cursorTs, attempted: maxHandledTs,
      });
      // Lease protects us, so this shouldn't happen. Log but still return results.
    } else {
      cursorAdvanced = true;
      console.log("[brain] cursor advanced", { oldCursor: cursorTs, newCursor: maxHandledTs });
    }
  }

  return new Response(JSON.stringify({
    ok: true, scenario_updates: scenarioUpdates, strategy_updates: strategyUpdates,
    memory_events_processed: closedEvents.length, positions_loaded: bundleMap.size,
    brain_trace: brainTrace, cursor_advanced: cursorAdvanced,
    skipped: { cohort: skippedCohort, epoch: skippedEpoch, no_consensus: skippedNoConsensus },
  }), { headers: { ...corsHeaders, "content-type": "application/json" } });
}
