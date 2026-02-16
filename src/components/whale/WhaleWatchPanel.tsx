import { Anchor, Radio, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhaleWallets, useWhaleSignal, useWhaleEvents } from '@/hooks/useWhaleSignals';
import { formatUSD, formatPct, formatHoldTime, truncateAddress, confidenceTier } from '@/utils/format';
import WhaleWatchRow from './WhaleWatchRow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  assetId: string;
  timeframe?: string;
}

function SignalSummaryCard({ signal }: { signal: any }) {
  if (!signal) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-4 text-center">
        <p className="text-xs font-mono text-muted-foreground">No whale signal computed yet</p>
      </div>
    );
  }

  const dirIcon = signal.direction === 'LONG'
    ? <TrendingUp className="h-4 w-4 text-bullish" />
    : signal.direction === 'SHORT'
    ? <TrendingDown className="h-4 w-4 text-bearish" />
    : <Minus className="h-4 w-4 text-muted-foreground" />;

  const dirColor = signal.direction === 'LONG' ? 'text-bullish' : signal.direction === 'SHORT' ? 'text-bearish' : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {dirIcon}
          <span className={cn('text-sm font-bold font-mono', dirColor)}>{signal.direction}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border',
            confidenceTier(signal.confidence) === 'HIGH' ? 'bg-bullish/10 text-bullish border-bullish' :
            confidenceTier(signal.confidence) === 'MEDIUM' ? 'bg-neutral-signal/10 text-neutral-signal border-neutral-signal' :
            'bg-bearish/10 text-bearish border-bearish'
          )}>
            {(signal.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {signal.elite_whale_count} elite · {signal.lookback_hours}h window
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Net Bias" value={signal.net_bias > 0 ? `+${(signal.net_bias * 100).toFixed(1)}%` : `${(signal.net_bias * 100).toFixed(1)}%`} color={signal.net_bias > 0 ? 'text-bullish' : signal.net_bias < 0 ? 'text-bearish' : 'text-muted-foreground'} />
        <Stat label="Total Size" value={formatUSD(signal.total_position_size_usd)} />
        <Stat label="Avg Win Rate" value={formatPct(signal.avg_whale_win_rate)} color="text-primary" />
        <Stat label="Avg Integrity" value={formatPct(signal.avg_whale_integrity)} />
      </div>

      <div className="flex gap-3 text-[10px] font-mono text-muted-foreground">
        <span>Long: {formatUSD(signal.long_position_size_usd)}</span>
        <span>Short: {formatUSD(signal.short_position_size_usd)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm font-mono font-bold', color || 'text-foreground')}>{value}</p>
    </div>
  );
}

function EliteWalletTable({ wallets }: { wallets: any[] }) {
  const elites = wallets.filter(w => w.is_elite || (w.lot_win_rate >= 0.58 && w.trade_count >= 50));
  if (elites.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-4 text-center">
        <p className="text-xs font-mono text-muted-foreground">No elite wallets found for this asset</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Address</th>
            <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Win Rate</th>
            <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden sm:table-cell">Trades</th>
            <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden md:table-cell">Avg Hold</th>
            <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden md:table-cell">PnL</th>
            <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Integrity</th>
          </tr>
        </thead>
        <tbody>
          {elites.slice(0, 20).map((w) => (
            <tr key={w.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
              <td className="px-3 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-primary cursor-help">
                      {truncateAddress(w.wallet_address, 5)}
                      {w.label && <span className="text-muted-foreground ml-1 text-[10px]">({w.label})</span>}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="font-mono text-[10px]">{w.wallet_address}</TooltipContent>
                </Tooltip>
              </td>
              <td className="px-3 py-2">
                <span className={cn(w.lot_win_rate >= 0.7 ? 'text-bullish' : w.lot_win_rate >= 0.55 ? 'text-neutral-signal' : 'text-bearish')}>
                  {(w.lot_win_rate * 100).toFixed(1)}%
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{w.trade_count}</td>
              <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{formatHoldTime(w.avg_hold_time_hours)}</td>
              <td className="px-3 py-2 text-bullish hidden md:table-cell">{formatUSD(w.realized_pnl_usd)}</td>
              <td className="px-3 py-2">
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border',
                  confidenceTier(w.integrity_score) === 'HIGH' ? 'bg-bullish/10 text-bullish border-bullish' :
                  confidenceTier(w.integrity_score) === 'MEDIUM' ? 'bg-neutral-signal/10 text-neutral-signal border-neutral-signal' :
                  'bg-bearish/10 text-bearish border-bearish'
                )}>
                  {(w.integrity_score * 100).toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WhaleWatchPanel({ assetId, timeframe = '4h' }: Props) {
  const { data: wallets = [], isLoading: walletsLoading } = useWhaleWallets(assetId);
  const { data: signal, isLoading: signalLoading } = useWhaleSignal(assetId, timeframe);
  const { data: events = [], isLoading: eventsLoading } = useWhaleEvents(assetId, 50);

  const isLoading = walletsLoading || signalLoading || eventsLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Anchor className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Whale Watch</h1>
          <p className="text-xs text-muted-foreground font-mono">
            Track historically successful large participants · {assetId} · {timeframe}
          </p>
        </div>
        {isLoading && <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin ml-auto" />}
      </div>

      {/* Signal summary */}
      <SignalSummaryCard signal={signal} />

      {/* Tabs */}
      <Tabs defaultValue="events" className="space-y-3">
        <TabsList className="bg-secondary/50 border border-border">
          <TabsTrigger value="events" className="text-xs font-mono">
            <Radio className="h-3 w-3 mr-1" /> Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="wallets" className="text-xs font-mono">
            <Anchor className="h-3 w-3 mr-1" /> Elite Wallets ({wallets.filter(w => w.is_elite).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          {events.length === 0 ? (
            <div className="rounded-lg border border-border bg-card/50 p-6 text-center">
              <p className="text-xs font-mono text-muted-foreground">
                No whale events yet. Run an evaluation to populate whale tracking.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">When</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Event</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden sm:table-cell">Source</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Dir</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden md:table-cell">Size</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden lg:table-cell">Wallet</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Conf</th>
                      <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden xl:table-cell">Chain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <WhaleWatchRow key={ev.id} event={ev} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="wallets">
          <EliteWalletTable wallets={wallets} />
        </TabsContent>
      </Tabs>

      {/* Disclaimer */}
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <p className="text-[10px] font-mono text-muted-foreground">
          ⚠ Whale tracking uses on-chain inference. Wallet labels are community-sourced and may be incorrect.
          Trade attribution has inherent uncertainty — always verify independently.
        </p>
      </div>
    </div>
  );
}
