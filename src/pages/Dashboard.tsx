import { useSearchParams } from 'react-router-dom';
import { useAssetAnalysis } from '@/hooks/use-crypto-data';
import { mockAsset, mockScenarios, mockConsensus, mockWhales } from '@/data/mockData';
import AssetHeader from '@/components/AssetHeader';
import ScenarioCard from '@/components/ScenarioCard';
import ConsensusReport from '@/components/ConsensusReport';
import EvidenceTable from '@/components/EvidenceTable';
import WhaleTable from '@/components/WhaleTable';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol') || 'BTC';
  const { data: analysis, isLoading, isError } = useAssetAnalysis(symbol);

  const asset = analysis?.asset || mockAsset;
  const scenarios = analysis?.scenarios || mockScenarios;
  const consensus = analysis?.consensus || mockConsensus;
  const bullScenario = scenarios.find(s => s.type === 'bullish')!;

  return (
    <div className="space-y-6">
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
            ● LIVE — CoinGecko + Binance • Auto-refresh 2m
          </div>
        )}
        {isError && (
          <div className="text-[10px] font-mono text-bearish">
            ● OFFLINE — Using cached data
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

          {/* Scenarios */}
          <section>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Scenario Analysis
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {scenarios.map(s => (
                <ScenarioCard key={s.type} scenario={s} />
              ))}
            </div>
          </section>

          {/* Consensus + Evidence */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <ConsensusReport data={consensus} />
            </div>
            <div className="lg:col-span-2">
              <EvidenceTable evidence={bullScenario.evidence} />
            </div>
          </div>

          {/* Whale Watch */}
          <WhaleTable whales={mockWhales} />

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
