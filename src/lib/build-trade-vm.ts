import type { TradeVM, UIStatus, PriceLevel } from "@/types/trade-vm";
import { routeScenarioWindow } from "@/lib/horizon-router";

/** Raw decision row from paper_decisions */
interface DecisionRow {
  id: string;
  asset_id: string;
  timeframe: string;
  horizon: string;
  direction_pred: string;
  probability_pred: number;
  probability_source?: string | null;
  ref_price: number;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  engine_status: string;
  emitted_at?: string | null;
  ts: string;
  evidence_snapshot_json?: any;
  consensus_score?: number;
}

/** Raw position row from paper_positions */
interface PositionRow {
  id: string;
  decision_id?: string | null;
  symbol: string;
  side: string;
  status: string;
  entry_price?: number | null;
  exit_price?: number | null;
  stop_price?: number | null;
  tp_price?: number | null;
  filled_at?: string | null;
  closed_at?: string | null;
  expires_at?: string | null;
  close_reason?: string | null;
  realized_pnl?: number | null;
  realized_r?: number | null;
  realized_pct?: number | null;
  outcome_label?: string | null;
  horizon: string;
  timeframe: string;
  created_at: string;
  meta?: any;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function deriveStatus(decision: DecisionRow, position?: PositionRow | null): UIStatus {
  if (!position) {
    return decision.engine_status === "EXECUTING" ? "PENDING_ENTRY" : "PROPOSED";
  }
  if (position.status === "CLOSED") return "CLOSED";
  if (position.status === "OPEN") return "OPEN";
  // PENDING_ENTRY, PENDING_FILL, etc.
  return "PENDING_ENTRY";
}

function outcomeFromReason(reason?: string | null): "TP" | "SL" | "EXPIRY" | "CANCELED" | null {
  if (!reason) return null;
  const r = reason.toUpperCase();
  if (r.includes("TP") || r.includes("TARGET")) return "TP";
  if (r.includes("SL") || r.includes("STOP")) return "SL";
  if (r.includes("EXPIR")) return "EXPIRY";
  if (r.includes("CANCEL")) return "CANCELED";
  return null;
}

export function buildTradeVM(
  decision: DecisionRow,
  position?: PositionRow | null,
  livePrice?: number | null,
): TradeVM {
  const status = deriveStatus(decision, position);
  const side: "LONG" | "SHORT" =
    decision.direction_pred === "DOWN" ? "SHORT" : "LONG";

  // --- Prices ---
  const decisionEntry = num(decision.entry_price) ?? num(decision.ref_price);
  const filledEntry = position ? num(position.entry_price) : null;
  const tp = position ? num(position.tp_price) : num(decision.take_profit);
  const sl = position ? num(position.stop_price) : num(decision.stop_loss);
  const exitPrice = position ? num(position.exit_price) : null;

  // --- Entry level ---
  const hasFilledEntry = filledEntry != null;
  let entrySourceReason: string;

  const entryLevel: PriceLevel = hasFilledEntry
    ? { value: filledEntry, label: "Filled Entry", source: "FILL", kind: "ENTRY", style: "solid" }
    : { value: decisionEntry, label: "Planned Entry", source: "DECISION", kind: "ENTRY", style: "dashed" };

  if (hasFilledEntry) {
    entrySourceReason = "position.entry_price used as filled entry";
  } else if (num(decision.entry_price) != null) {
    entrySourceReason = "decision.entry_price used (no fill yet)";
  } else {
    entrySourceReason = "decision.ref_price used as fallback (entry_price null)";
  }

  // --- TP level ---
  const tpLevel: PriceLevel = {
    value: tp,
    label: tp != null ? "Take Profit" : "TP (unknown)",
    source: position?.tp_price != null ? "ORDER" : "DECISION",
    kind: "TP",
    style: tp != null ? "solid" : "ghost",
  };

  // --- SL level ---
  const slLevel: PriceLevel = {
    value: sl,
    label: sl != null ? "Stop Loss" : "SL (unknown)",
    source: position?.stop_price != null ? "ORDER" : "DECISION",
    kind: "SL",
    style: sl != null ? "solid" : "ghost",
  };

  // --- Live level ---
  const liveLevel: PriceLevel = {
    value: livePrice ?? null,
    label: "Live",
    source: "MARKET",
    kind: "LIVE",
    style: livePrice != null ? "solid" : "ghost",
  };

  // --- Exit level ---
  const exitLevel: PriceLevel | undefined =
    exitPrice != null
      ? { value: exitPrice, label: "Exit", source: "FILL", kind: "EXIT", style: "solid" }
      : undefined;

  // --- Probability ---
  const isFallback = decision.probability_pred <= 0.31 && !decision.probability_source;
  const probSource =
    decision.probability_source ?? (isFallback ? "fallback" : "model");

  // --- Timestamps ---
  const timestamps: TradeVM["timestamps"] = {
    decidedAt: decision.emitted_at ?? decision.ts,
    entryPlacedAt: position?.created_at ?? null,
    entryFilledAt: position?.filled_at ?? null,
    closedAt: position?.closed_at ?? null,
    expiresAt: position?.expires_at ?? null,
  };

  // --- Performance ---
  const performance: TradeVM["performance"] =
    status === "CLOSED" && position
      ? {
          realizedPnL: num(position.realized_pnl),
          realizedR: num(position.realized_r),
          outcome: outcomeFromReason(position.close_reason),
        }
      : undefined;

  // --- Resolution window ---
  const regime = decision.evidence_snapshot_json?.regime as string | undefined;
  const scenarioWindow = routeScenarioWindow({
    timeframe: decision.timeframe,
    direction: side === "SHORT" ? "SHORT" : "LONG",
    regime: (regime === "TRENDING" || regime === "CHOPPY" || regime === "TRANSITIONAL")
      ? regime : undefined,
  });
  const derivedFrom = `${decision.timeframe} × ${regime ?? "—"} × ${side}`;

  return {
    id: position?.id ?? decision.id,
    decisionId: decision.id,
    symbol: decision.asset_id,
    timeframe: decision.timeframe,
    horizon: decision.horizon,
    side,
    status,
    probability: {
      initial: decision.probability_pred,
      displayPct: Math.round(decision.probability_pred * 100),
      source: probSource,
    },
    timestamps,
    prices: {
      plannedEntry: decisionEntry,
      filledEntry,
      live: livePrice ?? null,
      tp,
      sl,
      exit: exitPrice,
    },
    levels: {
      entry: entryLevel,
      tp: tpLevel,
      sl: slLevel,
      live: liveLevel,
      ...(exitLevel ? { exit: exitLevel } : {}),
    },
    resolutionWindow: {
      minMinutes: scenarioWindow.minMinutes,
      maxMinutes: scenarioWindow.maxMinutes,
      label: scenarioWindow.label,
      derivedFrom,
    },
    performance,
    debug: {
      entrySourceReason,
      gating: decision.evidence_snapshot_json?.gating ?? undefined,
    },
  };
}
