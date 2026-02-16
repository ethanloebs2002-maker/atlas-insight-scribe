import { formatDistanceToNow } from 'date-fns';

export function formatUSD(value: number | null | undefined): string {
  if (value == null) return '—';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatPctRaw(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatTimeAgo(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function formatHoldTime(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function confidenceTier(c: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (c >= 0.75) return 'HIGH';
  if (c >= 0.5) return 'MEDIUM';
  return 'LOW';
}
