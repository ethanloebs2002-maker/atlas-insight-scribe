import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getEnabledAssets,
  insertSignals,
  logRunFinish,
  logRunStart,
  severityFromNotional,
  type WhaleSignalInsert,
} from "../_shared/whale.ts";

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { "accept": "application/json", ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: any, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function whaleAlertScan(opts: {
  apiKey: string;
  baseUrl: string;
  minUsdBySymbol: Record<string, number>;
}): Promise<WhaleSignalInsert[]> {
  const { apiKey, baseUrl, minUsdBySymbol } = opts;
  const now = Math.floor(Date.now() / 1000);
  const start = now - 10 * 60;
  const url = `${baseUrl}/transactions?api_key=${encodeURIComponent(apiKey)}&start=${start}`;

  const data = await fetchJson<any>(url);
  const txs: any[] = data?.transactions ?? data?.result ?? [];

  const out: WhaleSignalInsert[] = [];
  for (const t of txs) {
    const symbol = String(t.symbol ?? t.currency ?? "").toUpperCase();
    if (!symbol || !(symbol in minUsdBySymbol)) continue;

    const notional = Number(t.amount_usd ?? t.usd_amount ?? 0);
    const minUsd = minUsdBySymbol[symbol] ?? 1_000_000;
    if (!(notional >= minUsd)) continue;

    const chain = String(t.blockchain ?? t.chain ?? "").toLowerCase() || null;
    const ts = Number(t.timestamp ?? t.time ?? now) * 1000;

    out.push({
      symbol,
      source: "onchain",
      chain,
      signal_type: "LARGE_TRANSFER",
      event_time: new Date(ts).toISOString(),
      observed_price: null,
      notional_usd: notional,
      severity: severityFromNotional(notional, minUsd),
      from_entity: t.from?.owner ?? t.from?.address ?? null,
      to_entity: t.to?.owner ?? t.to?.address ?? null,
      metadata: {
        provider: "whale_alert",
        txid: t.txid ?? t.hash ?? null,
        from: t.from ?? null,
        to: t.to ?? null,
        raw: t,
      },
    });
  }
  return out;
}

async function bitqueryScan(opts: {
  apiKey: string;
  baseUrl: string;
  assets: { symbol: string; chain: string; contract?: string | null; minUsd: number }[];
}): Promise<WhaleSignalInsert[]> {
  const { apiKey, baseUrl, assets } = opts;
  const out: WhaleSignalInsert[] = [];

  for (const a of assets) {
    const query = `
      query WhaleTransfers($since: ISO8601DateTime!, $minUsd: Float!, $contract: String) {
        transfers: ethereumTransfers(
          since: $since,
          minUsd: $minUsd,
          contract: $contract
        ) {
          timestamp
          amountUsd
          hash
          from { address }
          to { address }
        }
      }
    `;

    const sinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const variables = { since: sinceIso, minUsd: a.minUsd, contract: a.contract ?? null };

    let res: any;
    try {
      res = await postJson<any>(
        baseUrl,
        { query, variables },
        { "X-API-KEY": apiKey, "Authorization": `Bearer ${apiKey}` },
      );
    } catch {
      continue;
    }

    const transfers: any[] = res?.data?.transfers ?? [];
    for (const t of transfers) {
      const notional = Number(t.amountUsd ?? 0);
      if (!(notional >= a.minUsd)) continue;

      out.push({
        symbol: a.symbol,
        source: "onchain",
        chain: a.chain,
        signal_type: "LARGE_TRANSFER",
        event_time: new Date(t.timestamp).toISOString(),
        observed_price: null,
        notional_usd: notional,
        severity: severityFromNotional(notional, a.minUsd),
        from_entity: t.from?.address ?? null,
        to_entity: t.to?.address ?? null,
        metadata: { provider: "bitquery", hash: t.hash ?? null, raw: t },
      });
    }
  }

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = await logRunStart("onchain", { invoked_by: "http", at: new Date().toISOString() });

  try {
    const assets = await getEnabledAssets();

    const minUsdBySymbol: Record<string, number> = {};
    for (const a of assets) minUsdBySymbol[a.symbol] = Number(a.whale_min_usd_onchain);

    const whaleAlertKey = Deno.env.get("WHALE_ALERT_API_KEY") ?? "";
    const whaleAlertBase = Deno.env.get("WHALE_ALERT_BASE_URL") ?? "";

    const bitqueryKey = Deno.env.get("BITQUERY_API_KEY") ?? "";
    const bitqueryBase = Deno.env.get("BITQUERY_BASE_URL") ?? "";

    const signals: WhaleSignalInsert[] = [];
    const meta: any = { providers: {} };

    if (whaleAlertKey && whaleAlertBase) {
      const s = await whaleAlertScan({ apiKey: whaleAlertKey, baseUrl: whaleAlertBase, minUsdBySymbol });
      signals.push(...s.filter((x) => minUsdBySymbol[x.symbol] !== undefined));
      meta.providers.whale_alert = { ok: true };
    } else {
      meta.providers.whale_alert = { ok: false, reason: "Missing WHALE_ALERT_API_KEY or WHALE_ALERT_BASE_URL" };
    }

    if (bitqueryKey && bitqueryBase) {
      const bqAssets = assets.map((a) => ({
        symbol: a.symbol,
        chain: a.chain,
        contract: a.contract_address,
        minUsd: Number(a.whale_min_usd_onchain),
      }));
      const s = await bitqueryScan({ apiKey: bitqueryKey, baseUrl: bitqueryBase, assets: bqAssets });
      signals.push(...s);
      meta.providers.bitquery = { ok: true };
    } else {
      meta.providers.bitquery = { ok: false, reason: "Missing BITQUERY_API_KEY or BITQUERY_BASE_URL" };
    }

    const emitted = await insertSignals(signals);
    await logRunFinish(runId, "OK", emitted, undefined, meta);

    return new Response(JSON.stringify({ ok: true, emitted, meta }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    await logRunFinish(runId, "ERROR", 0, String((e as Error)?.message ?? e), {});
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
