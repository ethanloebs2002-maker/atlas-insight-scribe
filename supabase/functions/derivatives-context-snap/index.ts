import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Asset = { symbol: string; metadata: any; enabled: boolean };
type SymbolResult = { symbol: string; ok: boolean; error?: string };

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

function avg(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use data-api.binance.vision to avoid geo-blocking (HTTP 451) from Supabase datacenter IPs
const FUTURES_BASE = "https://fapi.binance.com";
const FUTURES_FALLBACK = "https://data-api.binance.vision";

async function fetchFunding(futuresSymbol: string) {
  // Try primary, fall back to data-api
  for (const base of [FUTURES_BASE, FUTURES_FALLBACK]) {
    try {
      const url = `${base}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(futuresSymbol)}`;
      const data = await fetchJson<any>(url);
      return {
        fundingRate: Number(data?.lastFundingRate ?? 0),
        markPrice: Number(data?.markPrice ?? 0),
      };
    } catch (e) {
      console.warn(`[deriv-snap] premiumIndex failed on ${base}: ${(e as any).message}`);
    }
  }
  throw new Error(`premiumIndex failed for ${futuresSymbol} on all endpoints`);
}

async function fetchFundingHistory(futuresSymbol: string, limit = 24): Promise<number[]> {
  for (const base of [FUTURES_BASE, FUTURES_FALLBACK]) {
    try {
      const url = `${base}/fapi/v1/fundingRate?symbol=${encodeURIComponent(futuresSymbol)}&limit=${limit}`;
      const rows = await fetchJson<any[]>(url);
      return (rows ?? []).map(r => Number(r.fundingRate ?? 0));
    } catch (e) {
      console.warn(`[deriv-snap] fundingRate history failed on ${base}: ${(e as any).message}`);
    }
  }
  return [];
}

async function fetchOpenInterest(futuresSymbol: string) {
  for (const base of [FUTURES_BASE, FUTURES_FALLBACK]) {
    try {
      const url = `${base}/fapi/v1/openInterest?symbol=${encodeURIComponent(futuresSymbol)}`;
      const data = await fetchJson<any>(url);
      return { openInterest: Number(data?.openInterest ?? 0) };
    } catch (e) {
      console.warn(`[deriv-snap] openInterest failed on ${base}: ${(e as any).message}`);
    }
  }
  throw new Error(`openInterest failed for ${futuresSymbol} on all endpoints`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const nowIso = new Date().toISOString();

  const body = await req.json().catch(() => ({}));
  const bodySymbols: string[] | null = body?.symbols ?? null;
  const oneSymbol: string | null = body?.symbol ?? null;
  const bodyPositionId: string | null = body?.position_id ?? null;
  const bodyDecisionId: string | null = body?.decision_id ?? null;

  // Determine symbol list
  let targetSymbols: { atlasSymbol: string; futuresSymbol: string }[] = [];

  if (bodySymbols?.length) {
    // Explicit list provided
    const { data: assets } = await sb.from("atlas_assets").select("symbol, metadata").eq("enabled", true);
    const assetMap = new Map((assets ?? []).map((a: any) => [a.symbol, a.metadata?.exchange_symbol]));
    targetSymbols = bodySymbols
      .filter(s => assetMap.has(s))
      .map(s => ({ atlasSymbol: s, futuresSymbol: assetMap.get(s)! }));
  } else if (oneSymbol) {
    // Single symbol from lifecycle hook
    const { data: asset } = await sb.from("atlas_assets").select("symbol, metadata").eq("symbol", oneSymbol).eq("enabled", true).maybeSingle();
    if (asset?.metadata?.exchange_symbol) {
      targetSymbols = [{ atlasSymbol: asset.symbol, futuresSymbol: asset.metadata.exchange_symbol }];
    }
  } else {
    // Default: load all enabled symbols from market_data_config OR atlas_assets
    const { data: cfg } = await sb.from("market_data_config").select("symbols").limit(1).maybeSingle();
    if (cfg?.symbols?.length) {
      const { data: assets } = await sb.from("atlas_assets").select("symbol, metadata").eq("enabled", true);
      const assetMap = new Map((assets ?? []).map((a: any) => [a.symbol, a.metadata?.exchange_symbol]));
      targetSymbols = (cfg.symbols as string[])
        .filter(s => assetMap.has(s) && assetMap.get(s))
        .map(s => ({ atlasSymbol: s, futuresSymbol: assetMap.get(s)! }));
    } else {
      const { data: assets } = await sb.from("atlas_assets").select("symbol, metadata, enabled").eq("enabled", true);
      targetSymbols = ((assets ?? []) as Asset[])
        .filter(a => !!a.metadata?.exchange_symbol)
        .map(a => ({ atlasSymbol: a.symbol, futuresSymbol: a.metadata.exchange_symbol }));
    }
  }

  if (targetSymbols.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "no target symbols resolved", written: 0 }), {
      status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let written = 0;
  const results: SymbolResult[] = [];

  for (const { atlasSymbol, futuresSymbol } of targetSymbols) {
    try {
      const funding = await fetchFunding(futuresSymbol);
      const histRates = await fetchFundingHistory(futuresSymbol, 24);
      const oi = await fetchOpenInterest(futuresSymbol);
      const oiUsd = oi.openInterest * funding.markPrice;

      // Only attach position_id if this is a single-symbol lifecycle call
      const positionId = (oneSymbol && bodyPositionId) ? bodyPositionId : null;
      const decisionId = (oneSymbol && bodyDecisionId) ? bodyDecisionId : null;

      const { error } = await sb.from("derivatives_context_snapshots").insert({
        symbol: atlasSymbol,
        snapshot_time: nowIso,
        funding_rate: funding.fundingRate,
        funding_rate_24h_avg: avg(histRates),
        open_interest_usd: oiUsd,
        position_id: positionId,
        decision_id: decisionId,
        provider: "binance_futures",
        metadata: { futures_symbol: futuresSymbol, mark_price: funding.markPrice },
      });

      if (error) {
        console.error(`[deriv-snap] DB insert failed for ${atlasSymbol}:`, error.message);
        results.push({ symbol: atlasSymbol, ok: false, error: error.message });
        // Log debug event
        await sb.from("debug_trace_events").insert({
          run_id: crypto.randomUUID(), asset_id: atlasSymbol, timeframe: "snap",
          phase: "DERIVATIVES_SNAP", event_type: "ERROR",
          message: `DB insert failed: ${error.message}`, payload_json: { futuresSymbol },
        }).catch(() => {});
      } else {
        written++;
        results.push({ symbol: atlasSymbol, ok: true });
      }
    } catch (e) {
      const msg = (e as any).message ?? String(e);
      console.error(`[deriv-snap] ${atlasSymbol} failed:`, msg);
      results.push({ symbol: atlasSymbol, ok: false, error: msg });
      // Log debug event for failed symbol
      await sb.from("debug_trace_events").insert({
        run_id: crypto.randomUUID(), asset_id: atlasSymbol, timeframe: "snap",
        phase: "DERIVATIVES_SNAP", event_type: "ERROR",
        message: `Fetch failed: ${msg}`, payload_json: { futuresSymbol },
      }).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ ok: true, written, captured_at: nowIso, results }, null, 2), {
    status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
