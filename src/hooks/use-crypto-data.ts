import { useQuery } from '@tanstack/react-query';
import type { AssetOverview, ScenarioData, ConsensusData, EvidenceRow } from '@/types/atlas';

interface MarketDataResponse {
  data: {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    volume24h: number;
    marketCap: number;
    high24h: number;
    low24h: number;
  }[];
  source: string;
  timestamp: number;
}

interface AnalysisResponse {
  data: {
    asset: AssetOverview;
    scenarios: ScenarioData[];
    consensus: ConsensusData;
  };
  source: string;
  timestamp: number;
}

async function fetchMarketData(symbols: string[]): Promise<AssetOverview[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-data?action=market&symbols=${symbols.join(',')}`;
  const res = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Market data fetch failed: ${res.status}`);
  const json: MarketDataResponse = await res.json();

  return json.data.map(d => ({
    symbol: d.symbol,
    name: d.name,
    price: d.price,
    change24h: d.change24h,
    volume24h: d.volume24h,
    marketCap: d.marketCap,
    regime: 'Trending' as const, // Will be overridden by analysis
  }));
}

async function fetchAnalysis(symbol: string) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-data?action=analysis&symbols=${symbol}`;
  const res = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Analysis fetch failed: ${res.status}`);
  const json: AnalysisResponse = await res.json();
  return json.data;
}

export function useMarketData(symbols: string[] = ['BTC', 'ETH', 'SOL', 'DOGE', 'AVAX', 'LINK']) {
  return useQuery({
    queryKey: ['market-data', symbols.join(',')],
    queryFn: () => fetchMarketData(symbols),
    refetchInterval: 60_000, // Refresh every minute
    staleTime: 30_000,
  });
}

export function useAssetAnalysis(symbol: string) {
  return useQuery({
    queryKey: ['asset-analysis', symbol],
    queryFn: () => fetchAnalysis(symbol),
    refetchInterval: 120_000, // Refresh every 2 minutes
    staleTime: 60_000,
    enabled: !!symbol,
  });
}
