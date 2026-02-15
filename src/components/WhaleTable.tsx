import type { WhaleEntry } from '@/types/atlas';
import { cn } from '@/lib/utils';
import { confidenceBadgeClass, formatLargeNumber } from '@/lib/atlas-utils';
import { Anchor, ExternalLink } from 'lucide-react';

export default function WhaleTable({ whales }: { whales: WhaleEntry[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-slide-up">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Anchor className="h-4 w-4 text-primary" />
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">Whale Watch</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">Inference-based • Not verified</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Address</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Win Rate</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden sm:table-cell">Hold Time</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Recent Action</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden md:table-cell">Est. PnL</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {whales.map((w, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary">{w.address}</span>
                    {w.label && <span className="text-muted-foreground text-[10px]">({w.label})</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={cn(w.winRate >= 70 ? 'text-bullish' : w.winRate >= 55 ? 'text-neutral-signal' : 'text-bearish')}>
                    {w.winRate}%
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{w.avgHoldTime}</td>
                <td className="px-3 py-2">
                  <div>
                    <span className="text-foreground">{w.recentAction}</span>
                    <span className="text-muted-foreground ml-1 text-[10px]">{w.recentActionTime}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-bullish hidden md:table-cell">+{formatLargeNumber(w.pnl)}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border',
                    confidenceBadgeClass(w.confidence)
                  )}>
                    {w.confidence}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-border bg-secondary/20">
        <p className="text-[10px] font-mono text-muted-foreground">
          ⚠ Whale tracking is inference-based. Wallet attributions may be inaccurate. PnL estimates use lot-based approximation. Not financial advice.
        </p>
      </div>
    </div>
  );
}
