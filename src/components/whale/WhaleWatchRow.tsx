import { cn } from '@/lib/utils';
import type { WhaleSignal } from '@/hooks/useWhaleSignals';
import { formatUSD, formatTimeAgo, truncateAddress } from '@/utils/format';
import { ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  LARGE_TRADE: { label: 'TRADE', color: 'text-bullish' },
  VOLUME_SPIKE: { label: 'VOL SPIKE', color: 'text-primary' },
  LARGE_TRANSFER: { label: 'TRANSFER', color: 'text-neutral-signal' },
  EXCHANGE_INFLOW: { label: 'INFLOW', color: 'text-bearish' },
  EXCHANGE_OUTFLOW: { label: 'OUTFLOW', color: 'text-bullish' },
};

function SeverityDot({ severity }: { severity: number }) {
  const color = severity >= 0.75 ? 'bg-bearish' : severity >= 0.4 ? 'bg-neutral-signal' : 'bg-muted-foreground';
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} />;
}

export default function WhaleWatchRow({ signal }: { signal: WhaleSignal }) {
  const meta = TYPE_LABELS[signal.signal_type] || { label: signal.signal_type, color: 'text-muted-foreground' };

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors text-xs font-mono">
      {/* Time */}
      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
        {formatTimeAgo(signal.event_time)}
      </td>

      {/* Signal type chip */}
      <td className="px-3 py-2">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border border-border', meta.color)}>
          {meta.label}
        </span>
      </td>

      {/* Source */}
      <td className="px-3 py-2 hidden sm:table-cell">
        <span className="text-[10px] text-muted-foreground uppercase">{signal.source}</span>
      </td>

      {/* Symbol */}
      <td className="px-3 py-2 font-bold text-foreground">
        {signal.symbol}
      </td>

      {/* Notional */}
      <td className="px-3 py-2 hidden md:table-cell">
        {formatUSD(signal.notional_usd)}
      </td>

      {/* Entities */}
      <td className="px-3 py-2 hidden lg:table-cell">
        {signal.from_entity || signal.to_entity ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-primary cursor-help">
                {signal.from_entity ? truncateAddress(signal.from_entity, 4) : '?'}
                {' → '}
                {signal.to_entity ? truncateAddress(signal.to_entity, 4) : '?'}
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-[10px]">
              <div>From: {signal.from_entity || 'unknown'}</div>
              <div>To: {signal.to_entity || 'unknown'}</div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Severity */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <SeverityDot severity={signal.severity} />
          <span className="text-muted-foreground">{(signal.severity * 100).toFixed(0)}%</span>
        </div>
      </td>

      {/* Chain */}
      <td className="px-3 py-2 hidden xl:table-cell">
        {signal.chain && (
          <span className="text-[10px] text-muted-foreground">{signal.chain}</span>
        )}
      </td>
    </tr>
  );
}
