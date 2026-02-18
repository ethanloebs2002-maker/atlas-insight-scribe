import type { TradeVM, UIStatus, PriceLevel } from "@/types/trade-vm";
import { routeScenarioWindow } from "@/lib/horizon-router";

// Re-export for convenience
export type { TradeVM };

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
  const realizedPnL = position ? num(position.realized_pnl) : null;
  const realizedR = position ? num(position.realized_r) : null;
  const closeOutcome = outcomeFromReason(position?.close_reason);

  // Determine win/loss from realized PnL (canonical), fallback to price comparison
  let isWin: boolean | null = null;
  if (realizedPnL != null) {
    isWin = realizedPnL > 0;
  } else if (exitPrice != null && (filledEntry ?? decisionEntry) != null) {
    const entry = filledEntry ?? decisionEntry!;
    isWin = side === "LONG" ? exitPrice > entry : exitPrice < entry;
  }

  const performance: TradeVM["performance"] =
    status === "CLOSED" && position
      ? {
          realizedPnL,
          realizedR,
          outcome: closeOutcome,
          isWin,
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

/**
 * Build a TradeVM directly from a position row (position-first).
 * Used when the parent decision may not be in the fetched window.
 * Falls back to position-only data when decision is unavailable.
 */
export function buildTradeVMFromPosition(
  position: PositionRow,
  decision?: DecisionRow | null,
  livePrice?: number | null,
): TradeVM {
  // If we have the decision, use the canonical builder
  if (decision) {
    return buildTradeVM(decision, position, livePrice);
  }

  // Position-only VM
  const status: UIStatus =
    position.status === "CLOSED" ? "CLOSED" :
    position.status === "OPEN" ? "OPEN" : "PENDING_ENTRY";

  const side: "LONG" | "SHORT" = position.side === "SHORT" ? "SHORT" : "LONG";
  const entry = num(position.entry_price);
  const tp = num(position.tp_price);
  const sl = num(position.stop_price);
  const exitPrice = num(position.exit_price);

  const entryLevel: PriceLevel = entry != null
    ? { value: entry, label: "Filled Entry", source: "FILL", kind: "ENTRY", style: "solid" }
    : { value: null, label: "Entry (unknown)", source: "POSITION", kind: "ENTRY", style: "ghost" };

  const tpLevel: PriceLevel = { value: tp, label: tp != null ? "Take Profit" : "TP (unknown)", source: "ORDER", kind: "TP", style: tp != null ? "solid" : "ghost" };
  const slLevel: PriceLevel = { value: sl, label: sl != null ? "Stop Loss" : "SL (unknown)", source: "ORDER", kind: "SL", style: sl != null ? "solid" : "ghost" };
  const liveLevel: PriceLevel = { value: livePrice ?? null, label: "Live", source: "MARKET", kind: "LIVE", style: livePrice != null ? "solid" : "ghost" };
  const exitLevel: PriceLevel | undefined = exitPrice != null
    ? { value: exitPrice, label: "Exit", source: "FILL", kind: "EXIT", style: "solid" }
    : undefined;

  const realizedPnL = num(position.realized_pnl);
  const realizedR = num(position.realized_r);
  const closeOutcome = outcomeFromReason(position.close_reason);
  let isWin: boolean | null = null;
  if (realizedPnL != null) isWin = realizedPnL > 0;

  const performance: TradeVM["performance"] =
    status === "CLOSED"
      ? { realizedPnL, realizedR, outcome: closeOutcome, isWin }
      : undefined;

  return {
    id: position.id,
    decisionId: position.decision_id ?? position.id,
    symbol: position.symbol,
    timeframe: position.timeframe ?? "4h",
    horizon: position.horizon ?? "24h",
    side,
    status,
    probability: { initial: 0, displayPct: 0, source: "unavailable" },
    timestamps: {
      decidedAt: position.created_at,
      entryPlacedAt: position.created_at,
      entryFilledAt: position.filled_at ?? null,
      closedAt: position.closed_at ?? null,
      expiresAt: position.expires_at ?? null,
    },
    prices: { plannedEntry: entry, filledEntry: entry, live: livePrice ?? null, tp, sl, exit: exitPrice },
    levels: { entry: entryLevel, tp: tpLevel, sl: slLevel, live: liveLevel, ...(exitLevel ? { exit: exitLevel } : {}) },
    performance,
    debug: { entrySourceReason: "position-only VM (decision outside window)" },
  };
}
