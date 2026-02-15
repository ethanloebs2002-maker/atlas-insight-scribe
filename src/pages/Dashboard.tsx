import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAssetAnalysis } from '@/hooks/use-crypto-data';
import AssetHeader from '@/components/AssetHeader';
import ScenarioCard from '@/components/ScenarioCard';
import ConsensusReport from '@/components/ConsensusReport';
import EvidenceTable from '@/components/EvidenceTable';
import AdvancedChart from '@/components/AdvancedChart';
import SystemStatusBanner from '@/components/SystemStatusBanner';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { AssetOverview, ScenarioData, ConsensusData } from '@/types/atlas';
import { normalizeScenarioPercents } from '@/lib/normalize-scenarios';

const emptyAsset: AssetOverview = {
  symbol: '---',
  name: 'Loading…',
  price: 0,
  change24h: 0,
  volume24h: 0,
  marketCap: 0,
  regime: 'Ranging',
};

const emptyConsensus: ConsensusData = {
  score: 0,
  conflicts: [],
  sourceAgreement: 0,
  signalAgreement: 0,
  structureAgreement: 0,
  dataCompleteness: 0,
};

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol') || 'BTC';
  const [timeframe, setTimeframe] = useState('4h');
  const { data: analysis, isLoading, isError } = useAssetAnalysis(symbol, timeframe);

  const asset = analysis?.asset || emptyAsset;
  const scenarios: ScenarioData[] = analysis?.scenarios || [];
  const consensus = analysis?.consensus || emptyConsensus;
  const bullScenario = scenarios.find(s => s.type === 'bullish');

  const normalizedPcts = normalizeScenarioPercents({
    bull: scenarios.find(s => s.type === 'bullish')?.probability ?? 0,
    bear: scenarios.find(s => s.type === 'bearish')?.probability ?? 0,
    neutral: scenarios.find(s => s.type === 'neutral')?.probability ?? 0,
  });
  const pctMap: Record<string, number> = { bullish: normalizedPcts.bull, bearish: normalizedPcts.bear, neutral: normalizedPcts.neutral };

  return (
    <div className="space-y-6">
      {/* System Status Banner */}
      <SystemStatusBanner asset={symbol} />

      {/* Data source indicator */}
      <div className="flex items-center gap-2">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading live analysis for {symbol}…
          </div>
        )}
        {!isLoading && !isError && analysis && (
          <div className="text-[10px] font-mono text-primary/60">
            ● LIVE — CryptoCompare • Auto-refresh 2m
          </div>
        )}
        {isError && (
          <div className="text-[10px] font-mono text-bearish">
            ● OFFLINE — No data available
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : (
        <>
          <AssetHeader asset={asset} />

          {/* Advanced Chart with indicators & ATLAS overlays */}
          {(analysis?.chartData?.length || isLoading) && (
            <AdvancedChart
              data={analysis?.chartData || []}
              symbol={asset.symbol}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              isLoading={isLoading}
              entryZones={bullScenario?.entryZones?.map(ez => ({ low: ez.priceRange[0], high: ez.priceRange[1] }))}
              stopLevel={bullScenario?.stopLoss?.level}
              targets={bullScenario?.targets?.map(t => ({ price: t.price, label: t.label }))}
            />
          )}

          {/* Scenarios */}
          {scenarios.length > 0 && (
            <section>
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Scenario Analysis
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scenarios.map(s => (
                  <ScenarioCard key={s.type} scenario={s} displayPercent={pctMap[s.type] ?? 0} />
                ))}
              </div>
            </section>
          )}

          {/* Consensus + Evidence */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <ConsensusReport data={consensus} />
            </div>
            <div className="lg:col-span-2">
              {bullScenario && <EvidenceTable evidence={bullScenario.evidence} />}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
              <strong className="text-foreground">DISCLAIMER:</strong> ATLAS produces probabilistic scenarios based on historical patterns and cross-referenced data.
              All outputs are for informational and educational purposes only. Nothing produced by this system constitutes financial advice.
              Always conduct your own research and consult qualified professionals before making investment decisions. Past performance does not indicate future results.
              Confidence scores and probabilities are model estimates subject to significant uncertainty.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
