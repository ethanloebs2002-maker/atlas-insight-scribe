import type { ScenarioData } from '@/types/atlas';
import { scenarioColor, scenarioBorderColor, scenarioBgColor, scenarioGlow, confidenceBadgeClass, formatPrice } from '@/lib/atlas-utils';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Target, ShieldAlert, Clock } from 'lucide-react';

const scenarioIcon = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
};

const scenarioLabel = {
  bullish: 'BULL',
  bearish: 'BEAR',
  neutral: 'NEUTRAL',
};

export default function ScenarioCard({ scenario }: { scenario: ScenarioData }) {
  const Icon = scenarioIcon[scenario.type];

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-all animate-slide-up',
      scenarioBorderColor(scenario.type),
      scenarioBgColor(scenario.type),
      scenarioGlow(scenario.type)
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', scenarioColor(scenario.type))} />
          <span className={cn('font-mono text-sm font-bold', scenarioColor(scenario.type))}>
            {scenarioLabel[scenario.type]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('font-mono text-lg font-bold', scenarioColor(scenario.type))}>
            {scenario.probability}%
          </span>
          <span className={cn(
            'text-[10px] font-mono px-1.5 py-0.5 rounded border',
            confidenceBadgeClass(scenario.confidence)
          )}>
            {scenario.confidence}
          </span>
        </div>
      </div>

      {/* Probability bar */}
      <div className="h-1 rounded-full bg-secondary mb-4">
        <div
          className={cn('h-full rounded-full transition-all', scenario.type === 'bullish' ? 'bg-bullish' : scenario.type === 'bearish' ? 'bg-bearish' : 'bg-neutral-signal')}
          style={{ width: `${scenario.probability}%` }}
        />
      </div>

      {/* Entry Zones */}
      {scenario.entryZones.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 mb-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Entry Zones</span>
          </div>
          {scenario.entryZones.map((zone, i) => (
            <div key={i} className="text-xs font-mono mb-1 pl-4">
              <span className="text-foreground">${formatPrice(zone.priceRange[0])} – ${formatPrice(zone.priceRange[1])}</span>
              <span className="text-muted-foreground ml-2">({zone.timeframe})</span>
              <span className="text-muted-foreground ml-1">Score: {zone.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stop Loss */}
      {scenario.stopLoss.level > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 mb-1">
            <ShieldAlert className="h-3 w-3 text-bearish" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Invalidation</span>
          </div>
          <p className="text-xs font-mono pl-4 text-bearish">${formatPrice(scenario.stopLoss.level)}</p>
          <p className="text-[10px] font-mono pl-4 text-muted-foreground">{scenario.stopLoss.condition}</p>
        </div>
      )}

      {/* Targets */}
      {scenario.targets.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 mb-1.5">
            <Target className="h-3 w-3 text-bullish" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Targets</span>
          </div>
          {scenario.targets.map((t, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs font-mono pl-4 mb-0.5">
              <span className="text-bullish">{t.label}</span>
              <span className="text-foreground">${formatPrice(t.price)}</span>
              <span className="text-muted-foreground text-[10px]">{t.rationale}</span>
            </div>
          ))}
        </div>
      )}

      {/* Time Window */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-border">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-mono text-muted-foreground">Window: {scenario.timeWindow}</span>
      </div>
    </div>
  );
}
