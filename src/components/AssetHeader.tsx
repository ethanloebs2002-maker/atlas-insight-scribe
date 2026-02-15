import type { AssetOverview } from '@/types/atlas';
import { formatPrice, formatLargeNumber } from '@/lib/atlas-utils';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Activity, BarChart3, DollarSign } from 'lucide-react';

export default function AssetHeader({ asset }: { asset: AssetOverview }) {
  const isPositive = asset.change24h >= 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="font-mono text-sm font-bold text-primary">{asset.symbol.slice(0, 2)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{asset.symbol}</h1>
              <span className="text-sm text-muted-foreground">{asset.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-2xl font-bold text-foreground">${formatPrice(asset.price)}</span>
              <span className={cn(
                'flex items-center gap-0.5 text-sm font-mono font-semibold',
                isPositive ? 'text-bullish' : 'text-bearish'
              )}>
                {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {isPositive ? '+' : ''}{asset.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wider">24h Vol</div>
              <div className="text-foreground">{formatLargeNumber(asset.volume24h)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Mkt Cap</div>
              <div className="text-foreground">{formatLargeNumber(asset.marketCap)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Regime</div>
              <div className="text-primary">{asset.regime}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
