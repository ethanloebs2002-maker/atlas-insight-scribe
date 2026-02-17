/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATLAS CONFIDENCE RECALC — Scheduled recomputation of confidence scores
 *
 * BACKBONE-SAFE: Reads ONLY from canonical DB tables
 * (latest_orderbook, latest_prices, market_data_config).
 * NO external API fetches.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function computeExecutionP(
  side: string,
  entryPrice: number,
  bid: number,
  ask: number,
  spreadBps: number,
  stalenessMs: number,
  staleMsExec: number,
): { executionP: number; staleBlocked: boolean; distPct: number } {
  if (stalenessMs > staleMsExec) {
    return { executionP: 0, staleBlocked: true, distPct: 0 };
  }

  const touch = side === "LONG" ? ask : bid;
  let distPct: number;
  if (side === "LONG") {
    distPct = entryPrice <= touch ? Math.max(0, (touch - entryPrice) / touch) : 0;
  } else {
    distPct = entryPrice >= touch ? Math.max(0, (entryPrice - touch) / touch) : 0;
  }

  let baseExecP: number;
  if (distPct <= 0.0005) baseExecP = 0.95 + (0.05 * (1 - distPct / 0.0005));
  else if (distPct <= 0.0015) baseExecP = 0.75 + 0.20 * (1 - (distPct - 0.0005) / 0.001);
  else if (distPct <= 0.003) baseExecP = 0.45 + 0.30 * (1 - (distPct - 0.0015) / 0.0015);
  else baseExecP = 0.15;

  const spreadMult = spreadBps <= 5 ? 1.0
    : spreadBps <= 15 ? 0.95
    : spreadBps <= 30 ? 0.85
    : spreadBps <= 60 ? 0.70
    : 0.55;

  return { executionP: clamp(baseExecP * spreadMult, 0.05, 1.0), staleBlocked: false, distPct };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const symbolsFilter: string[] | null = body?.symbols ?? null;
  const limit = body?.limit ?? 100;

  // 1. Load config
  const { data: configRows } = await sb.from("market_data_config").select("*").limit(1);
  const config = configRows?.[0] ?? { stale_ms_exec: 1500, stale_ms_ui: 5000 };
  const staleMsExec = config.stale_ms_exec;

  // 2. Load canonical orderbook + prices
  const { data: orderbooks } = await sb.from("latest_orderbook").select("*");
  const { data: prices } = await sb.from("latest_prices").select("*");

  const obMap: Record<string, any> = {};
  for (const ob of orderbooks ?? []) obMap[ob.symbol] = ob;
  const priceMap: Record<string, any> = {};
  for (const p of prices ?? []) priceMap[p.symbol] = p;

  // 3. Select active decisions
  let query = sb.from("paper_decisions")
    .select("id, asset_id, direction_pred, entry_price, stop_loss, take_profit, probability_pred, consensus_score, engine_status, timeframe")
    .in("engine_status", ["PROPOSED", "APPROVED", "EXECUTING"])
    .not("entry_price", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (symbolsFilter?.length) {
    query = query.in("asset_id", symbolsFilter);
  }

  const { data: decisions } = await query;

  let updatedCount = 0;
  let staleBlocks = 0;
  let missingOrderbook = 0;
  const events: any[] = [];

  const now = Date.now();

  for (const d of decisions ?? []) {
    const symbol = d.asset_id;
    const ob = obMap[symbol];
    const pr = priceMap[symbol];

    if (!ob) {
      missingOrderbook++;
      events.push({
        decision_id: d.id,
        symbol,
        event_type: "NO_ORDERBOOK",
        payload: { reason: "no orderbook data for symbol" },
      });
      continue;
    }

    const bid = Number(ob.bid_price);
    const ask = Number(ob.ask_price);
    const spreadBps = Number(ob.spread_bps);
    const capturedAt = new Date(ob.captured_at).getTime();
    const stalenessMs = now - capturedAt;

    const side = d.direction_pred === "UP" ? "LONG" : "SHORT";
    const entryPrice = Number(d.entry_price);

    // Execution probability
    const exec = computeExecutionP(side, entryPrice, bid, ask, spreadBps, stalenessMs, staleMsExec);

    if (exec.staleBlocked) {
      staleBlocks++;
      events.push({
        decision_id: d.id,
        symbol,
        event_type: "STALE_BLOCK",
        payload: { staleness_ms: stalenessMs, threshold: staleMsExec },
      });
      continue;
    }

    // Belief probability from consensus
    const beliefP = Number(d.probability_pred) || 0.5;

    // Quality modifier from scenario reputation (average EMA for this symbol)
    let qualityQ = 0.55; // default
    const { data: repRows } = await sb.from("scenario_reputation")
      .select("ema_winrate")
      .eq("symbol", symbol)
      .limit(10);
    if (repRows?.length) {
      const avg = repRows.reduce((s: number, r: any) => s + Number(r.ema_winrate ?? 0.5), 0) / repRows.length;
      qualityQ = avg;
    }

    // Final confidence
    const confidenceP = clamp(
      beliefP * clamp(qualityQ, 0.25, 1) * clamp(exec.executionP, 0.1, 1),
      0, 1,
    );

    const explain = {
      belief_p: beliefP,
      belief_source: "consensus_probability",
      quality_q: qualityQ,
      execution_p: exec.executionP,
      execution_dist_pct: exec.distPct,
      spread_bps: spreadBps,
      staleness_ms: stalenessMs,
      side,
      entry_price: entryPrice,
      bid, ask,
      computed_at: new Date().toISOString(),
    };

    // Update decision
    await sb.from("paper_decisions").update({
      belief_p: beliefP,
      execution_p: exec.executionP,
      confidence_p: confidenceP,
      confidence_explain: explain,
      confidence_updated_at: new Date().toISOString(),
    }).eq("id", d.id);

    events.push({
      decision_id: d.id,
      symbol,
      event_type: "CONF_RECALC",
      payload: { confidence_p: confidenceP, belief_p: beliefP, execution_p: exec.executionP, quality_q: qualityQ },
    });

    updatedCount++;
  }

  // Batch insert confidence events
  if (events.length > 0) {
    await sb.from("confidence_events").insert(events);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      decisions_updated: updatedCount,
      stale_blocks: staleBlocks,
      missing_orderbook: missingOrderbook,
      total_processed: (decisions ?? []).length,
    }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
