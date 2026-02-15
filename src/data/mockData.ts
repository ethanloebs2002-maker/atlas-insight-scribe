import type { AssetOverview, ScenarioData, ConsensusData, WhaleEntry, EvidenceRow } from '@/types/atlas';
import { asProbability } from '@/types/probability';

const btcEvidence: EvidenceRow[] = [
  { signal: 'EMA 20/50 Cross', value: 'Bullish', interpretation: 'Golden cross on 4h', timeframe: '4h', weight: 0.8, source: 'Technical' },
  { signal: 'RSI', value: '58.3', interpretation: 'Neutral-bullish, room to run', timeframe: '4h', weight: 0.6, source: 'Technical' },
  { signal: 'MACD', value: '+142', interpretation: 'Positive momentum expanding', timeframe: '1d', weight: 0.7, source: 'Technical' },
  { signal: 'Funding Rate', value: '0.012%', interpretation: 'Slightly long-biased', timeframe: '8h', weight: 0.4, source: 'Derivatives' },
  { signal: 'OBV', value: 'Rising', interpretation: 'Volume confirming uptrend', timeframe: '4h', weight: 0.7, source: 'Volume' },
  { signal: 'ADX', value: '28.4', interpretation: 'Moderate trend strength', timeframe: '4h', weight: 0.5, source: 'Technical' },
  { signal: 'Bollinger Width', value: 'Narrowing', interpretation: 'Compression, breakout likely', timeframe: '1d', weight: 0.6, source: 'Volatility' },
  { signal: 'VWAP', value: '$97,240', interpretation: 'Price above VWAP, bullish', timeframe: '1d', weight: 0.5, source: 'Volume' },
];

export const mockAsset: AssetOverview = {
  symbol: 'BTC',
  name: 'Bitcoin',
  price: 97842.50,
  change24h: 2.34,
  volume24h: 38_420_000_000,
  marketCap: 1_920_000_000_000,
  regime: 'Trending',
};

export const mockScenarios: ScenarioData[] = [
  {
    type: 'bullish',
    probability: asProbability(0.58, "mockData.bullish"),
    confidence: 'MEDIUM',
    entryZones: [
      { priceRange: [96800, 97200], trigger: '4h close above EMA 20 with volume', timeframe: '4h', score: 78 },
      { priceRange: [95400, 95800], trigger: 'Retest of 0.382 fib with bullish engulfing', timeframe: '1d', score: 72 },
    ],
    stopLoss: { level: 94200, condition: '4h close below 94,200 (0.618 fib + structure)' },
    targets: [
      { label: 'TP1', price: 99800, rationale: 'Previous resistance + 1.272 extension' },
      { label: 'TP2', price: 102400, rationale: 'Psychological level + 1.618 extension' },
      { label: 'TP3', price: 106000, rationale: '2.0 extension + measured move target' },
    ],
    timeWindow: '12–48 hours',
    evidence: btcEvidence,
  },
  {
    type: 'bearish',
    probability: asProbability(0.28, "mockData.bearish"),
    confidence: 'LOW',
    entryZones: [
      { priceRange: [98800, 99400], trigger: 'Rejection at resistance with bearish divergence', timeframe: '4h', score: 62 },
    ],
    stopLoss: { level: 100200, condition: '4h close above 100,200' },
    targets: [
      { label: 'TP1', price: 96200, rationale: '0.382 retracement of recent swing' },
      { label: 'TP2', price: 94800, rationale: 'Structure support + 0.5 fib' },
    ],
    timeWindow: '6–24 hours',
    evidence: btcEvidence.slice(0, 4),
  },
  {
    type: 'neutral',
    probability: asProbability(0.14, "mockData.neutral"),
    confidence: 'LOW',
    entryZones: [],
    stopLoss: { level: 0, condition: 'N/A — range-bound, no directional bias' },
    targets: [],
    timeWindow: '24–72 hours',
    evidence: btcEvidence.slice(0, 3),
  },
];

export const mockConsensus: ConsensusData = {
  score: 72,
  conflicts: [
    { description: 'Funding rate slightly elevated vs bullish structure', severity: 'low' },
    { description: '1h RSI overbought while 4h is neutral', severity: 'medium' },
    { description: 'Volume declining on last 3 candles', severity: 'medium' },
  ],
  sourceAgreement: 85,
  signalAgreement: 68,
  structureAgreement: 78,
  dataCompleteness: 82,
};

export const mockWhales: WhaleEntry[] = [
  { address: '0x1a2b...3c4d', label: 'Smart Money #1', winRate: 72, avgHoldTime: '4.2d', recentAction: 'Accumulated 42 BTC', recentActionTime: '2h ago', pnl: 2_340_000, confidence: 'HIGH' },
  { address: '0x5e6f...7a8b', label: 'Whale Alpha', winRate: 68, avgHoldTime: '1.8d', recentAction: 'Moved 120 BTC to exchange', recentActionTime: '45m ago', pnl: 1_890_000, confidence: 'MEDIUM' },
  { address: '0x9c0d...1e2f', winRate: 65, avgHoldTime: '6.1d', recentAction: 'No recent activity', recentActionTime: '3d ago', pnl: 980_000, confidence: 'LOW' },
  { address: '0x3a4b...5c6d', label: 'Fund Wallet', winRate: 78, avgHoldTime: '12.4d', recentAction: 'Withdrew 85 BTC from exchange', recentActionTime: '6h ago', pnl: 5_120_000, confidence: 'HIGH' },
];

export const mockAssets: AssetOverview[] = [
  mockAsset,
  { symbol: 'ETH', name: 'Ethereum', price: 3842.18, change24h: 1.87, volume24h: 18_200_000_000, marketCap: 462_000_000_000, regime: 'Trending' },
  { symbol: 'SOL', name: 'Solana', price: 198.42, change24h: -0.92, volume24h: 4_800_000_000, marketCap: 92_000_000_000, regime: 'Ranging' },
  { symbol: 'DOGE', name: 'Dogecoin', price: 0.3842, change24h: 5.21, volume24h: 2_100_000_000, marketCap: 55_000_000_000, regime: 'Choppy' },
  { symbol: 'AVAX', name: 'Avalanche', price: 42.18, change24h: -2.14, volume24h: 890_000_000, marketCap: 16_400_000_000, regime: 'Ranging' },
  { symbol: 'LINK', name: 'Chainlink', price: 18.92, change24h: 0.45, volume24h: 620_000_000, marketCap: 11_800_000_000, regime: 'Trending' },
];
