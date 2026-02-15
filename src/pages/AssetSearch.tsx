import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Activity, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { useMarketData } from '@/hooks/use-crypto-data';
import { mockAssets } from '@/data/mockData';
import { formatPrice, formatLargeNumber } from '@/lib/atlas-utils';
import { cn } from '@/lib/utils';
import type { AssetOverview } from '@/types/atlas';

export default function AssetSearch() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { data: liveAssets, isLoading, isError } = useMarketData();

  const assets: AssetOverview[] = liveAssets && liveAssets.length > 0 ? liveAssets : mockAssets;

  const filtered = assets.filter(a =>
    a.symbol.toLowerCase().includes(query.toLowerCase()) ||
    a.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Activity className="h-8 w-8 text-primary animate-pulse-glow" />
          <h1 className="font-mono text-3xl font-bold tracking-widest text-primary">ATLAS</h1>
        </div>
        <p className="text-sm text-muted-foreground font-mono max-w-md">
          Crypto Market Intelligence & Decision Support Engine
        </p>
        <p className="text-[10px] text-muted-foreground font-mono mt-1">
          {isLoading ? 'Loading live data…' : isError ? 'Using cached data • API unavailable' : 'Live data • CoinGecko + Binance'}
        </p>
      </div>

      {/* Search */}
      <div className="w-full max-w-lg mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search asset (e.g. BTC, Ethereum, SOL)..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-card text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            autoFocus
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-mono mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching live market data…
        </div>
      )}

      {/* Asset list */}
      <div className="w-full max-w-lg space-y-2">
        {filtered.map(asset => {
          const isPositive = asset.change24h >= 0;
          return (
            <button
              key={asset.symbol}
              onClick={() => navigate(`/dashboard?symbol=${asset.symbol}`)}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="font-mono text-xs font-bold text-primary">{asset.symbol.slice(0, 2)}</span>
                </div>
                <div className="text-left">
                  <div className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {asset.symbol}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{asset.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-foreground">${formatPrice(asset.price)}</div>
                <div className={cn(
                  'flex items-center justify-end gap-0.5 text-[10px] font-mono',
                  isPositive ? 'text-bullish' : 'text-bearish'
                )}>
                  {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {isPositive ? '+' : ''}{asset.change24h.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
