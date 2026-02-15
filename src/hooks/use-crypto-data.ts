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

interface ChartDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20: number | null;
  ema50: number | null;
}

interface AnalysisResponse {
  data: {
    asset: AssetOverview;
    scenarios: ScenarioData[];
    consensus: ConsensusData;
    chartData?: ChartDataPoint[];
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

async function fetchAnalysis(symbol: string, timeframe: string = '4h') {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-data?action=analysis&symbols=${symbol}&timeframe=${timeframe}`;
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

export function useAssetAnalysis(symbol: string, timeframe: string = '4h') {
  return useQuery({
    queryKey: ['asset-analysis', symbol, timeframe],
    queryFn: () => fetchAnalysis(symbol, timeframe),
    refetchInterval: timeframe === '1m' ? 30_000 : timeframe === '5m' ? 60_000 : 120_000,
    staleTime: timeframe === '1m' ? 15_000 : timeframe === '5m' ? 30_000 : 60_000,
    enabled: !!symbol,
  });
}
