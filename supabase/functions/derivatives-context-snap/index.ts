import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFundingRateHistory, getFundingRateNow, getOpenInterest } from "../_shared/exchange_binance.ts";

type Asset = { symbol: string; metadata: any; enabled: boolean };

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
function avg(xs: number[]) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null; }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const nowIso = new Date().toISOString();
  const base = Deno.env.get("BINANCE_FUTURES_BASE_URL") ?? "https://fapi.binance.com";

  const body = await req.json().catch(()=> ({}));
  const oneSymbol: string | null = body?.symbol ?? null;

  const { data: assets, error: aerr } = await sb.from("atlas_assets").select("symbol,enabled,metadata").eq("enabled", true);
  if (aerr) return new Response(JSON.stringify({ ok:false, error:aerr.message }), { status: 500, headers: corsHeaders });

  const targets = (assets as Asset[]).filter(a => !!a.metadata?.exchange_symbol && (!oneSymbol || a.symbol===oneSymbol));
  let written = 0;

  for (const a of targets) {
    const futuresSymbol = a.metadata.exchange_symbol as string;
    const fNow = await getFundingRateNow(base, futuresSymbol);
    const fHist = await getFundingRateHistory(base, futuresSymbol, 24).catch(()=>[]);
    const histRates = (fHist ?? []).map(r => Number(r.fundingRate ?? 0));

    const oi = await getOpenInterest(base, futuresSymbol);
    const oiUsd = Number(oi.openInterest ?? 0) * Number(fNow.markPrice ?? 0);

    const { error } = await sb.from("derivatives_context_snapshots").insert({
      symbol: a.symbol,
      snapshot_time: nowIso,
      funding_rate: Number(fNow.fundingRate ?? 0),
      funding_rate_24h_avg: avg(histRates),
      open_interest_usd: oiUsd,
      provider: "binance_futures",
      metadata: { futures_symbol: futuresSymbol, mark_price: fNow.markPrice }
    });

    if (!error) written++;
  }

  return new Response(JSON.stringify({ ok:true, written, at: nowIso }), { headers: { ...corsHeaders, "content-type":"application/json" }});
});
