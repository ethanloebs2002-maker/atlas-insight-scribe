// ═══════════════════════════════════════════════════════════════════════════
// ATLAS PAPER ENGINE TICK — Candle-by-candle exchange simulation
// v2.1.0 — Adapted to actual ATLAS schema
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAttributionForPosition } from "../_shared/attribution_insert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Types ───────────────────────────────────────────────────────────────

interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Policy {
  id: string;
  version_tag: string;
  min_prob: number;
  min_rr: number;
  require_ev_positive: boolean;
  allow_shorts: boolean;
  max_open: number;
  max_pending: number;
  fee_bps: number;
  slippage_bps: number;
  latency_ms: number;
  fill_fraction_min: number;
  fill_fraction_max: number;
  worst_case_same_candle: boolean;
  expiry_minutes_by_tf: Record<string, number>;
}

// ─── Engine Core ─────────────────────────────────────────────────────────

class PaperEngineCore {
  private sb: ReturnType<typeof createClient>;
  private runId: string;
  private candle: Candle;
  private policy: Policy;
  private symbol: string;
  private timeframe: string;

  constructor(
    sb: ReturnType<typeof createClient>,
    symbol: string,
    timeframe: string,
    candle: Candle,
    policy: Policy,
  ) {
    this.sb = sb;
    this.runId = crypto.randomUUID();
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.candle = candle;
    this.policy = policy;
  }

  get run_id() {
    return this.runId;
  }

  // ─── Event Bus ───────────────────────────────────────────────────────

  private async emit(
    entityType: string,
    entityId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    try {
      await this.sb.from("paper_engine_events").insert({
        run_id: this.runId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        version_tag: this.policy.version_tag,
        ts: new Date().toISOString(),
        payload: { ...payload, candle_ts: this.candle.ts },
      });
    } catch (e) {
      console.error("emit failed:", eventType, e);
    }
  }

  // ─── Stage 0: Tick bookends ──────────────────────────────────────────

  async startTick() {
    await this.emit("ENGINE", null, "ENGINE_TICK_START", {
      symbol: this.symbol,
      timeframe: this.timeframe,
      candle: this.candle,
      policy_version: this.policy.version_tag,
    });
  }

  async endTick(stats: Record<string, unknown>) {
    await this.emit("ENGINE", null, "ENGINE_TICK_END", {
      symbol: this.symbol,
      timeframe: this.timeframe,
      stats,
    });
  }

  // ─── Stage 1: Decision gating ────────────────────────────────────────

  async evaluateDecisions() {
    // Fetch PROPOSED decisions for this asset+tf
    const { data: decisions, error } = await this.sb
      .from("paper_decisions")
      .select("*")
      .eq("asset_id", this.symbol)
      .eq("timeframe", this.timeframe)
      .eq("engine_status", "PROPOSED")
      .not("entry_price", "is", null)
      .not("stop_loss", "is", null)
      .not("take_profit", "is", null)
      .lte("created_at", this.candle.ts);

    if (error || !decisions) {
      console.error("fetch decisions:", error);
      return { approved: [] as any[], rejected: [] as any[] };
    }

    // Current exposure
    const { data: positions } = await this.sb
      .from("paper_positions")
      .select("status")
      .eq("symbol", this.symbol)
      .in("status", ["PENDING_ENTRY", "OPEN"]);

    let openN = 0;
    let pendingN = 0;
    for (const p of positions || []) {
      if (p.status === "OPEN") openN++;
      else pendingN++;
    }

    const approved: any[] = [];
    const rejected: any[] = [];

    for (const d of decisions) {
      const gates = this.gate(d, openN + approved.length, pendingN + approved.length);
      await this.emit("DECISION", d.id, "DECISION_POLICY_EVALUATED", gates);

      if (gates.approved) {
        approved.push(d);
        await this.sb.from("paper_decisions").update({ engine_status: "APPROVED" }).eq("id", d.id);
        await this.emit("DECISION", d.id, "DECISION_APPROVED", gates);
      } else {
        rejected.push(d);
        await this.sb.from("paper_decisions").update({ engine_status: "REJECTED" }).eq("id", d.id);
        await this.emit("DECISION", d.id, "DECISION_REJECTED", gates);
      }
    }
    return { approved, rejected };
  }

