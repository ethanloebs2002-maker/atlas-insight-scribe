import { cn } from '@/lib/utils';
import type { WhaleEventRow } from '@/hooks/useWhaleSignals';
import { formatUSD, formatTimeAgo, truncateAddress, confidenceTier } from '@/utils/format';
import { ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  POSITION_OPEN: { label: 'OPEN', color: 'text-bullish' },
  POSITION_CLOSE: { label: 'CLOSE', color: 'text-muted-foreground' },
  SCAN: { label: 'SCAN', color: 'text-primary' },
  WALLET_PROMOTED: { label: 'PROMOTED', color: 'text-bullish' },
  WALLET_DEMOTED: { label: 'DEMOTED', color: 'text-bearish' },
};

function DirectionIcon({ direction }: { direction: string | null }) {
  if (direction === 'LONG') return <ArrowUpRight className="h-3.5 w-3.5 text-bullish" />;
  if (direction === 'SHORT') return <ArrowDownRight className="h-3.5 w-3.5 text-bearish" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

export default function WhaleWatchRow({ event }: { event: WhaleEventRow }) {
  const evMeta = EVENT_LABELS[event.event_type] || { label: event.event_type, color: 'text-muted-foreground' };
  const details = event.details_json || {};
  const tier = event.confidence != null ? confidenceTier(event.confidence) : null;

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors text-xs font-mono">
      {/* Time */}
      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
        {formatTimeAgo(event.created_at)}
      </td>

      {/* Event type chip */}
      <td className="px-3 py-2">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border border-border', evMeta.color)}>
          {evMeta.label}
        </span>
      </td>

      {/* Source */}
      <td className="px-3 py-2 hidden sm:table-cell">
        <span className="text-[10px] text-muted-foreground uppercase">{event.source}</span>
      </td>

      {/* Direction */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <DirectionIcon direction={event.direction} />
          <span className={cn(
            event.direction === 'LONG' ? 'text-bullish' :
            event.direction === 'SHORT' ? 'text-bearish' :
            'text-muted-foreground'
          )}>
            {event.direction || '—'}
          </span>
        </div>
      </td>

      {/* Size */}
      <td className="px-3 py-2 hidden md:table-cell">
        {formatUSD(event.size_usd)}
      </td>

      {/* Wallet */}
      <td className="px-3 py-2 hidden lg:table-cell">
        {details.wallet_address ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-primary cursor-help">
                {truncateAddress(details.wallet_address as string, 4)}
                {details.wallet_label && (
                  <span className="text-muted-foreground ml-1 text-[10px]">({details.wallet_label})</span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-[10px]">
              {details.wallet_address as string}
              {details.win_rate != null && <div>Win rate: {((details.win_rate as number) * 100).toFixed(1)}%</div>}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Confidence */}
      <td className="px-3 py-2">
        {tier ? (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border',
            tier === 'HIGH' ? 'bg-bullish/10 text-bullish border-bullish' :
            tier === 'MEDIUM' ? 'bg-neutral-signal/10 text-neutral-signal border-neutral-signal' :
            'bg-bearish/10 text-bearish border-bearish'
          )}>
            {tier}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Chain / Tx */}
      <td className="px-3 py-2 hidden xl:table-cell">
        {event.chain && (
          <span className="text-[10px] text-muted-foreground">{event.chain}</span>
        )}
        {event.tx_hash && (
          <ExternalLink className="h-3 w-3 text-muted-foreground inline ml-1" />
        )}
      </td>
    </tr>
  );
}
