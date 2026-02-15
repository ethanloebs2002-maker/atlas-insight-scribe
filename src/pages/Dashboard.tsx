import { mockAsset, mockScenarios, mockConsensus, mockWhales } from '@/data/mockData';
import AssetHeader from '@/components/AssetHeader';
import ScenarioCard from '@/components/ScenarioCard';
import ConsensusReport from '@/components/ConsensusReport';
import EvidenceTable from '@/components/EvidenceTable';
import WhaleTable from '@/components/WhaleTable';

export default function Dashboard() {
  const bullScenario = mockScenarios.find(s => s.type === 'bullish')!;

  return (
    <div className="space-y-6">
      <AssetHeader asset={mockAsset} />

      {/* Scenarios */}
      <section>
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Scenario Analysis
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mockScenarios.map(s => (
            <ScenarioCard key={s.type} scenario={s} />
          ))}
        </div>
      </section>

      {/* Consensus + Evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <ConsensusReport data={mockConsensus} />
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
    </div>
  );
}
