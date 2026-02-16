import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Asset = { symbol: string; metadata: any };
type Depth = { bids: [string,string][], asks: [string,string][] };

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
async function j<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" }});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json() as T;
}
function num(x: any) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

function estimateSlippageBps(depth: Depth, notionalUsd: number, side: "BUY"|"SELL") {
  const bids = depth.bids.map(([p,q])=>({p:num(p), q:num(q)}));
  const asks = depth.asks.map(([p,q])=>({p:num(p), q:num(q)}));
  if (!bids.length || !asks.length) return { slippageBps: null, spreadBps: null, thin: true };

  const bestBid = bids[0].p, bestAsk = asks[0].p;
  const mid = (bestBid + bestAsk)/2;
  const spreadBps = mid>0 ? ((bestAsk-bestBid)/mid)*10_000 : null;

  const book = side==="BUY" ? asks : bids;
  let remaining = notionalUsd;
  let filledUsd = 0;

  for (const lvl of book) {
    const lvlUsd = lvl.p * lvl.q;
    const takeUsd = Math.min(remaining, lvlUsd);
    if (takeUsd <= 0) break;
    filledUsd += takeUsd;
    remaining -= takeUsd;
    if (remaining <= 0) break;
  }

  if (filledUsd <= 0) return { slippageBps: null, spreadBps, thin: true };

  let denomQty = 0;
  remaining = notionalUsd;
  for (const lvl of book) {
    const lvlUsd = lvl.p * lvl.q;
    const takeUsd = Math.min(remaining, lvlUsd);
    if (takeUsd <= 0) break;
    denomQty += (takeUsd / lvl.p);
    remaining -= takeUsd;
    if (remaining <= 0) break;
  }
  const vwap = denomQty > 0 ? (filledUsd / denomQty) : null;
  if (!vwap || mid<=0) return { slippageBps: null, spreadBps, thin: true };

  const slip = side==="BUY" ? (vwap - mid) : (mid - vwap);
  const slippageBps = (slip / mid) * 10_000;
  const thin = (notionalUsd > filledUsd);
  return { slippageBps, spreadBps, thin };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const base = Deno.env.get("EXCHANGE_BASE_URL") ?? "https://data-api.binance.vision";
  const nowIso = new Date().toISOString();

  const body = await req.json().catch(()=> ({}));
  const notionalUsd = Number(body?.notional_usd ?? 50_000);
  const side = (body?.side === "SELL" ? "SELL" : "BUY") as "BUY"|"SELL";
  const symbolFilter: string | null = body?.symbol ?? null;

  const { data: assets } = await sb.from("atlas_assets").select("symbol,metadata").eq("enabled", true);
  const targets = (assets as Asset[]).filter(a => !!a.metadata?.exchange_symbol && (!symbolFilter || a.symbol===symbolFilter));

  let written = 0;

  for (const a of targets) {
    const ex = a.metadata.exchange_symbol as string;
    const depth = await j<Depth>(`${base}/api/v3/depth?symbol=${encodeURIComponent(ex)}&limit=100`);
    const est = estimateSlippageBps(depth, notionalUsd, side);
    const total = (est.slippageBps ?? 0) + (est.spreadBps ?? 0);

    const { error } = await sb.from("execution_cost_snapshots").insert({
      symbol: a.symbol,
      snapshot_time: nowIso,
      notional_usd: notionalUsd,
      est_slippage_bps: est.slippageBps,
      est_spread_bps: est.spreadBps,
      est_total_cost_bps: Number.isFinite(total) ? total : null,
      liquidity_thin: est.thin,
      metadata: { exchange_symbol: ex, side }
    });
    if (!error) written++;
  }

  return new Response(JSON.stringify({ ok:true, written, at: nowIso, notionalUsd, side }), { headers: { ...corsHeaders, "content-type":"application/json" }});
});
