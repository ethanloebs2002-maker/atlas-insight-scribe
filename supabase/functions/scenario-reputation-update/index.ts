import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

const EMA_ALPHA = 0.1; // smoothing factor for EMA winrate

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(()=> ({}));
  const tradeId: string | null = body?.trade_id ?? body?.position_id ?? null;
  const outcomeType: string | null = body?.outcome_type ?? null;

  let trades: any[] = [];
  if (tradeId) {
    const r = await sb.from("paper_positions").select("id,symbol,filled_at,closed_at,realized_pnl,close_reason,outcome,outcome_label").eq("id", tradeId).maybeSingle();
    if (r.error || !r.data) return new Response(JSON.stringify({ ok:false, error:"trade not found" }), { status: 404, headers: corsHeaders });
    trades = [r.data];
  } else {
    const r = await sb.from("paper_positions")
      .select("id,symbol,filled_at,closed_at,realized_pnl,close_reason,outcome,outcome_label")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(50);
    trades = r.data ?? [];
  }

  let updated = 0;

  for (const t of trades) {
    // Determine outcome category
    const effectiveOutcome = outcomeType ?? t.outcome ?? t.close_reason ?? "UNKNOWN";
    const isExpired = effectiveOutcome === "EXPIRED_NO_FILL" || effectiveOutcome === "EXPIRED" || effectiveOutcome === "EXPIRY";
    const isWin = !isExpired && (
      effectiveOutcome === "TP" ||
      t.outcome_label === "WIN" ||
      Number(t.realized_pnl ?? 0) > 0
    );
    const isLoss = !isExpired && !isWin && (
      effectiveOutcome === "SL" ||
      t.outcome_label === "LOSS" ||
      Number(t.realized_pnl ?? 0) < 0
    );

    const attrib = await sb
      .from("trade_scenario_attribution")
      .select("scenario_key,symbol,timeframe,regime")
      .eq("position_id", t.id);

    const rows = attrib.data ?? [];
    for (const s of rows) {
      const key = String(s.scenario_key);
      const sym = s.symbol ?? t.symbol ?? '_global_';
      const tf = s.timeframe ?? '_all_';
      const rg = s.regime ?? '_all_';

      const cur = await sb
        .from("scenario_reputation")
        .select("alpha,beta,samples,wins,losses,expires,ema_winrate")
        .eq("scenario_key", key)
        .eq("symbol", sym)
        .eq("timeframe", tf)
        .eq("regime", rg)
        .maybeSingle();

      const alpha0 = Number(cur.data?.alpha ?? 1);
      const beta0 = Number(cur.data?.beta ?? 1);
      const samples0 = Number(cur.data?.samples ?? 0);
      const wins0 = Number(cur.data?.wins ?? 0);
      const losses0 = Number(cur.data?.losses ?? 0);
      const expires0 = Number(cur.data?.expires ?? 0);
      const ema0 = Number(cur.data?.ema_winrate ?? 0.5);

      // Bayesian update (existing logic)
      const alpha1 = alpha0 + (isWin ? 1 : 0);
      const beta1  = beta0  + (isLoss ? 1 : 0);
      const samples1 = samples0 + 1;
      const mean = alpha1 / (alpha1 + beta1);
      const cred = clamp01(Math.log10(1 + samples1) / 2);

      // EMA update: only for directional outcomes (win/loss), NOT expired
      let ema1 = ema0;
      if (isWin) {
        ema1 = ema0 * (1 - EMA_ALPHA) + 1 * EMA_ALPHA;
      } else if (isLoss) {
        ema1 = ema0 * (1 - EMA_ALPHA) + 0 * EMA_ALPHA;
      }
      // For expired: ema stays the same (execution calibration, not directional)

      const up = await sb.from("scenario_reputation").upsert({
        scenario_key: key,
        symbol: sym,
        timeframe: tf,
        regime: rg,
        alpha: alpha1,
        beta: beta1,
        posterior_mean: mean,
        credibility: cred,
        samples: samples1,
        wins: wins0 + (isWin ? 1 : 0),
        losses: losses0 + (isLoss ? 1 : 0),
        expires: expires0 + (isExpired ? 1 : 0),
        ema_winrate: ema1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "scenario_key,symbol,timeframe,regime" });

      if (!up.error) updated++;
    }
  }

  return new Response(JSON.stringify({ ok:true, updated }), { headers: { ...corsHeaders, "content-type":"application/json" }});
});
