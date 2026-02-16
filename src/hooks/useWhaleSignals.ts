import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhaleWalletRow {
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
  last_trade_ts: string | null;
}

export interface WhaleSignalRow {
  id: string;
  asset_id: string;
  timeframe: string;
  direction: string;
  confidence: number;
  whale_count: number;
  elite_whale_count: number;
  net_bias: number;
  avg_whale_win_rate: number;
  avg_whale_integrity: number;
  total_position_size_usd: number;
  long_position_size_usd: number;
  short_position_size_usd: number;
  top_whales_json: any;
  computed_at: string;
  lookback_hours: number;
}

export interface WhaleEventRow {
  id: string;
  asset_id: string;
  event_type: string;
  source: string;
  whale_wallet_id: string | null;
  direction: string | null;
  size_usd: number | null;
  confidence: number | null;
  details_json: Record<string, any>;
  chain: string | null;
  tx_hash: string | null;
  created_at: string;
}

// Fetch elite whale wallets for an asset
export function useWhaleWallets(assetId: string) {
  return useQuery({
    queryKey: ['whale-wallets', assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whale_wallets' as any)
        .select('*')
        .eq('asset_id', assetId)
        .eq('is_active', true)
        .order('lot_win_rate', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as WhaleWalletRow[];
    },
    enabled: !!assetId,
    staleTime: 60_000,
  });
}

// Fetch latest whale signal for an asset + timeframe
export function useWhaleSignal(assetId: string, timeframe = '4h') {
  return useQuery({
    queryKey: ['whale-signal', assetId, timeframe],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whale_signals' as any)
        .select('*')
        .eq('asset_id', assetId)
        .eq('timeframe', timeframe)
        .order('computed_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data || [])[0] || null) as unknown as WhaleSignalRow | null;
    },
    enabled: !!assetId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// Fetch recent whale watch events
export function useWhaleEvents(assetId?: string, limit = 50) {
  return useQuery({
    queryKey: ['whale-events', assetId, limit],
    queryFn: async () => {
      let query = supabase
        .from('whale_watch_events' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (assetId) {
        query = query.eq('asset_id', assetId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as WhaleEventRow[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// Trigger a whale signal computation
export function useTriggerWhaleSignal() {
  return async (asset: string, timeframe = '4h') => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whale-signal?asset=${asset}&timeframe=${timeframe}`;
    const res = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`Whale signal failed: ${res.status}`);
    return res.json();
  };
}

// Trigger exchange scan
export function useTriggerExchangeScan() {
  return async (asset: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whale-exchange-scan?asset=${asset}`;
    const res = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`Exchange scan failed: ${res.status}`);
    return res.json();
  };
}

// Trigger on-chain scan
export function useTriggerOnchainScan() {
  return async (asset: string, chain?: string) => {
    let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whale-onchain-scan?asset=${asset}`;
    if (chain) url += `&chain=${chain}`;
    const res = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`On-chain scan failed: ${res.status}`);
    return res.json();
  };
}
