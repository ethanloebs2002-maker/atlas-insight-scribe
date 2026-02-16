// ─── Shared whale constants & helpers ────────────────────────────────────

export const ELITE_CRITERIA = {
  min_win_rate: 0.58,
  min_trade_count: 50,
  min_integrity_score: 0.70,
  min_attribution_confidence: 0.75,
  max_hold_time_hours: 72,
  min_recent_activity_days: 30,
};

export const TIMEFRAME_LOOKBACK: Record<string, number> = {
  "1m": 2, "5m": 6, "15m": 12, "1h": 24, "4h": 48,
  "24h": 168, "3d": 336, "1w": 720,
};

export interface WhaleWallet {
  id: string;
  wallet_address: string;
  asset_id: string;
  lot_win_rate: number;
  realized_pnl_usd: number;
  trade_count: number;
  avg_hold_time_hours: number | null;
  avg_position_size_usd: number | null;
  integrity_score: number;
  attribution_confidence: number;
  consistency_score: number | null;
  is_active: boolean;
  is_elite: boolean;
  tier: number;
  label: string | null;
  source: string | null;
}

export interface WhalePosition {
  id: string;
  whale_wallet_id: string;
  asset_id: string;
  side: string;
  size_usd: number;
  entry_price: number;
  exit_price: number | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  pnl_usd: number | null;
  source: string | null;
  confidence: number | null;
  chain: string | null;
  tx_hash: string | null;
}

export function isElite(w: WhaleWallet): boolean {
  return (
    w.lot_win_rate >= ELITE_CRITERIA.min_win_rate &&
    w.trade_count >= ELITE_CRITERIA.min_trade_count &&
    w.integrity_score >= ELITE_CRITERIA.min_integrity_score &&
    w.attribution_confidence >= ELITE_CRITERIA.min_attribution_confidence &&
    w.is_active === true
  );
}

export function confidenceTier(c: number): "HIGH" | "MEDIUM" | "LOW" {
  if (c >= 0.75) return "HIGH";
  if (c >= 0.5) return "MEDIUM";
  return "LOW";
}

export function formatHoldTime(hours: number | null): string {
  if (!hours) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
