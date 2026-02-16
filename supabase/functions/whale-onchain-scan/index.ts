import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, ELITE_CRITERIA } from "../_shared/whale.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── On-chain whale scanning ────────────────────────────────────────────
// Scans on-chain data (DEX swaps, token transfers, LP activity) and
// correlates with known whale wallets. Logs events for attribution.

async function scanOnchainActivity(assetId: string, chain?: string) {
  console.log(`[WHALE_ONCHAIN_SCAN] Starting for ${assetId} chain=${chain || "all"}`);

  // 1. Fetch wallets with on-chain source
  const query = supabase
    .from("whale_wallets")
    .select("*")
    .eq("asset_id", assetId)
    .eq("is_active", true);

  const { data: wallets, error: wErr } = await query;

  if (wErr) {
    console.error("[WHALE_ONCHAIN_SCAN] Wallet fetch error:", wErr);
    return { wallets_scanned: 0, events: [] };
  }

  const events: Array<Record<string, unknown>> = [];

  // 2. Fetch on-chain-sourced positions
  let posQuery = supabase
    .from("whale_positions")
    .select("*, whale_wallets!inner(wallet_address, lot_win_rate, label, source)")
    .eq("asset_id", assetId)
    .eq("status", "OPEN");

  if (chain) {
    posQuery = posQuery.eq("chain", chain);
  }

  const { data: positions } = await posQuery.order("opened_at", { ascending: false }).limit(50);

  for (const pos of positions || []) {
    const walletData = (pos as any).whale_wallets;
    events.push({
      asset_id: assetId,
      event_type: "POSITION_OPEN",
      source: "onchain",
      whale_wallet_id: pos.whale_wallet_id,
      direction: pos.side,
      size_usd: pos.size_usd,
      confidence: pos.confidence,
      chain: pos.chain,
      tx_hash: pos.tx_hash,
      details_json: {
        entry_price: pos.entry_price,
        wallet_address: walletData?.wallet_address,
        wallet_label: walletData?.label,
        wallet_source: walletData?.source,
        win_rate: walletData?.lot_win_rate,
        chain: pos.chain,
        tx_hash: pos.tx_hash,
      },
    });
  }

  // 3. Recent closures on-chain
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  let closeQuery = supabase
    .from("whale_positions")
    .select("*, whale_wallets!inner(wallet_address, lot_win_rate, label)")
    .eq("asset_id", assetId)
    .eq("status", "CLOSED")
    .gte("closed_at", cutoff);

  if (chain) {
    closeQuery = closeQuery.eq("chain", chain);
  }

  const { data: closedPositions } = await closeQuery.order("closed_at", { ascending: false }).limit(20);

  for (const pos of closedPositions || []) {
    events.push({
      asset_id: assetId,
      event_type: "POSITION_CLOSE",
      source: "onchain",
      whale_wallet_id: pos.whale_wallet_id,
      direction: pos.side,
      size_usd: pos.size_usd,
      confidence: pos.confidence,
      chain: pos.chain,
      tx_hash: pos.tx_hash,
      details_json: {
        entry_price: pos.entry_price,
        exit_price: pos.exit_price,
        pnl_usd: pos.pnl_usd,
        hold_time_hours: pos.hold_time_hours,
      },
    });
  }

  // 4. Persist events
  if (events.length > 0) {
    const { error: insertErr } = await supabase
      .from("whale_watch_events")
      .insert(events);
    if (insertErr) console.error("[WHALE_ONCHAIN_SCAN] Insert error:", insertErr);
  }

  // 5. Log scan summary
  await supabase.from("whale_watch_events").insert({
    asset_id: assetId,
    event_type: "SCAN",
    source: "onchain",
    chain: chain || null,
    details_json: {
      wallets_total: wallets?.length || 0,
      open_positions: positions?.length || 0,
      closed_48h: closedPositions?.length || 0,
      events_logged: events.length,
      chain: chain || "all",
    },
  });

  console.log(`[WHALE_ONCHAIN_SCAN] Done: ${events.length} events`);

  return {
    wallets_scanned: wallets?.length || 0,
    open_positions: positions?.length || 0,
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
    const chain = url.searchParams.get("chain") || undefined;

    if (!asset) throw new Error("asset parameter required");

    const result = await scanOnchainActivity(asset, chain);
    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WHALE_ONCHAIN_SCAN] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
