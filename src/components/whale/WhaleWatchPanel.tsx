import { Anchor, RefreshCw } from 'lucide-react';
import { useWhaleSignals, type WhaleSignal } from '@/hooks/useWhaleSignals';
import WhaleWatchRow from './WhaleWatchRow';

interface Props {
  symbol?: string | null;
  hours?: number;
}

export default function WhaleWatchPanel({ symbol = null, hours = 24 }: Props) {
  const { rows, loading, error, refetch } = useWhaleSignals({ symbol, hours, limit: 100 });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Anchor className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Whale Watch</h1>
          <p className="text-xs text-muted-foreground font-mono">
            Large trades &amp; on-chain transfers · {symbol || 'All assets'} · last {hours}h
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="ml-auto p-1.5 rounded hover:bg-secondary/50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-bearish/30 bg-bearish/5 p-3">
          <p className="text-xs font-mono text-bearish">{error}</p>
        </div>
      )}

      {/* Feed */}
      {rows.length === 0 && !loading ? (
        <div className="rounded-lg border border-border bg-card/50 p-6 text-center">
          <p className="text-xs font-mono text-muted-foreground">
            No whale signals in the last {hours}h.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">When</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Type</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden sm:table-cell">Source</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Asset</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden md:table-cell">Size</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden lg:table-cell">Entity</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Severity</th>
                  <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden xl:table-cell">Chain</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <WhaleWatchRow key={s.id} signal={s} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <p className="text-[10px] font-mono text-muted-foreground">
          ⚠ Whale signals are derived from exchange order-flow and on-chain inference.
          Entity labels are community-sourced and may be incorrect. Always verify independently.
        </p>
      </div>
    </div>
  );
}
