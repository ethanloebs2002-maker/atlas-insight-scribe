// ═══════════════════════════════════════════════════════════════════
// Risk Lab — Canonical Risk Profile Selector
// No external fetches. Uses only passed-in data.
// ═══════════════════════════════════════════════════════════════════

export interface RiskVariant {
  key: string;      // e.g. "atr_1p2"
  label: string;    // e.g. "tight"
  model: "atr";
  atr_mult: number;
}

export interface RiskPolicyConfig {
  risk_lab_enabled: boolean;
  risk_lab_variants: number;
  risk_lab_atr_mults: number[];
  risk_lab_mode: string;
  risk_lab_min_trades: number;
  risk_lab_decay: number;
  risk_lab_champion_bias: number;
  risk_lab_explore_bias: number;
}

export interface RiskPerfRow {
  risk_profile_key: string;
  trades: number;
  wins: number;
  win_rate: number;
  avg_r: number;
  sum_pnl: number;
}

const LABEL_MAP: Record<string, string> = {};

function multToKey(mult: number): string {
  return `atr_${mult.toFixed(1).replace(".", "p")}`;
}

function multToLabel(mult: number): string {
  if (mult <= 1.3) return "tight";
  if (mult <= 1.7) return "medium";
  return "loose";
}

/** Returns configured risk variants from policy. */
export function getRiskVariants(policy: RiskPolicyConfig): RiskVariant[] {
  const mults = policy.risk_lab_atr_mults ?? [1.2, 1.6, 2.0];
  const count = Math.min(policy.risk_lab_variants ?? 3, mults.length);
  return mults.slice(0, count).map((m) => ({
    key: multToKey(m),
    label: multToLabel(m),
    model: "atr" as const,
    atr_mult: m,
  }));
}

/** Choose a risk variant using champion-bias or uniform exploration. */
export function chooseRiskVariant(opts: {
  symbol: string;
  timeframe: string;
  regime: string;
  spread_bucket: string;
  policyRow: RiskPolicyConfig;
  performanceRows: RiskPerfRow[];
}): RiskVariant {
  const variants = getRiskVariants(opts.policyRow);
  if (variants.length === 0) {
    return { key: "atr_1p6", label: "medium", model: "atr", atr_mult: 1.6 };
  }
  if (variants.length === 1) return variants[0];

  const minTrades = opts.policyRow.risk_lab_min_trades ?? 12;

  // Check if all variants have enough data
  const perfMap = new Map(opts.performanceRows.map((r) => [r.risk_profile_key, r]));
  const allSufficient = variants.every((v) => {
    const perf = perfMap.get(v.key);
    return perf && perf.trades >= minTrades;
  });

  if (!allSufficient) {
    // Explore uniformly
    return variants[Math.floor(Math.random() * variants.length)];
  }

  // Find champion (highest avg_r, break ties by win_rate)
  let champion = variants[0];
  let bestScore = -Infinity;
  for (const v of variants) {
    const perf = perfMap.get(v.key);
    if (!perf) continue;
    const score = perf.avg_r * 1000 + perf.win_rate;
    if (score > bestScore) {
      bestScore = score;
      champion = v;
    }
  }

  // Champion bias
  const bias = opts.policyRow.risk_lab_champion_bias ?? 0.65;
  if (Math.random() < bias) return champion;

  // Explore among non-champions
  const others = variants.filter((v) => v.key !== champion.key);
  return others[Math.floor(Math.random() * others.length)] ?? champion;
}

/** Classify spread into bucket. */
export function spreadBucket(spreadBps: number | null | undefined): "tight" | "normal" | "wide" {
  if (spreadBps == null) return "normal";
  if (spreadBps <= 2) return "tight";
  if (spreadBps <= 15) return "normal";
  return "wide";
}

/** Build risk_profile jsonb for a variant. */
export function buildRiskProfile(variant: RiskVariant): Record<string, unknown> {
  return {
    model: variant.model,
    atr_mult: variant.atr_mult,
    label: variant.label,
    key: variant.key,
  };
}
