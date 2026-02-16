import { supabaseAdmin, clamp01 } from "./whale.ts";

type WhaleSignalRow = {
  id: string;
  symbol: string;
  source: "exchange" | "onchain";
  chain: string | null;
  signal_type: string;
  event_time: string;
  notional_usd: number;
  severity: number;
};

export type WhaleContextSnapshot = {
  symbol: string;
  snapshot_time: string;
  window_1h_count: number;
  window_6h_count: number;
  window_24h_count: number;
  window_1h_severity_sum: number;
  window_6h_severity_sum: number;
  window_24h_severity_sum: number;
  large_trade_24h_count: number;
  volume_spike_24h_count: number;
  large_transfer_24h_count: number;
  exchange_inflow_24h_count: number;
  exchange_outflow_24h_count: number;
  last_event_time: string | null;
  last_event_type: string | null;
  last_event_source: string | null;
  last_event_notional_usd: number | null;
  last_event_severity: number | null;
  flow_bias_24h: number;
  metadata: Record<string, any>;
};

function isoMinusHours(iso: string, hours: number) {
  const t = new Date(iso).getTime();
  return new Date(t - hours * 60 * 60 * 1000).toISOString();
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

export async function computeWhaleContext(symbol: string, snapshotTimeIso: string): Promise<WhaleContextSnapshot> {
  const sb = supabaseAdmin();
  const since24 = isoMinusHours(snapshotTimeIso, 24);

  const { data, error } = await sb
    .from("whale_signals_v2")
    .select("id,symbol,source,chain,signal_type,event_time,notional_usd,severity")
    .eq("symbol", symbol)
    .gte("event_time", since24)
    .lte("event_time", snapshotTimeIso)
    .order("event_time", { ascending: false })
    .limit(500);

  if (error) throw new Error(`computeWhaleContext query failed: ${error.message}`);

  const rows = (data ?? []) as WhaleSignalRow[];

  const since6 = isoMinusHours(snapshotTimeIso, 6);
  const since1 = isoMinusHours(snapshotTimeIso, 1);

  const w24 = rows;
  const w6 = rows.filter((r) => r.event_time >= since6);
  const w1 = rows.filter((r) => r.event_time >= since1);

  const window_24h_count = w24.length;
  const window_6h_count = w6.length;
  const window_1h_count = w1.length;

  const window_24h_severity_sum = sum(w24.map((r) => Number(r.severity ?? 0)));
  const window_6h_severity_sum = sum(w6.map((r) => Number(r.severity ?? 0)));
  const window_1h_severity_sum = sum(w1.map((r) => Number(r.severity ?? 0)));

  const byType24: Record<string, number> = {
    LARGE_TRADE: 0,
    VOLUME_SPIKE: 0,
    LARGE_TRANSFER: 0,
    EXCHANGE_INFLOW: 0,
    EXCHANGE_OUTFLOW: 0,
  };
  for (const r of w24) {
    if (byType24[r.signal_type] !== undefined) byType24[r.signal_type] += 1;
  }

  const last = rows[0] ?? null;

  const inflow = byType24.EXCHANGE_INFLOW;
  const outflow = byType24.EXCHANGE_OUTFLOW;
  const denom = Math.max(1, inflow + outflow);
  const flow_bias_24h = clamp01((outflow - inflow) / denom + 0.5) * 2 - 1;

  return {
    symbol,
    snapshot_time: snapshotTimeIso,
    window_1h_count,
    window_6h_count,
    window_24h_count,
    window_1h_severity_sum,
    window_6h_severity_sum,
    window_24h_severity_sum,
    large_trade_24h_count: byType24.LARGE_TRADE,
    volume_spike_24h_count: byType24.VOLUME_SPIKE,
    large_transfer_24h_count: byType24.LARGE_TRANSFER,
    exchange_inflow_24h_count: byType24.EXCHANGE_INFLOW,
    exchange_outflow_24h_count: byType24.EXCHANGE_OUTFLOW,
    last_event_time: last?.event_time ?? null,
    last_event_type: last?.signal_type ?? null,
    last_event_source: last?.source ?? null,
    last_event_notional_usd: last ? Number(last.notional_usd ?? 0) : null,
    last_event_severity: last ? Number(last.severity ?? 0) : null,
    flow_bias_24h,
    metadata: {
      note: "Observation-only snapshot. No trading implications.",
      fetched_24h: window_24h_count,
    },
  };
}

export async function insertWhaleContextSnapshot(args: {
  symbol: string;
  snapshotTimeIso: string;
  decisionId?: string | null;
  tradeId?: string | null;
}) {
  const sb = supabaseAdmin();
  const snap = await computeWhaleContext(args.symbol, args.snapshotTimeIso);

  const { error } = await sb.from("whale_context_snapshots").insert({
    decision_id: args.decisionId ?? null,
    trade_id: args.tradeId ?? null,
    symbol: snap.symbol,
    snapshot_time: snap.snapshot_time,
    window_1h_count: snap.window_1h_count,
    window_6h_count: snap.window_6h_count,
    window_24h_count: snap.window_24h_count,
    window_1h_severity_sum: snap.window_1h_severity_sum,
    window_6h_severity_sum: snap.window_6h_severity_sum,
    window_24h_severity_sum: snap.window_24h_severity_sum,
    large_trade_24h_count: snap.large_trade_24h_count,
    volume_spike_24h_count: snap.volume_spike_24h_count,
    large_transfer_24h_count: snap.large_transfer_24h_count,
    exchange_inflow_24h_count: snap.exchange_inflow_24h_count,
    exchange_outflow_24h_count: snap.exchange_outflow_24h_count,
    last_event_time: snap.last_event_time,
    last_event_type: snap.last_event_type,
    last_event_source: snap.last_event_source,
    last_event_notional_usd: snap.last_event_notional_usd,
    last_event_severity: snap.last_event_severity,
    flow_bias_24h: snap.flow_bias_24h,
    metadata: snap.metadata,
  });

  if (error) throw new Error(`insertWhaleContextSnapshot failed: ${error.message}`);
}
