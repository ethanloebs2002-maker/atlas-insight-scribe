import { useState } from 'react';
import type { ConsensusData } from '@/types/atlas';
import { cn } from '@/lib/utils';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import HelpTooltip from '@/components/HelpTooltip';
import ConsensusExplainModal from '@/components/ConsensusExplainModal';

function ScoreBar({ label, value, tooltipId }: { label: string; value: number; tooltipId: string }) {
  const color = value >= 75 ? 'bg-bullish' : value >= 50 ? 'bg-neutral-signal' : 'bg-bearish';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono items-center">
        <span className="text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          {label}
          <HelpTooltip id={tooltipId} iconSize="h-2.5 w-2.5" />
        </span>
        <span className="text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function ConsensusReport({ data }: { data: ConsensusData }) {
  const [modalOpen, setModalOpen] = useState(false);
  const scoreColor = data.score >= 75 ? 'text-bullish' : data.score >= 50 ? 'text-neutral-signal' : 'text-bearish';

  return (
    <>
      <div
        className="rounded-lg border border-border bg-card p-4 animate-slide-up cursor-pointer hover:border-primary/30 transition-colors"
        onClick={() => setModalOpen(true)}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">Consensus Report</span>
            <HelpTooltip id="consensus-report" iconSize="h-3 w-3" />
          </div>
          <span className={cn('font-mono text-2xl font-bold', scoreColor)}>{data.score}</span>
        </div>

        <div className="space-y-3 mb-4">
          <ScoreBar label="Source Agreement" value={data.sourceAgreement} tooltipId="consensus-source-agreement" />
          <ScoreBar label="Signal Agreement" value={data.signalAgreement} tooltipId="consensus-signal-agreement" />
          <ScoreBar label="Structure Agreement" value={data.structureAgreement} tooltipId="consensus-structure-agreement" />
          <ScoreBar label="Data Completeness" value={data.dataCompleteness} tooltipId="consensus-data-completeness" />
        </div>

        {data.conflicts.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-2">
              <AlertTriangle className="h-3 w-3 text-neutral-signal" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Conflicts Detected</span>
            </div>
            <div className="space-y-1.5">
              {data.conflicts.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs font-mono">
                  <span className={cn(
                    'mt-0.5 h-1.5 w-1.5 rounded-full shrink-0',
                    c.severity === 'high' ? 'bg-bearish' : c.severity === 'medium' ? 'bg-neutral-signal' : 'bg-muted-foreground'
                  )} />
                  <span className="text-muted-foreground">{c.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 text-[9px] font-mono text-primary/60 text-center">
          Click to view full explanation
        </div>
      </div>

      <ConsensusExplainModal open={modalOpen} onOpenChange={setModalOpen} data={data} />
    </>
  );
}
