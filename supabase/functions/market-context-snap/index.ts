import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { utcSessionLabel } from "../_shared/session.ts";

type Asset = { symbol: string; whale_min_usd_exchange: number; metadata: any; enabled: boolean };
type Depth = { bids: [string,string][], asks: [string,string][] };
type Kline = [number,string,string,string,string,string];

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
function num(x: any) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
async function j<T>(url: string): Promise<T> { const r = await fetch(url, { headers: { accept: "application/json" }}); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return await r.json() as T; }

function realizedVol(closes: number[]) {
  if (closes.length < 30) return null;
  const rets: number[] = [];
  for (let i=1;i<closes.length;i++) if (closes[i-1]>0 && closes[i]>0) rets.push(Math.log(closes[i]/closes[i-1]));
  if (rets.length < 10) return null;
  const m = rets.reduce((a,b)=>a+b,0)/rets.length;
  const v = rets.reduce((a,b)=>a+(b-m)**2,0)/Math.max(1,rets.length-1);
  return Math.sqrt(v) * Math.sqrt(1440);
}
function volRegime(rv1h: number|null, rv24h: number|null) {
  if (rv1h==null || rv24h==null || rv24h<=0) return null;
  const r = rv1h/rv24h;
  if (r>=1.25) return "expansion";
  if (r<=0.80) return "compression";
  return "normal";
}
function depthSumUsd(levels: [string,string][], nLevels: number) {
  let s=0;
  for (let i=0;i<Math.min(nLevels, levels.length); i++) s += num(levels[i][0]) * num(levels[i][1]);
  return s;
}
function imbalance(bidUsd: number, askUsd: number) {
  const d = Math.max(1e-9, bidUsd+askUsd);
  return (bidUsd-askUsd)/d;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const nowIso = new Date().toISOString();
  const base = Deno.env.get("EXCHANGE_BASE_URL") ?? "https://data-api.binance.vision";
  const levels = Math.max(5, Math.min(50, Number(Deno.env.get("ORDERBOOK_LEVELS") ?? 20)));

  const body = await req.json().catch(()=> ({}));
  const oneSymbol: string | null = body?.symbol ?? null;
  const bodyPositionId: string | null = body?.position_id ?? null;
  const bodyDecisionId: string | null = body?.decision_id ?? null;

  const { data: assets, error: aerr } = await sb
    .from("atlas_assets")
    .select("symbol,enabled,metadata")
    .eq("enabled", true);

  if (aerr) return new Response(JSON.stringify({ ok:false, error:aerr.message }), { status: 500, headers: corsHeaders });

  const targets = (assets as Asset[]).filter(a => !!a.metadata?.exchange_symbol && (!oneSymbol || a.symbol===oneSymbol));
  let written = 0;

  for (const a of targets) {
    const ex = a.metadata.exchange_symbol as string;

    const depth = await j<Depth>(`${base}/api/v3/depth?symbol=${encodeURIComponent(ex)}&limit=100`);
    const bestBid = depth.bids?.length ? num(depth.bids[0][0]) : null;
    const bestAsk = depth.asks?.length ? num(depth.asks[0][0]) : null;
    const mid = (bestBid!=null && bestAsk!=null) ? (bestBid+bestAsk)/2 : null;
    const spreadAbs = (bestBid!=null && bestAsk!=null) ? Math.max(0, bestAsk-bestBid) : null;
    const spreadBps = (spreadAbs!=null && mid!=null && mid>0) ? (spreadAbs/mid)*10_000 : null;

    const bidDepthUsd = mid!=null ? depthSumUsd(depth.bids, levels) : null;
    const askDepthUsd = mid!=null ? depthSumUsd(depth.asks, levels) : null;
    const obImb = (bidDepthUsd!=null && askDepthUsd!=null) ? imbalance(bidDepthUsd, askDepthUsd) : null;

    const top5b = depthSumUsd(depth.bids, 5), top20b = depthSumUsd(depth.bids, 20);
    const top5a = depthSumUsd(depth.asks, 5), top20a = depthSumUsd(depth.asks, 20);
    const conc = (top20b>0 && top20a>0) ? ((top5b/top20b)+(top5a/top20a))/2 : null;

    const kl = await j<Kline[]>(`${base}/api/v3/klines?symbol=${encodeURIComponent(ex)}&interval=1m&limit=1500`);
    const closes = kl.map(k => num(k[4])).filter(x=>x>0);
    const rv1h = realizedVol(closes.slice(-60));
    const rv4h = realizedVol(closes.slice(-240));
    const rv24h = realizedVol(closes.slice(-1440));
    const regime = volRegime(rv1h, rv24h);

    const ses = utcSessionLabel(new Date(nowIso));

    const { error } = await sb.from("market_context_snapshots").insert({
      symbol: a.symbol,
      snapshot_time: nowIso,
      mid_price: mid,
      best_bid: bestBid,
      best_ask: bestAsk,
      spread_abs: spreadAbs,
      spread_bps: spreadBps,
      bid_depth_usd: bidDepthUsd,
      ask_depth_usd: askDepthUsd,
      ob_imbalance: obImb,
      depth_concentration: conc,
      rv_1h: rv1h,
      rv_4h: rv4h,
      rv_24h: rv24h,
      vol_regime: regime,
      session_primary: ses.primary,
      session_detail: ses.detail,
      session_utc_hour: ses.hour,
      position_id: bodyPositionId,
      decision_id: bodyDecisionId,
      metadata: { exchange_symbol: ex, levels }
    });

    if (!error) written++;
  }

  return new Response(JSON.stringify({ ok:true, written, at: nowIso }), { headers: { ...corsHeaders, "content-type":"application/json" }});
});