  private gate(d: any, openN: number, pendingN: number) {
    const direction = d.direction_pred as string;
    const prob = Number(d.probability_pred);
    const entry = Number(d.entry_price);
    const sl = Number(d.stop_loss);
    const tp = Number(d.take_profit);

    // ── Scenario 1 Authority: use consensus_score when probability is fallback ──
    const probComponents = d.probability_components as Record<string, unknown> | null;
    const isFallback = probComponents?.fallbackUsed === true || prob <= 0.31;
    const consensusScore = Number(d.consensus_score ?? 0);
    const policyProbability = isFallback && consensusScore >= 0.4
      ? consensusScore
      : prob;

    // Direction-aware RR
    const reward =
      direction === "UP"
        ? Math.abs(tp - entry)
        : Math.abs(entry - tp);
    const risk =
      direction === "UP"
        ? Math.abs(entry - sl)
        : Math.abs(sl - entry);
    const rr = risk > 0 ? reward / risk : 0;
    const ev = policyProbability * rr - (1 - policyProbability);

    const rejectionReasons: string[] = [];
    const minProbPass = policyProbability >= this.policy.min_prob;
    if (!minProbPass) rejectionReasons.push(`policy_prob ${policyProbability.toFixed(3)} < min_prob ${this.policy.min_prob}`);
    const minRrPass = rr >= this.policy.min_rr;
    if (!minRrPass) rejectionReasons.push(`R:R ${rr.toFixed(2)} < min_rr ${this.policy.min_rr}`);
    const evPass = !this.policy.require_ev_positive || ev > 0;
    if (!evPass) rejectionReasons.push(`EV ${ev.toFixed(3)} <= 0`);
    const shortsPass = direction === "UP" || this.policy.allow_shorts;
    if (!shortsPass) rejectionReasons.push("shorts disabled");
    const maxOpenPass = openN < this.policy.max_open;
    if (!maxOpenPass) rejectionReasons.push(`max_open ${openN} >= ${this.policy.max_open}`);
    const maxPendingPass = pendingN < this.policy.max_pending;
    if (!maxPendingPass) rejectionReasons.push(`max_pending ${pendingN} >= ${this.policy.max_pending}`);

    const gates = {
      min_prob_pass: minProbPass,
      min_rr_pass: minRrPass,
      ev_pass: evPass,
      shorts_pass: shortsPass,
      max_open_pass: maxOpenPass,
      max_pending_pass: maxPendingPass,
      prob,
      policyProbability,
      consensusAuthorityUsed: isFallback && consensusScore >= 0.4,
      rr,
      ev,
      direction,
      rejection_reasons: rejectionReasons,
    };
    const approved =
      gates.min_prob_pass &&
      gates.min_rr_pass &&
      gates.ev_pass &&
      gates.shorts_pass &&
      gates.max_open_pass &&
      gates.max_pending_pass;
    return { ...gates, approved, decision_id: d.id };
  }

  // ─── Stage 2: Entry order creation ───────────────────────────────────

  async createEntryOrders(approved: any[]) {
    for (const d of approved) {
      // Idempotency: skip if position already exists for this decision
      const { data: existing } = await this.sb
        .from("paper_positions")
        .select("id")
        .eq("decision_id", d.id)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const direction = d.direction_pred as string;
      const side = direction === "UP" ? "LONG" : "SHORT";
      const expiryMin =
        this.policy.expiry_minutes_by_tf[this.timeframe] ?? 1440;
      const expiresAt = new Date(
        new Date(this.candle.ts).getTime() + expiryMin * 60_000,
      ).toISOString();
      const eligibleFillAt = new Date(
        new Date(this.candle.ts).getTime() + this.policy.latency_ms,
      ).toISOString();

      const positionId = crypto.randomUUID();
      const orderId = crypto.randomUUID();

      // Create position
      await this.sb.from("paper_positions").insert({
        id: positionId,
        run_id: this.runId,
        policy_id: this.policy.id,
        decision_id: d.id,
        symbol: this.symbol,
        side,
        timeframe: d.timeframe,
        horizon: d.horizon,
        status: "PENDING_ENTRY",
        qty: 1,
        initial_probability_pred: d.probability_pred,
        initial_probability_source: d.probability_source || "indicator_engine",
        stop_price: Number(d.stop_loss),
        tp_price: Number(d.take_profit),
        expires_at: expiresAt,
        entry_order_id: orderId,
        duplicate_key: `${this.symbol}:${side}:${d.timeframe}:${d.horizon}`,
        regime_label: d.evidence_snapshot_json?.regime || null,
        meta: { created_candle: this.candle.ts },
      });

      // Create entry order
      await this.sb.from("paper_orders").insert({
        id: orderId,
        run_id: this.runId,
        policy_id: this.policy.id,
        symbol: this.symbol,
        side,
        order_type: "LIMIT",
        qty: 1,
        limit_price: Number(d.entry_price),
        status: "NEW",
        placed_at: new Date().toISOString(),
        eligible_fill_at: eligibleFillAt,
        reduce_only: false,
        position_id: positionId,
        meta: { decision_id: d.id, entry_order: true },
      });

      await this.sb
        .from("paper_decisions")
        .update({ engine_status: "EXECUTING" })
        .eq("id", d.id);

      await this.emit("ORDER", orderId, "ORDER_PLACED", {
        decision_id: d.id,
        position_id: positionId,
        side,
        limit_price: Number(d.entry_price),
      });

      await this.emit("POSITION", positionId, "POSITION_CREATED", {
        decision_id: d.id,
        order_id: orderId,
        side,
        expires_at: expiresAt,
      });
    }
  }

