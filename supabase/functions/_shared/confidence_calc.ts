/**
 * Shared confidence calculation for Edge Functions.
 * Mirrors src/lib/confidence.ts for backend use.
 * BACKBONE-SAFE: No external fetches.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeExecutionP(opts: {
  side: string;
  entryPrice: number;
  bid: number;
  ask: number;
  spreadBps: number;
  stalenessMs: number;
  staleMsExec: number;
}): { executionP: number; staleBlocked: boolean; distPct: number } {
  const { side, entryPrice, bid, ask, spreadBps, stalenessMs, staleMsExec } = opts;

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

export function computeFinalConfidence(beliefP: number, qualityQ: number, executionP: number): number {
  return clamp(beliefP * clamp(qualityQ, 0.25, 1) * clamp(executionP, 0.1, 1), 0, 1);
}
