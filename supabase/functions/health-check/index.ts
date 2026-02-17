import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

type Check = { name: string; status: "PASS" | "WARN" | "FAIL"; details?: any };

function pass(name: string, details?: any): Check { return { name, status: "PASS", details }; }
function warn(name: string, details?: any): Check { return { name, status: "WARN", details }; }
function fail(name: string, details?: any): Check { return { name, status: "FAIL", details }; }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const body = await req.json().catch(() => ({}));

  const minutes = Number(body?.minutes ?? 180);
  const now = new Date();
  const since = new Date(now.getTime() - minutes * 60_000).toISOString();

  const checks: Check[] = [];
  const meta: any = { since, minutes };

  // ---------- A) Schema presence
  const requiredTables = [
    "paper_decisions",
    "paper_positions",
    "market_context_snapshots",
    "derivatives_context_snapshots",
    "execution_cost_snapshots",
    "trade_scenario_attribution",
    "paper_wallets",
    "paper_wallet_ledger",
  ];

  const tablePresence: Record<string, boolean> = {};
  for (const t of requiredTables) {
    const r = await sb.from(t).select("*", { count: "exact", head: true }).limit(1);
    tablePresence[t] = !r.error;
  }

  const missing = requiredTables.filter(t => !tablePresence[t]);
  if (missing.length) checks.push(fail("Schema presence", { missing, tablePresence }));
  else checks.push(pass("Schema presence", { tables: requiredTables.length }));

  // ---------- B) Position status counts
  async function countPositions(status: string) {
    const r = await sb.from("paper_positions").select("id", { count: "exact", head: true }).eq("status", status);
    return r.count ?? 0;
  }

  const pendingN = await countPositions("PENDING_ENTRY");
  const openN = await countPositions("OPEN");
  const closedN = await countPositions("CLOSED");
  const canceledN = await countPositions("CANCELED");

  checks.push(pass("Position status counts", { PENDING_ENTRY: pendingN, OPEN: openN, CLOSED: closedN, CANCELED: canceledN }));

  // ---------- C) Fill proof
  const recentFills = await sb
    .from("paper_positions")
    .select("id, asset_id, side, created_at, filled_at, entry_price, stop_loss, take_profit")
    .gte("filled_at", since)
    .order("filled_at", { ascending: false })
    .limit(50);

  const fills = recentFills.data ?? [];
  if (fills.length === 0) {
    checks.push(warn("Fill proof", { note: "No fills in window", since }));
  } else {
    const latMs = fills
      .map(p => (p.filled_at ? (new Date(p.filled_at).getTime() - new Date(p.created_at).getTime()) : null))
      .filter(x => typeof x === "number") as number[];
    const avgSec = latMs.length ? Math.round((latMs.reduce((a, b) => a + b, 0) / latMs.length) / 1000) : null;

    checks.push(pass("Fill proof", { fills: fills.length, avg_fill_latency_sec: avgSec, sample: fills.slice(0, 5) }));
  }

  // ---------- D) Close proof
  const recentCloses = await sb
    .from("paper_positions")
    .select("id, asset_id, side, filled_at, closed_at, realized_pnl, close_reason, stop_loss, take_profit, entry_price")
    .gte("closed_at", since)
    .order("closed_at", { ascending: false })
    .limit(50);

  const closes = recentCloses.data ?? [];
  if (closes.length === 0) checks.push(warn("Close proof", { note: "No closes in window yet", since }));
  else checks.push(pass("Close proof", { closes: closes.length, sample: closes.slice(0, 5) }));

  // ---------- E) Bracket sanity (OPEN positions)
  const openSample = await sb
    .from("paper_positions")
    .select("id, asset_id, side, entry_price, stop_loss, take_profit, filled_at, created_at")
    .eq("status", "OPEN")
    .order("filled_at", { ascending: false })
    .limit(50);

  const openRows = openSample.data ?? [];
  const invalid = openRows.filter(p => {
    const entry = Number(p.entry_price);
    const sl = Number(p.stop_loss);
    const tp = Number(p.take_profit);
    if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp)) return true;
    if (String(p.side).toUpperCase() === "LONG") return !(sl < entry && entry < tp);
    return !(tp < entry && entry < sl);
  });

  if (openRows.length === 0) checks.push(warn("Bracket sanity (OPEN)", { note: "No OPEN positions to validate" }));
  else if (invalid.length) checks.push(fail("Bracket sanity (OPEN)", { invalid: invalid.slice(0, 10), total_invalid: invalid.length, checked: openRows.length }));
  else checks.push(pass("Bracket sanity (OPEN)", { checked: openRows.length }));

  // ---------- F) Snapshot coverage on recent fills/closes
  const recentPosIds = Array.from(new Set([
    ...fills.map(p => p.id),
    ...closes.map(p => p.id),
  ])).slice(0, 50);

  async function snapshotCoverage(table: string) {
    if (recentPosIds.length === 0) return { table, coverage: null, note: "no recent positions" };
    const r = await sb.from(table).select("position_id", { count: "exact", head: false }).in("position_id", recentPosIds);
    if (r.error) return { table, error: r.error.message };
    const present = new Set((r.data ?? []).map((x: any) => x.position_id));
    const coverage = present.size / recentPosIds.length;
    return { table, coverage, present: present.size, total: recentPosIds.length };
  }

  const covMarket = await snapshotCoverage("market_context_snapshots");
  const covDeriv = await snapshotCoverage("derivatives_context_snapshots");
  const covExec = await snapshotCoverage("execution_cost_snapshots");

  checks.push(pass("Snapshot coverage (recent)", { covMarket, covDeriv, covExec }));

  // ---------- G) Attribution proof
  if (recentPosIds.length === 0) {
    checks.push(warn("Attribution proof", { note: "No recent filled/closed positions to check" }));
  } else {
    const a = await sb
      .from("trade_scenario_attribution")
      .select("position_id", { count: "exact", head: false })
      .in("position_id", recentPosIds);

    if (a.error) {
      checks.push(warn("Attribution proof", { error: a.error.message }));
    } else {
      const present = new Set((a.data ?? []).map((x: any) => x.position_id));
      const coverage = present.size / recentPosIds.length;

      if (present.size === 0) checks.push(warn("Attribution proof", { coverage, present: present.size, total: recentPosIds.length }));
      else checks.push(pass("Attribution proof", { coverage, present: present.size, total: recentPosIds.length }));
    }
  }

  // ---------- H) Wallet proof
  const w = await sb.from("paper_wallets").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (w.error || !w.data) {
    checks.push(fail("Wallet presence", { error: w.error?.message ?? "no wallet row" }));
  } else {
    checks.push(pass("Wallet presence", { currency: w.data.currency, balance: w.data.balance }));

    const ledger = await sb
      .from("paper_wallet_ledger")
      .select("event_type, amount, created_at, position_id", { count: "exact" })
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    const recentLedger = ledger.data ?? [];
    const pnlEvents = recentLedger.filter((x: any) => x.event_type === "TRADE_PNL");
    if (closes.length > 0 && pnlEvents.length === 0) {
      checks.push(warn("Wallet PnL credit proof", { note: "There are closes but no TRADE_PNL in window", closes: closes.length, pnl_events: 0 }));
    } else {
      checks.push(pass("Wallet PnL credit proof", { pnl_events: pnlEvents.length, sample: pnlEvents.slice(0, 5) }));
    }
  }

  // ---------- Final rollup
  const statusRank = { PASS: 0, WARN: 1, FAIL: 2 } as const;
  const overall =
    checks.reduce((mx, c) => (statusRank[c.status] > statusRank[mx] ? c.status : mx), "PASS" as "PASS" | "WARN" | "FAIL");

  return new Response(JSON.stringify({ ok: true, overall, meta, checks }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
