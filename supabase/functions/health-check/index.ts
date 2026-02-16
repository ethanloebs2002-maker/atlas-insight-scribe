import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type HealthStatus = "PASS" | "WARN" | "FAIL";

function sbAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function nowIso() { return new Date().toISOString(); }

function ok(status: HealthStatus, name: string, details: any, fix?: string) {
  return { status, name, details, fix: fix ?? null };
}

async function callLocalFunction(fnName: string, body: any) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const endpoint = `${url}/functions/v1/${fnName}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function pct(n: number, d: number) {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();
  const startedAt = nowIso();

  const body = await req.json().catch(() => ({}));
  const sampleClosedTrades = Math.max(10, Math.min(200, Number(body?.sample_closed_trades ?? 50)));
  const requireDerivatives = body?.require_derivatives ?? true;
  const requireExecutionCosts = body?.require_execution_costs ?? true;
  const requireMarketContext = body?.require_market_context ?? true;
  const requireWhaleContext = body?.require_whale_context ?? false;
  const runStressCalls = body?.run_stress_calls ?? true;

  const report: any = {
    ok: true,
    started_at: startedAt,
    config: {
      sample_closed_trades: sampleClosedTrades,
      require_market_context: requireMarketContext,
      require_derivatives: requireDerivatives,
      require_execution_costs: requireExecutionCosts,
      require_whale_context: requireWhaleContext,
      run_stress_calls: runStressCalls,
    },
    checks: [] as any[],
    summary: {},
  };

  // CHECK 0: DB connectivity / schema presence
  const requiredTables = [
    "atlas_assets",
    "paper_positions",
    "paper_decisions",
    "market_context_snapshots",
    "derivatives_context_snapshots",
    "execution_cost_snapshots",
    "scenario_reputation",
  ];

  const tableResults: Record<string, string> = {};
  for (const t of requiredTables) {
    const r = await sb.from(t).select("*", { count: "exact", head: true }).limit(1);
    tableResults[t] = r.error ? `ERR: ${r.error.message}` : "OK";
  }

  const missing = Object.entries(tableResults).filter(([, v]) => v.startsWith("ERR"));
  report.checks.push(
    missing.length === 0
      ? ok("PASS", "Schema presence", tableResults)
      : ok("FAIL", "Schema presence", tableResults, "Run v3.0 migrations for missing tables.")
  );

  if (missing.length > 0) {
    report.ok = false;
    report.summary = { status: "FAIL", reason: "Missing required tables/views", started_at: startedAt };
    return new Response(JSON.stringify(report, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  // CHECK 1: Enabled assets and exchange_symbol mapping coverage
  const assetsRes = await sb.from("atlas_assets").select("symbol, enabled, metadata").eq("enabled", true);
  const enabledAssets = assetsRes.data ?? [];
  const missingExchangeSymbol = enabledAssets.filter((a: any) => !a?.metadata?.exchange_symbol).map((a: any) => a.symbol);

  report.checks.push(
    missingExchangeSymbol.length === 0
      ? ok("PASS", "Enabled assets have exchange_symbol", { enabled_assets: enabledAssets.length })
      : ok("WARN", "Enabled assets missing metadata.exchange_symbol", { enabled_assets: enabledAssets.length, missing_exchange_symbol: missingExchangeSymbol },
          "Add metadata.exchange_symbol for each enabled asset so snapshotters can fetch market/derivatives data.")
  );

  // CHECK 2: Stress calls
  if (runStressCalls) {
    const stress: any[] = [];
    const withEx = enabledAssets.filter((a: any) => !!a?.metadata?.exchange_symbol).slice(0, 3);

    if (withEx.length === 0) {
      stress.push(ok("WARN", "Stress calls skipped", { reason: "No enabled assets with exchange_symbol" }));
    } else {
      const sym = withEx[0].symbol;

      const mc = await callLocalFunction("market-context-snap", { symbol: sym });
      stress.push(mc.ok
        ? ok("PASS", "market-context-snap invocation", { status: mc.status })
        : ok("FAIL", "market-context-snap invocation", { status: mc.status, response: mc.text }, "Check function deployment + EXCHANGE_BASE_URL + asset exchange_symbol."));

      const dc = await callLocalFunction("derivatives-context-snap", { symbol: sym });
      stress.push(dc.ok
        ? ok("PASS", "derivatives-context-snap invocation", { status: dc.status })
        : ok("FAIL", "derivatives-context-snap invocation", { status: dc.status, response: dc.text }, "Check function deployment + BINANCE_FUTURES_BASE_URL + futures symbol mapping."));

      const ec = await callLocalFunction("execution-cost-snap", { symbol: sym, notional_usd: 25000, side: "BUY" });
      stress.push(ec.ok
        ? ok("PASS", "execution-cost-snap invocation", { status: ec.status })
        : ok("FAIL", "execution-cost-snap invocation", { status: ec.status, response: ec.text }, "Check function deployment + EXCHANGE_BASE_URL."));

      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const wrote: any = {};

      const mcr = await sb.from("market_context_snapshots").select("id", { count: "exact" }).eq("symbol", sym).gte("snapshot_time", since);
      wrote.market_context = { count: mcr.count ?? 0, err: mcr.error?.message ?? null };

      const dcr = await sb.from("derivatives_context_snapshots").select("id", { count: "exact" }).eq("symbol", sym).gte("snapshot_time", since);
      wrote.derivatives_context = { count: dcr.count ?? 0, err: dcr.error?.message ?? null };

      const ecr = await sb.from("execution_cost_snapshots").select("id", { count: "exact" }).eq("symbol", sym).gte("snapshot_time", since);
      wrote.execution_cost = { count: ecr.count ?? 0, err: ecr.error?.message ?? null };

      const wroteOk =
        (wrote.market_context.count > 0 || !requireMarketContext) &&
        (wrote.derivatives_context.count > 0 || !requireDerivatives) &&
        (wrote.execution_cost.count > 0 || !requireExecutionCosts);

      stress.push(wroteOk
        ? ok("PASS", "Snapshot write verification (last 10m)", { symbol: sym, wrote })
        : ok("FAIL", "Snapshot write verification (last 10m)", { symbol: sym, wrote },
            "Functions may be running but not inserting. Check RLS (service role should bypass), table names, and insert payload fields."));
    }

    report.checks.push(ok("PASS", "Stress calls", stress));
  } else {
    report.checks.push(ok("WARN", "Stress calls", { skipped: true }, "Set run_stress_calls=true to actively ping snapshotters."));
  }

  // CHECK 3: Backcheck closed trades for linked artifacts
  const tradesRes = await sb
    .from("paper_positions")
    .select("id,symbol,filled_at,closed_at,realized_pnl")
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(sampleClosedTrades);

  const trades = tradesRes.data ?? [];
  if (trades.length === 0) {
    report.checks.push(ok("WARN", "Closed trades availability", { closed_trades: 0 }, "Close some trades; learning and attribution require outcomes."));
  } else {
    const tradeIds = trades.map((t: any) => t.id);

    const mcRes = await sb.from("market_context_snapshots").select("position_id", { count: "exact" }).in("position_id", tradeIds);
    const dcRes = await sb.from("derivatives_context_snapshots").select("position_id", { count: "exact" }).in("position_id", tradeIds);
    const ecRes = await sb.from("execution_cost_snapshots").select("position_id", { count: "exact" }).in("position_id", tradeIds);

    const mcSet = new Set((mcRes.data ?? []).map((r: any) => r.position_id).filter(Boolean));
    const dcSet = new Set((dcRes.data ?? []).map((r: any) => r.position_id).filter(Boolean));
    const ecSet = new Set((ecRes.data ?? []).map((r: any) => r.position_id).filter(Boolean));

    const missingArtifacts: any = {
      market_context_missing: [] as string[],
      derivatives_context_missing: [] as string[],
      execution_cost_missing: [] as string[],
    };

    for (const t of trades) {
      if (requireMarketContext && !mcSet.has(t.id)) missingArtifacts.market_context_missing.push(t.id);
      if (requireDerivatives && !dcSet.has(t.id)) missingArtifacts.derivatives_context_missing.push(t.id);
      if (requireExecutionCosts && !ecSet.has(t.id)) missingArtifacts.execution_cost_missing.push(t.id);
    }

    const okMc = missingArtifacts.market_context_missing.length === 0 || !requireMarketContext;
    const okDc = missingArtifacts.derivatives_context_missing.length === 0 || !requireDerivatives;
    const okEc = missingArtifacts.execution_cost_missing.length === 0 || !requireExecutionCosts;

    const status: HealthStatus = okMc && okDc && okEc ? "PASS" : ((missingArtifacts.market_context_missing.length + missingArtifacts.derivatives_context_missing.length + missingArtifacts.execution_cost_missing.length) < trades.length ? "WARN" : "FAIL");

    report.checks.push(
      ok(status, "Backcheck: closed trades have linked snapshots", {
        sampled_closed_trades: trades.length,
        coverage: {
          market_context: `${pct(trades.length - missingArtifacts.market_context_missing.length, trades.length)}%`,
          derivatives_context: `${pct(trades.length - missingArtifacts.derivatives_context_missing.length, trades.length)}%`,
          execution_cost: `${pct(trades.length - missingArtifacts.execution_cost_missing.length, trades.length)}%`,
        },
        missing_trade_ids: missingArtifacts,
      },
      status === "PASS" ? null : "Ensure snapshot hooks run at trade entry/cadence with trade_id set.")
    );
  }

  // CHECK 4: Scenario reputation updating
  const attribTable = "trade_scenario_attribution";
  const attribExists = (await sb.from(attribTable).select("*", { head: true }).limit(1)).error == null;

  if (!attribExists) {
    report.checks.push(
      ok("WARN", "Scenario attribution table presence", { table: attribTable, exists: false },
        "Create trade_scenario_attribution to enable reputation updates.")
    );
  } else {
    const ar = await sb.from(attribTable).select("trade_id,scenario_key").order("created_at", { ascending: false }).limit(200);
    const attribRows = ar.data ?? [];
    const attribTradeIds = new Set(attribRows.map((r: any) => r.trade_id).filter(Boolean));
    const rep = await sb.from("scenario_reputation").select("scenario_key,samples,posterior_mean,credibility").order("updated_at", { ascending: false }).limit(50);
    const repRows = rep.data ?? [];
    const repHasEvidence = repRows.some((r: any) => Number(r.samples ?? 0) >= 3);

    report.checks.push(
      ok(repHasEvidence ? "PASS" : "WARN", "Scenario reputation evidence", {
        attribution_rows_sampled: attribRows.length,
        unique_trades_with_attribution: attribTradeIds.size,
        reputation_rows_sampled: repRows.length,
        has_any_scenario_samples_ge_3: repHasEvidence,
      }, repHasEvidence ? null : "Run scenario-reputation-update on trade close and verify attribution rows are created.")
    );
  }

  // CHECK 5: Decision→Trade linkage sanity
  const tradesWithDecision = await sb
    .from("paper_positions")
    .select("id,decision_id")
    .not("decision_id", "is", null)
    .order("filled_at", { ascending: false })
    .limit(100);

  const tds = tradesWithDecision.data ?? [];
  const decisionIds = Array.from(new Set(tds.map((t: any) => t.decision_id).filter(Boolean)));

  if (decisionIds.length === 0) {
    report.checks.push(ok("WARN", "Decision linkage", { trades_with_decision_id: 0 }, "If trades are not linked to decisions, attribution and learning will be degraded."));
  } else {
    const dec = await sb.from("paper_decisions").select("id", { count: "exact" }).in("id", decisionIds);
    const existing = new Set((dec.data ?? []).map((r: any) => r.id));
    const missingDec = decisionIds.filter((id: string) => !existing.has(id));

    report.checks.push(
      missingDec.length === 0
        ? ok("PASS", "Decision linkage", { checked_decisions: decisionIds.length })
        : ok("FAIL", "Decision linkage", { checked_decisions: decisionIds.length, missing_decision_ids: missingDec }, "Some trades reference decision_ids that do not exist.")
    );
  }

  // Final summary
  const statuses = report.checks.map((c: any) => c.status);
  const hasFail = statuses.includes("FAIL");
  const hasWarn = statuses.includes("WARN");
  report.ok = !hasFail;

  report.summary = {
    status: hasFail ? "FAIL" : (hasWarn ? "WARN" : "PASS"),
    started_at: startedAt,
    finished_at: nowIso(),
    checks: {
      pass: statuses.filter((s: any) => s === "PASS").length,
      warn: statuses.filter((s: any) => s === "WARN").length,
      fail: statuses.filter((s: any) => s === "FAIL").length,
    },
    note: hasFail
      ? "At least one critical subsystem is not communicating correctly. Fix FAIL items first."
      : hasWarn
        ? "Core engine is connected, but evidence coverage is incomplete. Continue accumulating outcomes and verify hooks."
        : "All core subsystems appear to be communicating and producing learning artifacts.",
  };

  return new Response(JSON.stringify(report, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
});
