/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATLAS CONFIDENCE v1 — Canonical Confidence Calculation Module
 *
 * Decomposes confidence into:
 *   - Belief confidence: how strongly consensus thinks direction is correct
 *   - Execution confidence: how likely the entry will fill given microstructure
 *   - Final confidence = belief_p * qualityQ * execution_p (clamped)
 *
 * BACKBONE-SAFE: No external market fetches. All market data must be
 * passed in from canonical tables (latest_orderbook + latest_prices).
 * ═══════════════════════════════════════════════════════════════════════════
 */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute execution probability based on distance from touch price,
 * spread width, and data staleness.
 */
export function computeExecutionP(opts: {
  side: "LONG" | "SHORT";
  entryPrice: number;
  bid: number;
  ask: number;
  spreadBps: number;
  stalenessMs: number;
  staleMsExec: number;
}): { executionP: number; staleBlocked: boolean; distPct: number } {
  const { side, entryPrice, bid, ask, spreadBps, stalenessMs, staleMsExec } = opts;

  // Staleness gate
  if (stalenessMs > staleMsExec) {
    return { executionP: 0, staleBlocked: true, distPct: 0 };
  }

  // Touch price: LONG touches at ask, SHORT touches at bid
  const touch = side === "LONG" ? ask : bid;

  // Distance from touch
  let distPct: number;
  if (side === "LONG") {
    distPct = entryPrice <= touch ? Math.max(0, (touch - entryPrice) / touch) : 0;
  } else {
    distPct = entryPrice >= touch ? Math.max(0, (entryPrice - touch) / touch) : 0;
  }

  // Map distPct → base execution probability
  let baseExecP: number;
  if (distPct <= 0.0005) baseExecP = 0.95 + (0.05 * (1 - distPct / 0.0005));
  else if (distPct <= 0.0015) baseExecP = 0.75 + 0.20 * (1 - (distPct - 0.0005) / 0.001);
  else if (distPct <= 0.003) baseExecP = 0.45 + 0.30 * (1 - (distPct - 0.0015) / 0.0015);
  else baseExecP = 0.15;

  // Spread multiplier: wider spread = harder to fill tight limits
  const spreadMult = spreadBps <= 5 ? 1.0
    : spreadBps <= 15 ? 0.95
    : spreadBps <= 30 ? 0.85
    : spreadBps <= 60 ? 0.70
    : 0.55;

  const executionP = clamp(baseExecP * spreadMult, 0.05, 1.0);
  return { executionP, staleBlocked: false, distPct };
}

/**
 * Compute final confidence from belief, quality modifier, and execution probability.
 * confidence_p = clamp(belief_p * clamp(qualityQ, 0.25, 1) * clamp(execution_p, 0.1, 1), 0, 1)
 */
export function computeFinalConfidence(
  beliefP: number,
  qualityQ: number,
  executionP: number,
): number {
  return clamp(
    beliefP * clamp(qualityQ, 0.25, 1) * clamp(executionP, 0.1, 1),
    0,
    1,
  );
}

export interface ConfidenceExplain {
  belief_p: number;
  belief_source: string;
  quality_q: number;
  quality_source: string;
  execution_p: number;
  execution_dist_pct: number;
  execution_stale_blocked: boolean;
  spread_bps: number;
  staleness_ms: number;
  confidence_p: number;
  side: string;
  entry_price: number;
  touch_price: number;
  bid: number;
  ask: number;
  computed_at: string;
}

/**
 * Full confidence computation with explanation payload.
 */
export function explainConfidence(opts: {
  side: "LONG" | "SHORT";
  entryPrice: number;
  bid: number;
  ask: number;
  spreadBps: number;
  stalenessMs: number;
  staleMsExec: number;
  beliefP: number;
  beliefSource?: string;
  qualityQ: number;
  qualitySource?: string;
}): ConfidenceExplain {
  const exec = computeExecutionP({
    side: opts.side,
    entryPrice: opts.entryPrice,
    bid: opts.bid,
    ask: opts.ask,
    spreadBps: opts.spreadBps,
    stalenessMs: opts.stalenessMs,
    staleMsExec: opts.staleMsExec,
  });

  const confidenceP = exec.staleBlocked
    ? 0
    : computeFinalConfidence(opts.beliefP, opts.qualityQ, exec.executionP);

  const touch = opts.side === "LONG" ? opts.ask : opts.bid;

  return {
    belief_p: opts.beliefP,
    belief_source: opts.beliefSource ?? "consensus",
    quality_q: opts.qualityQ,
    quality_source: opts.qualitySource ?? "scenario_reputation",
    execution_p: exec.executionP,
    execution_dist_pct: exec.distPct,
    execution_stale_blocked: exec.staleBlocked,
    spread_bps: opts.spreadBps,
    staleness_ms: opts.stalenessMs,
    confidence_p: confidenceP,
    side: opts.side,
    entry_price: opts.entryPrice,
    touch_price: touch,
    bid: opts.bid,
    ask: opts.ask,
    computed_at: new Date().toISOString(),
  };
}
