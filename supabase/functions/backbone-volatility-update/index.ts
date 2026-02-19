// ═══════════════════════════════════════════════════════════════════════════
// BACKBONE VOLATILITY UPDATE — calls DB-native rollup functions
// No external fetches. Reads market_bars_1m, writes market_volatility_rollups.
// BACKBONE SAFE ✅
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));

  // Determine which symbols to refresh
  const explicit: string[] | null = Array.isArray(body?.symbols) ? body.symbols : null;

  let symbols: string[];
  if (explicit?.length) {
    symbols = explicit;
  } else {
    // Default: all symbols that have bars
    const { data } = await sb
      .from("market_bars_1m")
      .select("symbol")
      .limit(200);
    symbols = [...new Set((data ?? []).map((r: any) => r.symbol))];
  }

  let updated = 0;
  const errors: string[] = [];

  for (const sym of symbols) {
    const { error } = await sb.rpc("refresh_market_volatility_rollups", { p_symbol: sym });
    if (error) {
      errors.push(`${sym}: ${error.message}`);
    } else {
      updated++;
    }
  }

  // Optional: prune old bars
  const prune = body?.prune_days ?? null;
  let pruned = 0;
  if (prune != null) {
    const { data: pResult } = await sb.rpc("prune_market_bars_1m", { p_keep_days: Number(prune) });
    pruned = Number(pResult ?? 0);
  }

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      updated,
      symbols_requested: symbols.length,
      pruned,
      errors: errors.length ? errors : undefined,
      note: "BACKBONE SAFE: DB-native rollup from market_bars_1m",
    }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
