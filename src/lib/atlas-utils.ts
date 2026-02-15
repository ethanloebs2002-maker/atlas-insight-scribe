import { cn } from '@/lib/utils';
import type { Scenario, ConfidenceTier } from '@/types/atlas';

export function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

export function formatLargeNumber(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  return `$${num.toLocaleString()}`;
}

export function scenarioColor(type: Scenario) {
  switch (type) {
    case 'bullish': return 'text-bullish';
    case 'bearish': return 'text-bearish';
    case 'neutral': return 'text-neutral-signal';
  }
}

export function scenarioBorderColor(type: Scenario) {
  switch (type) {
    case 'bullish': return 'border-bullish';
    case 'bearish': return 'border-bearish';
    case 'neutral': return 'border-neutral-signal';
  }
}

export function scenarioBgColor(type: Scenario) {
  switch (type) {
    case 'bullish': return 'bg-bullish/10';
    case 'bearish': return 'bg-bearish/10';
    case 'neutral': return 'bg-neutral-signal/10';
  }
}

export function scenarioGlow(type: Scenario) {
  switch (type) {
    case 'bullish': return 'glow-bullish';
    case 'bearish': return 'glow-bearish';
    case 'neutral': return 'glow-neutral';
  }
}

export function confidenceBadgeClass(tier: ConfidenceTier) {
  switch (tier) {
    case 'HIGH': return 'bg-bullish/10 text-bullish border-bullish';
    case 'MEDIUM': return 'bg-neutral-signal/10 text-neutral-signal border-neutral-signal';
    case 'LOW': return 'bg-bearish/10 text-bearish border-bearish';
  }
}
