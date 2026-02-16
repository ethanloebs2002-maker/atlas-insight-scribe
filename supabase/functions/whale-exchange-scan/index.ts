import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, ELITE_CRITERIA, confidenceTier } from "../_shared/whale.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Exchange-based whale scanning ──────────────────────────────────────
// Scans exchange order-flow data (large fills, liquidation events, OI shifts)
// and attributes them to known whale wallets when possible.

async function scanExchangeActivity(assetId: string) {
  console.log(`[WHALE_EXCHANGE_SCAN] Starting scan for ${assetId}`);

  // 1. Fetch active whale wallets for this asset
  const { data: wallets, error: wErr } = await supabase
    .from("whale_wallets")
    .select("*")
    .eq("asset_id", assetId)
    .eq("is_active", true)
    .order("lot_win_rate", { ascending: false });

  if (wErr) {
    console.error("[WHALE_EXCHANGE_SCAN] Wallet fetch error:", wErr);
    return { wallets_scanned: 0, events: [] };
  }

  const events: Array<Record<string, unknown>> = [];
  const eliteWallets = (wallets || []).filter(
    (w) =>
      w.lot_win_rate >= ELITE_CRITERIA.min_win_rate &&
      w.trade_count >= ELITE_CRITERIA.min_trade_count &&
      w.integrity_score >= ELITE_CRITERIA.min_integrity_score
  );

  // 2. Check for recent open positions from elite wallets
  const { data: openPositions } = await supabase
    .from("whale_positions")
    .select("*, whale_wallets!inner(wallet_address, lot_win_rate, label)")
    .eq("asset_id", assetId)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false })
    .limit(50);

  for (const pos of openPositions || []) {
    events.push({
      asset_id: assetId,
      event_type: "POSITION_OPEN",
      source: "exchange",
      whale_wallet_id: pos.whale_wallet_id,
      direction: pos.side,
      size_usd: pos.size_usd,
      confidence: pos.confidence,
      details_json: {
        entry_price: pos.entry_price,
        wallet_address: (pos as any).whale_wallets?.wallet_address,
        wallet_label: (pos as any).whale_wallets?.label,
        win_rate: (pos as any).whale_wallets?.lot_win_rate,
      },
    });
  }

  // 3. Check recently closed positions for performance tracking
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: closedPositions } = await supabase
    .from("whale_positions")
    .select("*, whale_wallets!inner(wallet_address, lot_win_rate, label)")
    .eq("asset_id", assetId)
    .eq("status", "CLOSED")
    .gte("closed_at", cutoff)
    .order("closed_at", { ascending: false })
    .limit(20);

  for (const pos of closedPositions || []) {
    events.push({
      asset_id: assetId,
      event_type: "POSITION_CLOSE",
      source: "exchange",
      whale_wallet_id: pos.whale_wallet_id,
      direction: pos.side,
      size_usd: pos.size_usd,
      confidence: pos.confidence,
      details_json: {
        entry_price: pos.entry_price,
        exit_price: pos.exit_price,
        pnl_usd: pos.pnl_usd,
        hold_time_hours: pos.hold_time_hours,
        wallet_address: (pos as any).whale_wallets?.wallet_address,
        wallet_label: (pos as any).whale_wallets?.label,
      },
    });
  }

  // 4. Insert scan event
  if (events.length > 0) {
    const { error: insertErr } = await supabase
      .from("whale_watch_events")
      .insert(events);
    if (insertErr) console.error("[WHALE_EXCHANGE_SCAN] Insert error:", insertErr);
  }

  // 5. Log scan summary
  await supabase.from("whale_watch_events").insert({
    asset_id: assetId,
    event_type: "SCAN",
    source: "exchange",
    details_json: {
      wallets_total: wallets?.length || 0,
      wallets_elite: eliteWallets.length,
      open_positions: openPositions?.length || 0,
      closed_24h: closedPositions?.length || 0,
      events_logged: events.length,
    },
  });

  console.log(`[WHALE_EXCHANGE_SCAN] Done: ${events.length} events for ${assetId}`);

  return {
    wallets_scanned: wallets?.length || 0,
    elite_count: eliteWallets.length,
    open_positions: openPositions?.length || 0,
    events_logged: events.length,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const asset = url.searchParams.get("asset");

    if (!asset) throw new Error("asset parameter required");

    const result = await scanExchangeActivity(asset);
    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WHALE_EXCHANGE_SCAN] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
