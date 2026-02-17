/**
 * ATLAS Strategy Reputation Update
 * Updates blueprint reputation based on closed paper_positions linked via strategy_blueprint_id.
 * BACKBONE SAFE — reads only from DB tables.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));
  const positionId: string | null = body?.position_id ?? null;

  // Get closed positions linked to blueprints
  let query = sb.from("paper_positions")
    .select("id,symbol,strategy_blueprint_id,realized_pnl,realized_r,outcome,outcome_label,closed_at")
    .not("closed_at", "is", null)
    .not("strategy_blueprint_id", "is", null);

  if (positionId) {
    query = query.eq("id", positionId);
  } else {
    query = query.order("closed_at", { ascending: false }).limit(100);
  }

  const { data: positions } = await query;
  if (!positions?.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, msg: "no linked positions" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Group by blueprint_id
  const byBlueprint = new Map<string, any[]>();
  for (const p of positions) {
    const bpId = p.strategy_blueprint_id;
    if (!byBlueprint.has(bpId)) byBlueprint.set(bpId, []);
    byBlueprint.get(bpId)!.push(p);
  }

  let updated = 0;
  for (const [bpId, trades] of byBlueprint) {
    // Get current reputation
    const { data: cur } = await sb.from("strategy_reputation")
      .select("*")
      .eq("blueprint_id", bpId)
      .maybeSingle();

    const wins = trades.filter((t: any) => t.outcome === "TP" || t.outcome_label === "WIN" || Number(t.realized_pnl ?? 0) > 0).length;
    const losses = trades.filter((t: any) => t.outcome === "SL" || t.outcome_label === "LOSS" || Number(t.realized_pnl ?? 0) < 0).length;
    const total = trades.length;
    const winRate = total > 0 ? wins / total : 0;

    const avgR = trades.reduce((s: number, t: any) => s + Number(t.realized_r ?? 0), 0) / Math.max(total, 1);
    const maxDD = Math.min(...trades.map((t: any) => Number(t.realized_r ?? 0)));

    // Compute new reputation
    const prevRep = Number(cur?.reputation ?? 0);
    const prevConf = Number(cur?.confidence ?? 0.2);
    const prevSamples = Math.round(prevConf * 50); // approximate

    const newSamples = prevSamples + total;
    const newConf = clamp(Math.log10(1 + newSamples) / 2, 0, 1);

    // Reputation = weighted combo of win rate, expectancy, and drawdown penalty
    const expectancyScore = clamp(avgR * 10 + 0.5, 0, 1);
    const ddPenalty = maxDD < -3 ? 0.3 : maxDD < -2 ? 0.15 : 0;
    const rawRep = winRate * 0.4 + expectancyScore * 0.4 + (1 - ddPenalty) * 0.2;
    const newRep = prevRep * 0.7 + rawRep * 0.3; // EMA blend

    await sb.from("strategy_reputation").upsert({
      blueprint_id: bpId,
      reputation: clamp(newRep, 0, 1),
      confidence: newConf,
      last_updated: new Date().toISOString(),
      notes: JSON.stringify({ wins, losses, total, avgR: avgR.toFixed(4), winRate: winRate.toFixed(3) }),
    }, { onConflict: "blueprint_id" });

    updated++;
  }

  return new Response(JSON.stringify({ ok: true, updated }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
