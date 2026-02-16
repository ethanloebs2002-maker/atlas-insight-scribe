import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────

export type AtlasAsset = {
  symbol: string;
  name: string;
  enabled: boolean;
  asset_type: "native" | "erc20" | "spl";
  chain: "bitcoin" | "ethereum" | "solana" | "avalanche";
  contract_address: string | null;
  decimals: number | null;
  whale_min_usd_exchange: number;
  whale_min_usd_onchain: number;
  metadata: Record<string, any>;
};

export type WhaleSignalInsert = {
  symbol: string;
  source: "exchange" | "onchain";
  chain?: string | null;
  signal_type:
    | "LARGE_TRADE"
    | "VOLUME_SPIKE"
    | "LARGE_TRANSFER"
    | "EXCHANGE_INFLOW"
    | "EXCHANGE_OUTFLOW";
  event_time: string; // ISO
  observed_price?: number | null;
  notional_usd: number;
  severity: number; // 0..1
  from_entity?: string | null;
  to_entity?: string | null;
  metadata?: Record<string, any>;
};

// ─── Supabase client (service-role) ──────────────────────────────────────

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Engine run lifecycle ────────────────────────────────────────────────

export async function logRunStart(engine: "exchange" | "onchain", metadata: any = {}) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whale_engine_runs")
    .insert({ engine, status: "RUNNING", metadata })
    .select("id")
    .single();

  if (error) throw new Error(`logRunStart failed: ${error.message}`);
  return data.id as string;
}

export async function logRunFinish(
  runId: string,
  status: "OK" | "ERROR",
  signalsEmitted: number,
  errorMsg?: string,
  metadata: any = {},
) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("whale_engine_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      signals_emitted: signalsEmitted,
      error: errorMsg ?? null,
      metadata,
    })
    .eq("id", runId);

  if (error) throw new Error(`logRunFinish failed: ${error.message}`);
}

// ─── Asset helpers ───────────────────────────────────────────────────────

export async function getEnabledAssets(): Promise<AtlasAsset[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("atlas_assets")
    .select("*")
    .eq("enabled", true);

  if (error) throw new Error(`getEnabledAssets failed: ${error.message}`);
  return (data ?? []) as AtlasAsset[];
}

// ─── Severity helpers ────────────────────────────────────────────────────

export function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function severityFromNotional(notionalUsd: number, minUsd: number) {
  const ratio = notionalUsd / Math.max(1, minUsd);
  return clamp01(Math.log2(Math.max(1, ratio)) / 2);
}

// ─── Signal insertion ────────────────────────────────────────────────────

export async function insertSignals(signals: WhaleSignalInsert[]) {
  if (!signals.length) return 0;
  const sb = supabaseAdmin();

  const rows = signals.map((s) => ({
    ...s,
    metadata: s.metadata ?? {},
    chain: s.chain ?? null,
    observed_price: s.observed_price ?? null,
    from_entity: s.from_entity ?? null,
    to_entity: s.to_entity ?? null,
  }));

  const { error } = await sb.from("whale_signals_v2").insert(rows);
  if (error) throw new Error(`insertSignals failed: ${error.message}`);

  return rows.length;
}

// ─── CORS headers ────────────────────────────────────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
