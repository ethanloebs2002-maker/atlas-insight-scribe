/**
 * ATLAS Strategy Tournament Tick
 * Evaluates active blueprints against canonical market data (backbone-safe).
 * Writes shadow signals; does NOT place trades unless policy allows.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMarketState, type FeatureVector } from "../_shared/strategy_features.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// Simple deterministic signal evaluation from genome primitives
function evaluateGenome(genome: any, fv: FeatureVector): {
  direction: string | null;
  entry_price: number | null;
  stop_price: number | null;
  tp_price: number | null;
  risk_pct: number;
  gate_results: Record<string, boolean>;
  vetoed: boolean;
  veto_reason: string | null;
} {
  const result = {
    direction: null as string | null,
    entry_price: fv.mid,
    stop_price: null as number | null,
    tp_price: null as number | null,
    risk_pct: 1.0,
    gate_results: {} as Record<string, boolean>,
    vetoed: false,
    veto_reason: null as string | null,
  };

  if (!fv.mid) return { ...result, vetoed: true, veto_reason: "NO_PRICE" };

  // === SIGNAL EVALUATION (simplified: uses spread/imbalance heuristics) ===
  const signals = genome.signal ?? [];
  let bullishVotes = 0, bearishVotes = 0;

  for (const sig of signals) {
    const k = sig.key;
    // Simple heuristic signals based on available features
    if (k === "rsi_fade" || k === "bollinger_fade" || k === "mean_reversion_zscore") {
      // Mean reversion: if imbalance is extreme, fade it
      if (fv.imbalance !== null) {
        if (fv.imbalance < -0.3) bullishVotes++;
        else if (fv.imbalance > 0.3) bearishVotes++;
      }
    } else if (k === "donchian_breakout" || k === "atr_breakout" || k === "squeeze_release") {
      // Breakout: if spread is tight, expect expansion
      if (fv.spread_bps !== null && fv.spread_bps < 8) {
        if (fv.imbalance !== null && fv.imbalance > 0.1) bullishVotes++;
        else if (fv.imbalance !== null && fv.imbalance < -0.1) bearishVotes++;
      }
    } else {
      // Default: use imbalance as directional hint
      if (fv.imbalance !== null) {
        if (fv.imbalance > 0.15) bullishVotes++;
        else if (fv.imbalance < -0.15) bearishVotes++;
      }
    }
  }

  if (bullishVotes > bearishVotes) result.direction = "LONG";
  else if (bearishVotes > bullishVotes) result.direction = "SHORT";
  else return { ...result, vetoed: true, veto_reason: "NO_SIGNAL" };

  // === GATE EVALUATION ===
  const gates = genome.gates ?? [];
  for (const g of gates) {
    const params = { ...(g.default_params ?? {}), ...(g.params ?? {}) };
    let pass = true;

    if (g.key === "spread_gate") {
      pass = fv.spread_bps !== null && fv.spread_bps <= (params.max_spread_bps ?? 15);
    } else if (g.key === "imbalance_gate") {
      pass = fv.imbalance !== null && Math.abs(fv.imbalance) <= (params.max_abs_imbalance ?? 0.7);
    } else if (g.key === "freshness_gate") {
      pass = fv.ob_age_ms <= (params.max_age_ms ?? 5000);
    } else if (g.key === "session_gate") {
      const allowed = params.allowed_sessions ?? ["europe", "us", "overlap"];
      pass = allowed.includes(fv.session_bucket);
    } else if (g.key === "vol_regime_gate") {
      const allowed = params.allowed_regimes ?? ["normal", "compression"];
      pass = fv.vol_regime ? allowed.includes(fv.vol_regime) : true; // pass if unknown
    }

    result.gate_results[g.key] = pass;
    if (!pass) {
      result.vetoed = true;
      result.veto_reason = `GATE_FAIL:${g.key}`;
    }
  }

  // === RISK ===
  const riskRules = genome.risk ?? [];
  const mid = fv.mid!;
  for (const r of riskRules) {
    const params = { ...(r.default_params ?? {}), ...(r.params ?? {}) };
    if (r.key === "fixed_bracket") {
      const slPct = params.sl_pct ?? 1.5;
      const tpPct = params.tp_pct ?? 3.0;
      if (result.direction === "LONG") {
        result.stop_price = mid * (1 - slPct / 100);
        result.tp_price = mid * (1 + tpPct / 100);
      } else {
        result.stop_price = mid * (1 + slPct / 100);
        result.tp_price = mid * (1 - tpPct / 100);
      }
    } else if (r.key === "atr_bracket") {
      // Use spread as ATR proxy (simplified)
      const atrProxy = mid * (fv.spread_bps ?? 10) / 10000 * (params.atr_period ?? 14);
      const slMult = params.sl_mult ?? 1.5;
      const tpMult = params.tp_mult ?? 3.0;
      if (result.direction === "LONG") {
        result.stop_price = mid - atrProxy * slMult;
        result.tp_price = mid + atrProxy * tpMult;
      } else {
        result.stop_price = mid + atrProxy * slMult;
        result.tp_price = mid - atrProxy * tpMult;
      }
    }
  }

  // Fallback bracket
  if (!result.stop_price) {
    result.stop_price = result.direction === "LONG" ? mid * 0.985 : mid * 1.015;
    result.tp_price = result.direction === "LONG" ? mid * 1.03 : mid * 0.97;
  }

  // === SIZING ===
  const sizing = genome.sizing ?? [];
  for (const s of sizing) {
    const params = { ...(s.default_params ?? {}), ...(s.params ?? {}) };
    if (s.key === "fixed_risk_pct") result.risk_pct = params.risk_pct ?? 1.0;
    else if (s.key === "confidence_scaled") result.risk_pct = (params.base_pct ?? 0.5) * (params.scale_factor ?? 2.0);
    else if (s.key === "capped_notional") result.risk_pct = Math.min(result.risk_pct, 2.0);
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();

  // Get incorporated symbols
  const { data: assets } = await sb.from("incorporated_assets").select("symbol").eq("is_enabled", true);
  const symbols = (assets ?? []).map((a: any) => a.symbol);
  if (!symbols.length) {
    return new Response(JSON.stringify({ ok: true, signals: 0, msg: "no symbols" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Get policy
  const { data: policy } = await sb.from("paper_policy").select("strategy_shadow_only,tournament_top_k,tournament_explore_k").eq("is_active", true).maybeSingle();
  const topK = policy?.tournament_top_k ?? 8;
  const exploreK = policy?.tournament_explore_k ?? 3;

  // Get active blueprints sorted by reputation
  const { data: allBps } = await sb.from("strategy_blueprints")
    .select("id,name,genome,strategy_reputation(reputation,confidence)")
    .eq("is_active", true)
    .limit(50);

  if (!allBps?.length) {
    return new Response(JSON.stringify({ ok: true, signals: 0, msg: "no blueprints" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Sort by confidence*reputation desc, pick top K + random explore K
  const sorted = allBps.sort((a: any, b: any) => {
    const ra = (a.strategy_reputation?.[0]?.reputation ?? 0) * (a.strategy_reputation?.[0]?.confidence ?? 0.2);
    const rb = (b.strategy_reputation?.[0]?.reputation ?? 0) * (b.strategy_reputation?.[0]?.confidence ?? 0.2);
    return rb - ra;
  });

  const top = sorted.slice(0, topK);
  const rest = sorted.slice(topK);
  const explorers: any[] = [];
  for (let i = 0; i < Math.min(exploreK, rest.length); i++) {
    const idx = Math.floor(Math.random() * rest.length);
    explorers.push(rest.splice(idx, 1)[0]);
  }
  const selected = [...top, ...explorers];

  let totalSignals = 0;
  const shadowRows: any[] = [];

  for (const sym of symbols) {
    const fv = await getMarketState(sb, sym);

    for (const bp of selected) {
      const genome = bp.genome;
      const eval_result = evaluateGenome(genome, fv);

      shadowRows.push({
        blueprint_id: bp.id,
        symbol: sym,
        timeframe: "4h", // default timeframe
        direction: eval_result.direction ?? "NEUTRAL",
        entry_price: eval_result.entry_price,
        stop_price: eval_result.stop_price,
        tp_price: eval_result.tp_price,
        risk_pct: eval_result.risk_pct,
        gate_results: eval_result.gate_results,
        vetoed: eval_result.vetoed,
        veto_reason: eval_result.veto_reason,
        feature_snapshot: fv,
      });
      totalSignals++;
    }
  }

  // Batch insert shadow signals
  if (shadowRows.length) {
    await sb.from("strategy_shadow_signals").insert(shadowRows);
  }

  return new Response(
    JSON.stringify({ ok: true, signals: totalSignals, blueprints: selected.length, symbols: symbols.length }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
