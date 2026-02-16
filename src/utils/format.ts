export function formatUsd(n: number) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "$0";
  if (x >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(2)}K`;
  return `$${x.toFixed(0)}`;
}

/** @deprecated Use formatUsd instead */
export const formatUSD = formatUsd;

export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const d = Date.now() - t;
  const s = Math.max(0, Math.floor(d / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
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
