/**
 * ATLAS Scenario Reputation Update (BRAIN-COMPLIANT)
 *
 * COLOSSAL PATCH:
 * - Batch attribution load (eliminates N+1 queries)
 * - Batch scenario_reputation read (chunk by scenario_key)
 * - In-memory accumulation for multiple events touching same key
 * - Cohort-aware via updated brain.ts helpers
 * - Brain log in chunks
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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Key = { scenario_key: string; symbol: string; timeframe: string; regime: string };
function keyStr(k: Key) { return `${k.scenario_key}|${k.symbol}|${k.timeframe}|${k.regime}`; }

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? body?.trade_id ?? null;
  const outcomeType: string | null = body?.outcome_type ?? null;
  const limit = Number(body?.limit ?? 50);
  const cohortId = body?.cohort_id ?? undefined; // undefined = use default cohort

  const brainTrace = newBrainTraceId();

  // ── Read from Memory (Brain's ONLY input) ─────────────────────────
  let closedEvents: any[] = [];
  if (positionId) {
    closedEvents = await readMemoryForPosition(positionId, sb, cohortId);
    closedEvents = closedEvents.filter(e => e.phase === "EXIT_CLOSED");
  } else {
    closedEvents = await readRecentClosedMemory(limit, sb, cohortId);
  }

  if (!closedEvents.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no closed memory events" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // ── Batch: collect all position_ids ────────────────────────────────
  const positionIds = [...new Set(closedEvents.map(e => e.position_id).filter(Boolean))] as string[];
  if (!positionIds.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no position ids on memory events" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // ── Batch: load all attributions in one query ─────────────────────
  const { data: attribs, error: aErr } = await sb
    .from("trade_scenario_attribution")
    .select("position_id,scenario_key,symbol,timeframe,regime")
    .in("position_id", positionIds);

  if (aErr) throw new Error(`trade_scenario_attribution load failed: ${aErr.message}`);

  const attribByPos = new Map<string, any[]>();
  for (const a of (attribs ?? [])) {
    const arr = attribByPos.get(a.position_id) ?? [];
    arr.push(a);
    attribByPos.set(a.position_id, arr);
  }

  // ── Collect unique scenario keys we need to update ────────────────
  const neededKeys = new Map<string, Key>();
  for (const ev of closedEvents) {
    const pid = ev.position_id;
    const rows = attribByPos.get(pid) ?? [];
    for (const s of rows) {
      const k: Key = {
        scenario_key: String(s.scenario_key),
        symbol: String(s.symbol ?? ev.symbol ?? "_global_"),
        timeframe: String(s.timeframe ?? ev.timeframe ?? "_all_"),
        regime: String(s.regime ?? "_all_"),
      };
      neededKeys.set(keyStr(k), k);
    }
  }

  const keys = [...neededKeys.values()];
  if (!keys.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no scenario attributions found" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // ── Batch: load existing scenario_reputation rows in chunks ───────
  const uniqueScenarioKeys = [...new Set(keys.map(k => k.scenario_key))];
  const existing = new Map<string, any>();

  for (const group of chunk(uniqueScenarioKeys, 50)) {
    const { data: curRows, error: cErr } = await sb
      .from("scenario_reputation")
      .select("scenario_key,symbol,timeframe,regime,alpha,beta,samples,wins,losses,expires,ema_winrate")
      .in("scenario_key", group);

    if (cErr) throw new Error(`scenario_reputation load failed: ${cErr.message}`);

    for (const r of (curRows ?? [])) {
      existing.set(`${r.scenario_key}|${r.symbol}|${r.timeframe}|${r.regime}`, r);
    }
  }

  // ── Compute updates (accumulate in-memory for batch correctness) ──
  const upserts: any[] = [];
  const logs: any[] = [];
  let updated = 0;

  for (const ev of closedEvents) {
    const payload = ev.payload ?? {};
    const pid = ev.position_id;
    if (!pid) continue;

    const effectiveOutcome = outcomeType ?? payload.outcome ?? payload.close_reason ?? "UNKNOWN";
    const isExpired = effectiveOutcome === "EXPIRED_NO_FILL" || effectiveOutcome === "EXPIRED" || effectiveOutcome === "EXPIRY";
    const isWin = !isExpired && (effectiveOutcome === "TP" || Number(payload.realized_pnl ?? 0) > 0);
    const isLoss = !isExpired && !isWin && (effectiveOutcome === "SL" || Number(payload.realized_pnl ?? 0) < 0);

    const rows = attribByPos.get(pid) ?? [];
    for (const s of rows) {
      const k: Key = {
        scenario_key: String(s.scenario_key),
        symbol: String(s.symbol ?? ev.symbol ?? "_global_"),
        timeframe: String(s.timeframe ?? ev.timeframe ?? "_all_"),
        regime: String(s.regime ?? "_all_"),
      };

      const ks = keyStr(k);
      const cur = existing.get(ks);

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
        alpha: alpha1,
        beta: beta1,
        posterior_mean: mean,
        credibility: cred,
        samples: samples1,
        wins: wins0 + (isWin ? 1 : 0),
        losses: losses0 + (isLoss ? 1 : 0),
        expires: expires0 + (isExpired ? 1 : 0),
        ema_winrate: ema1,
      };

      upserts.push({
        scenario_key: k.scenario_key,
        symbol: k.symbol,
        timeframe: k.timeframe,
        regime: k.regime,
        ...posterior,
        updated_at: new Date().toISOString(),
      });

      logs.push({
        trace_id: brainTrace,
        target_table: "scenario_reputation",
        target_key: ks,
        symbol: k.symbol,
        update_type: "BAYESIAN_UPDATE",
        prior_state: { alpha: alpha0, beta: beta0, samples: samples0, ema_winrate: ema0 },
        posterior_state: posterior,
        memory_event_ids: [ev.id],
        source_function: "scenario-reputation-update",
        notes: `outcome=${effectiveOutcome}`,
      });

      // Update in-memory so multiple events in batch accumulate correctly
      existing.set(ks, { ...k, ...posterior });
      updated++;
    }
  }

  // ── Deduplicate upserts (keep last per key, since in-memory accumulates) ──
  const deduped = new Map<string, any>();
  for (const u of upserts) {
    deduped.set(`${u.scenario_key}|${u.symbol}|${u.timeframe}|${u.regime}`, u);
  }
  const uniqueUpserts = [...deduped.values()];

  // ── Upsert in chunks ──────────────────────────────────────────────
  for (const group of chunk(uniqueUpserts, 500)) {
    const { error } = await sb.from("scenario_reputation").upsert(group, { onConflict: "scenario_key,symbol,timeframe,regime" });
    if (error) throw new Error(`scenario_reputation upsert failed: ${error.message}`);
  }

  // ── Log brain updates in chunks ───────────────────────────────────
  for (const group of chunk(logs, 300)) {
    await brainLog(group, sb);
  }

  return new Response(JSON.stringify({ ok: true, updated, brain_trace: brainTrace }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
