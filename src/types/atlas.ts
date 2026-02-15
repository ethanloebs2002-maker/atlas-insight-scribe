export type Scenario = 'bullish' | 'bearish' | 'neutral';
export type ConfidenceTier = 'LOW' | 'MEDIUM' | 'HIGH';
export type TradingStyle = 'SCALP' | 'SWING' | 'POSITION';
export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive';
export type MarketRegime = 'Trending' | 'Ranging' | 'Choppy';

export interface EntryZone {
  priceRange: [number, number];
  trigger: string;
  timeframe: string;
  score: number;
}

export interface ScenarioData {
  type: Scenario;
  probability: number;
  confidence: ConfidenceTier;
  entryZones: EntryZone[];
  stopLoss: { level: number; condition: string };
  targets: { label: string; price: number; rationale: string }[];
  timeWindow: string;
  evidence: EvidenceRow[];
}

export interface EvidenceRow {
  signal: string;
  value: string;
  interpretation: string;
  timeframe: string;
  weight: number;
  source: string;
}

export interface ConsensusData {
  score: number;
  conflicts: { description: string; severity: 'low' | 'medium' | 'high' }[];
  sourceAgreement: number;
  signalAgreement: number;
  structureAgreement: number;
  dataCompleteness: number;
}

export interface WhaleEntry {
  address: string;
  label?: string;
  winRate: number;
  avgHoldTime: string;
  recentAction: string;
  recentActionTime: string;
  pnl: number;
  confidence: ConfidenceTier;
}

export interface AssetOverview {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  regime: MarketRegime;
}