  // ─── Stage 3: Fill matching ──────────────────────────────────────────

  async matchFills() {
    const { data: orders } = await this.sb
      .from("paper_orders")
      .select("*")
      .eq("symbol", this.symbol)
      .in("status", ["NEW", "PARTIAL"])
      .lte("eligible_fill_at", this.candle.ts);

    if (!orders?.length) return;

    for (const order of orders) {
      if (!this.triggers(order)) continue;

      const remaining = order.qty - (order.filled_qty || 0);
      const frac =
        this.policy.fill_fraction_min +
        Math.random() * (this.policy.fill_fraction_max - this.policy.fill_fraction_min);
      const fillQty = Math.min(remaining, remaining * frac);
      const fillPrice = this.fillPrice(order);
      const fee = (fillQty * fillPrice * this.policy.fee_bps) / 10_000;

      const fillId = crypto.randomUUID();
      await this.sb.from("paper_fills").insert({
        id: fillId,
        order_id: order.id,
        position_id: order.position_id,
        filled_qty: fillQty,
        fill_price: fillPrice,
        fee_paid: fee,
        slippage_paid:
          Math.abs(fillPrice - (order.limit_price || order.stop_price || fillPrice)) * fillQty,
        ts: this.candle.ts,
        meta: { candle_ts: this.candle.ts },
      });

      const newFilled = (order.filled_qty || 0) + fillQty;
      const newStatus = newFilled >= order.qty ? "FILLED" : "PARTIAL";
      const avgPrice = order.avg_fill_price
        ? (order.avg_fill_price * order.filled_qty + fillPrice * fillQty) / newFilled
        : fillPrice;

      await this.sb
        .from("paper_orders")
        .update({ filled_qty: newFilled, avg_fill_price: avgPrice, status: newStatus })
        .eq("id", order.id);

      await this.emit("ORDER", order.id, newStatus === "FILLED" ? "ORDER_FILLED" : "ORDER_PARTIAL_FILL", {
        fill_id: fillId,
        fill_qty: fillQty,
        fill_price: fillPrice,
        fee,
      });

      // If entry order filled → open position + create brackets
      if (order.meta?.entry_order && order.position_id) {
        await this.openPosition(order.position_id, avgPrice, newFilled, newStatus === "FILLED");
      }
    }
  }

  private triggers(order: any): boolean {
    const c = this.candle;
    const side = order.side as string;
    switch (order.order_type) {
      case "MARKET":
        return true;
      case "LIMIT":
        return side === "LONG" || side === "BUY"
          ? c.low <= (order.limit_price ?? Infinity)
          : c.high >= (order.limit_price ?? 0);
      case "STOP":
      case "STOP_LOSS":
        return side === "LONG" || side === "BUY"
          ? c.high >= (order.stop_price ?? Infinity)
          : c.low <= (order.stop_price ?? 0);
      case "TAKE_PROFIT":
        return side === "LONG" || side === "BUY"
          ? c.high >= (order.limit_price ?? Infinity)
          : c.low <= (order.limit_price ?? 0);
      default:
        return false;
    }
  }

