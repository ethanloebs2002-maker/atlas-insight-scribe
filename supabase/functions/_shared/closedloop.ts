/** Default entry-order TTL by timeframe */
export function defaultEntryTtlMs(tf?: string | null): number {
  switch ((tf ?? "").toLowerCase()) {
    case "5m":  return 45 * 60_000;
    case "15m": return 90 * 60_000;
    case "1h":  return 4 * 60 * 60_000;
    case "4h":  return 12 * 60 * 60_000;
    default:    return 6 * 60 * 60_000;
  }
}

/** Default max-hold time-stop by timeframe */
export function defaultMaxHoldMs(tf?: string | null): number {
  switch ((tf ?? "").toLowerCase()) {
    case "5m":  return 6 * 60 * 60_000;
    case "15m": return 12 * 60 * 60_000;
    case "1h":  return 48 * 60 * 60_000;
    case "4h":  return 7 * 24 * 60 * 60_000;
    default:    return 48 * 60 * 60_000;
  }
}

/** Add milliseconds to an ISO timestamp */
export function isoPlusMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}