  private fillPrice(order: any): number {
    const c = this.candle;
    let base: number;
    switch (order.order_type) {
      case "MARKET":
        base = c.open;
        break;
      case "LIMIT":
      case "TAKE_PROFIT":
        base = order.limit_price ?? c.close;
        break;
      case "STOP":
      case "STOP_LOSS":
        base = order.stop_price ?? c.close;
        break;
      default:
        base = c.close;
    }
    const slip = this.policy.slippage_bps / 10_000;
    const side = order.side as string;
    return side === "LONG" || side === "BUY" ? base * (1 + slip) : base * (1 - slip);
  }

  private async openPosition(
    posId: string,
    avgPrice: number,
    qty: number,
    entryComplete: boolean,
  ) {
    const { data: pos } = await this.sb
      .from("paper_positions")
      .select("*")
      .eq("id", posId)
      .single();
    if (!pos) return;

    const isFirst = pos.status === "PENDING_ENTRY";
    await this.sb
      .from("paper_positions")
      .update({
        status: "OPEN",
        entry_price: avgPrice,
        qty,
        filled_at: isFirst ? this.candle.ts : pos.filled_at,
      })
      .eq("id", posId);

    await this.emit("POSITION", posId, isFirst ? "POSITION_OPENED" : "POSITION_UPDATED", {
      entry_price: avgPrice,
      qty,
    });

    // ── Hook B: Attribution + context snapshots on fill ──
    if (isFirst && pos.decision_id) {
      insertAttributionForPosition({ position_id: posId, decision_id: pos.decision_id })
        .then(r => console.log("[attribution-fill]", posId, r))
        .catch(e => console.warn("[attribution-fill] failed:", e.message));

      // Fire context snapshots with position_id
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${svcKey}` };
      const base = { symbol: this.symbol, position_id: posId, decision_id: pos.decision_id };
      const notionalUsd = avgPrice * qty;
      Promise.allSettled([
        fetch(`${supabaseUrl}/functions/v1/market-context-snap`, { method: "POST", headers, body: JSON.stringify(base) }),
        fetch(`${supabaseUrl}/functions/v1/derivatives-context-snap`, { method: "POST", headers, body: JSON.stringify(base) }),
        fetch(`${supabaseUrl}/functions/v1/execution-cost-snap`, { method: "POST", headers, body: JSON.stringify({ ...base, notional_usd: notionalUsd, side: pos.side }) }),
      ]).catch(e => console.warn("[ctx-snap-fill] failed:", e.message));
    }

    if (entryComplete) {
      await this.createBrackets(pos, avgPrice);
    }
  }

  // ─── Stage 4: Bracket orders ─────────────────────────────────────────

  private async createBrackets(pos: any, entryPrice: number) {
    // Idempotency
    const { data: existing } = await this.sb
      .from("paper_orders")
      .select("id")
      .eq("position_id", pos.id)
      .eq("reduce_only", true)
      .limit(1);
    if (existing?.length) return;

    const ocoId = crypto.randomUUID();
    const tfMs = this.tfMs(pos.timeframe);
    const eligibleCloseAt = new Date(
      new Date(this.candle.ts).getTime() + tfMs,
    ).toISOString();

    const exitSide = pos.side === "LONG" ? "SHORT" : "LONG";
    const tpId = crypto.randomUUID();
    const slId = crypto.randomUUID();

    // TP order
    await this.sb.from("paper_orders").insert({
      id: tpId,
      run_id: this.runId,
      policy_id: this.policy.id,
      symbol: pos.symbol,
      side: exitSide,
      order_type: "TAKE_PROFIT",
      qty: pos.qty,
      limit_price: pos.tp_price,
      status: "NEW",
      placed_at: new Date().toISOString(),
      eligible_fill_at: eligibleCloseAt,
      oco_group_id: ocoId,
      reduce_only: true,
      position_id: pos.id,
      meta: { bracket: "TP", entry_candle: this.candle.ts },
    });

    // SL order
    await this.sb.from("paper_orders").insert({
      id: slId,
      run_id: this.runId,
      policy_id: this.policy.id,
      symbol: pos.symbol,
      side: exitSide,
      order_type: "STOP_LOSS",
      qty: pos.qty,
      stop_price: pos.stop_price,
      status: "NEW",
      placed_at: new Date().toISOString(),
      eligible_fill_at: eligibleCloseAt,
      oco_group_id: ocoId,
      reduce_only: true,
      position_id: pos.id,
      meta: { bracket: "SL", entry_candle: this.candle.ts },
    });

    await this.sb
      .from("paper_positions")
      .update({
        tp_order_id: tpId,
        sl_order_id: slId,
        eligible_close_at: eligibleCloseAt,
      })
      .eq("id", pos.id);

    await this.emit("POSITION", pos.id, "BRACKET_SUBMITTED", {
      oco_group_id: ocoId,
      tp_order_id: tpId,
      sl_order_id: slId,
      eligible_close_at: eligibleCloseAt,
      tp_price: pos.tp_price,
      sl_price: pos.stop_price,
    });
  }

  private tfMs(tf: string): number {
    const map: Record<string, number> = {
      "1m": 60_000,
      "5m": 300_000,
      "15m": 900_000,
      "30m": 1_800_000,
      "1h": 3_600_000,
      "4h": 14_400_000,
      "1d": 86_400_000,
    };
    return map[tf] || 60_000;
  }

  // ─── Stage 5: Bracket fills + OCO ────────────────────────────────────

  async evalBrackets() {
    const { data: brackets } = await this.sb
      .from("paper_orders")
      .select("*")
      .eq("symbol", this.symbol)
      .eq("reduce_only", true)
      .in("status", ["NEW", "PARTIAL"])
      .lte("eligible_fill_at", this.candle.ts);

    if (!brackets?.length) return;

    // Group by OCO
    const groups: Record<string, any[]> = {};
    for (const o of brackets) {
      if (!o.oco_group_id) continue;
      (groups[o.oco_group_id] ??= []).push(o);
    }

    for (const [ocoId, orders] of Object.entries(groups)) {
      const tp = orders.find((o: any) => o.meta?.bracket === "TP");
      const sl = orders.find((o: any) => o.meta?.bracket === "SL");
      if (!tp || !sl) continue;

      const tpHit = this.triggers(tp);
      const slHit = this.triggers(sl);

      let filled: any = null;
      let canceled: any = null;

      if (tpHit && slHit) {
        // Both triggered same candle — use policy
        if (this.policy.worst_case_same_candle) {
          filled = sl;
          canceled = tp;
        } else {
          filled = tp;
          canceled = sl;
        }
        await this.emit("ENGINE", null, "SAME_CANDLE_TP_SL", {
          oco_group_id: ocoId,
          rule: this.policy.worst_case_same_candle ? "SL_first" : "TP_first",
        });
      } else if (tpHit) {
        filled = tp;
        canceled = sl;
      } else if (slHit) {
        filled = sl;
        canceled = tp;
      }

      if (!filled || !canceled) continue;

      // Fill the triggered bracket
      const price = this.fillPrice(filled);
      const fee = (filled.qty * price * this.policy.fee_bps) / 10_000;
      const fillId = crypto.randomUUID();

      await this.sb.from("paper_fills").insert({
        id: fillId,
        order_id: filled.id,
        position_id: filled.position_id,
        filled_qty: filled.qty,
        fill_price: price,
        fee_paid: fee,
        slippage_paid:
          Math.abs(price - (filled.limit_price || filled.stop_price || price)) * filled.qty,
        ts: this.candle.ts,
        meta: { bracket_fill: true, bracket: filled.meta?.bracket },
      });

      await this.sb
        .from("paper_orders")
        .update({ status: "FILLED", filled_qty: filled.qty, avg_fill_price: price })
        .eq("id", filled.id);

      await this.emit("ORDER", filled.id, "ORDER_FILLED", {
        bracket: filled.meta?.bracket,
        fill_price: price,
      });

      // Cancel sibling
      await this.sb.from("paper_orders").update({ status: "CANCELED" }).eq("id", canceled.id);
      await this.emit("ORDER", canceled.id, "OCO_CANCELED", {
        oco_group_id: ocoId,
        reason: "sibling_filled",
      });

      // Close position
      if (filled.position_id) {
        await this.closePosition(filled.position_id, price, filled.meta?.bracket || "UNKNOWN");
      }
    }
  }

  // ─── Stage 6: Position closure ───────────────────────────────────────

  private async closePosition(posId: string, exitPrice: number, reason: string) {
    const { data: pos } = await this.sb
      .from("paper_positions")
      .select("*")
      .eq("id", posId)
      .single();

    if (!pos || pos.status === "CLOSED") return;

    const entry = Number(pos.entry_price);
    const pnl =
      pos.side === "LONG"
        ? (exitPrice - entry) * pos.qty
        : (entry - exitPrice) * pos.qty;

    const risk =
      pos.side === "LONG"
        ? Math.abs(entry - Number(pos.stop_price)) * pos.qty
        : Math.abs(Number(pos.stop_price) - entry) * pos.qty;
    const realizedR = risk > 0 ? pnl / risk : 0;
    const realizedPct = entry > 0 ? (pnl / (entry * pos.qty)) * 100 : 0;
    const outcomeLabel = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";

    await this.sb
      .from("paper_positions")
      .update({
        status: "CLOSED",
        exit_price: exitPrice,
        closed_at: this.candle.ts,
        close_reason: reason,
        realized_pnl: pnl,
        realized_r: realizedR,
        realized_pct: realizedPct,
        outcome_label: outcomeLabel,
      })
      .eq("id", posId);

    // Mark decision complete
    if (pos.decision_id) {
      await this.sb
        .from("paper_decisions")
        .update({ engine_status: "COMPLETE" })
        .eq("id", pos.decision_id);
    }

    await this.emit("POSITION", posId, "POSITION_CLOSED", {
      exit_price: exitPrice,
      close_reason: reason,
      realized_pnl: pnl,
      realized_r: realizedR,
      outcome_label: outcomeLabel,
      duration_ms: pos.filled_at
        ? new Date(this.candle.ts).getTime() - new Date(pos.filled_at).getTime()
        : null,
    });
  }

  // ─── Stage 7: Expiry handling ────────────────────────────────────────

  async handleExpiries() {
    const { data: expired } = await this.sb
      .from("paper_positions")
      .select("*")
      .eq("symbol", this.symbol)
      .in("status", ["PENDING_ENTRY", "OPEN"])
      .lte("expires_at", this.candle.ts);

    if (!expired?.length) return;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const pos of expired) {
      if (pos.status === "OPEN") {
        await this.closePosition(pos.id, this.candle.close, "EXPIRY");
      } else {
        // Cancel unfilled entry
        await this.sb
          .from("paper_positions")
          .update({
            status: "CANCELED",
            close_reason: "EXPIRED_ENTRY",
            closed_at: this.candle.ts,
            expired_at: this.candle.ts,
            expiry_reason: "EXPIRED_NO_FILL",
            realized_pnl: 0,
          })
          .eq("id", pos.id);

        // Cancel entry order
        if (pos.entry_order_id) {
          await this.sb
            .from("paper_orders")
            .update({ status: "CANCELED" })
            .eq("id", pos.entry_order_id);
        }

        // Learning ledger (idempotent via unique index)
        await this.sb.from("learning_ledger").upsert({
          position_id: pos.id,
          decision_id: pos.decision_id ?? null,
          asset_id: pos.symbol,
          outcome_type: "EXPIRED_NO_FILL",
          realized_pnl: 0,
          scenario_keys: [],
          metadata: { expiry_reason: "EXPIRED_NO_FILL", candle_ts: this.candle.ts },
        }, { onConflict: "position_id" });

        // Scenario reputation update (non-blocking)
        fetch(`${supabaseUrl}/functions/v1/scenario-reputation-update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${svcKey}` },
          body: JSON.stringify({ position_id: pos.id, outcome_type: "EXPIRED_NO_FILL" }),
        }).catch(e => console.warn("[expiry] reputation update failed:", e.message));

        // Mark decision terminal
        if (pos.decision_id) {
          await this.sb.from("paper_decisions")
            .update({ engine_status: "EXPIRED" })
            .eq("id", pos.decision_id);
        }

        await this.emit("POSITION", pos.id, "POSITION_EXPIRED", {
          status_when_expired: pos.status,
          expiry_reason: "EXPIRED_NO_FILL",
        });
      }
    }
  }

  // ─── Stage 8: Invariant checks ──────────────────────────────────────

  async checkInvariants() {
    const { data: openPos } = await this.sb
      .from("paper_positions")
      .select("side")
      .eq("symbol", this.symbol)
      .eq("status", "OPEN");

    if (openPos?.length) {
      const sides = new Set(openPos.map((p: any) => p.side));
      if (sides.has("LONG") && sides.has("SHORT")) {
        await this.emit("ENGINE", null, "INVARIANT_VIOLATION", {
          violation: "SIMULTANEOUS_LONG_SHORT",
          symbol: this.symbol,
        });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS: Live candle fetch from CryptoCompare
// ═══════════════════════════════════════════════════════════════════════════

function tfToCC(tf: string): { endpoint: string; aggregate: number } {
  switch (tf) {
    case "1m":  return { endpoint: "histominute", aggregate: 1 };
    case "5m":  return { endpoint: "histominute", aggregate: 5 };
    case "15m": return { endpoint: "histominute", aggregate: 15 };
    case "30m": return { endpoint: "histominute", aggregate: 30 };
    case "1h":  return { endpoint: "histohour", aggregate: 1 };
    case "4h":  return { endpoint: "histohour", aggregate: 4 };
    case "1d":  return { endpoint: "histoday", aggregate: 1 };
    default:    return { endpoint: "histohour", aggregate: 4 };
  }
}

async function fetchLatestCandle(symbol: string, timeframe: string): Promise<Candle | null> {
  const fsym = symbol.replace(/\/.*$/, "").toUpperCase(); // "BTC/USD" → "BTC"
  const { endpoint, aggregate } = tfToCC(timeframe);
  const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${fsym}&tsym=USD&limit=2&aggregate=${aggregate}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.Response !== "Success" || !json.Data?.Data?.length) return null;
    // Use the last complete candle (second-to-last if current is still forming)
    const candles = json.Data.Data;
    const k = candles.length >= 2 ? candles[candles.length - 2] : candles[candles.length - 1];
    return {
      ts: new Date(k.time * 1000).toISOString(),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volumefrom,
    };
  } catch (e) {
    console.error(`fetchLatestCandle(${symbol}, ${timeframe}):`, e);
    return null;
  }
}

// Run one symbol/timeframe tick
async function runSingleTick(
  sb: ReturnType<typeof createClient>,
  symbol: string,
  timeframe: string,
  candle: Candle,
  policy: any,
) {
  const engine = new PaperEngineCore(sb, symbol, timeframe, candle, policy);
  await engine.startTick();
  const { approved, rejected } = await engine.evaluateDecisions();
  await engine.createEntryOrders(approved);
  await engine.matchFills();
  await engine.evalBrackets();
  await engine.handleExpiries();
  await engine.checkInvariants();
  const stats = {
    decisions_evaluated: approved.length + rejected.length,
    decisions_approved: approved.length,
    decisions_rejected: rejected.length,
  };
  await engine.endTick(stats);
  return { run_id: engine.run_id, stats };
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HANDLER
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch active policy (shared by all modes)
    const { data: policy, error: pe } = await sb
      .from("paper_policy")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (pe || !policy) {
      return new Response(JSON.stringify({ error: "No active policy found" }), { status: 500, headers });
    }

    // Parse body once
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    // ── Mode 1: tick-all (cron) — auto-fetch candles for all incorporated assets
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || body.action;

    if (action === "tick-all") {
      const { data: assets } = await sb
        .from("incorporated_assets")
        .select("asset_id, default_timeframe")
        .eq("is_enabled", true);

      if (!assets?.length) {
        return new Response(JSON.stringify({ ok: true, message: "No enabled assets" }), { status: 200, headers });
      }

      const results: any[] = [];
      for (const asset of assets) {
        const candle = await fetchLatestCandle(asset.asset_id, asset.default_timeframe);
        if (!candle) {
          results.push({ asset: asset.asset_id, error: "candle_fetch_failed" });
          continue;
        }
        try {
          const r = await runSingleTick(sb, asset.asset_id, asset.default_timeframe, candle, policy);
          results.push({ asset: asset.asset_id, timeframe: asset.default_timeframe, ...r });
        } catch (e: any) {
          results.push({ asset: asset.asset_id, error: e.message });
        }
      }
      return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers });
    }

    // ── Mode 2: single tick (manual / explicit candle)
    const { symbol, timeframe, candle } = body;

    if (!symbol || !timeframe) {
      return new Response(
        JSON.stringify({ error: "Missing: symbol, timeframe (and candle for single mode)" }),
        { status: 400, headers },
      );
    }

    // Auto-fetch candle if not provided
    const resolvedCandle = candle || await fetchLatestCandle(symbol, timeframe);
    if (!resolvedCandle) {
      return new Response(
        JSON.stringify({ error: `Could not fetch candle for ${symbol}/${timeframe}` }),
        { status: 502, headers },
      );
    }

    const result = await runSingleTick(sb, symbol, timeframe, resolvedCandle, policy);
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers });
  } catch (err: any) {
    console.error("Engine tick error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
