/**
 * ATLAS Healthcheck (read-only)
 * - Runs local guards
 * - Runs key SQL checks via Supabase service role
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/atlas_healthcheck.ts
 *
 * NOTE: The sql() helper requires a `run_sql` database RPC function.
 *       If that doesn't exist, the guard section will still work —
 *       run the SQL queries manually via Lovable Cloud SQL editor.
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

async function sql<T = any>(q: string): Promise<T[]> {
  const { data, error } = await sb.rpc("run_sql", { query: q });
  if (error) throw new Error(error.message);
  return data as T[];
}

async function main() {
  console.log("\n=== 1) Guards ===");
  run("npm run memory_guard");
  run("npm run brain_guard");
  run("npm run backbone_guard");

  console.log("\n=== 2) Backbone freshness ===");
  const priceFresh = await sql(`
    select symbol, now() - max(captured_at) as age, max(captured_at) as last_ts
    from latest_prices group by symbol order by age desc;
  `);
  console.table(priceFresh.slice(0, 10));

  const obFresh = await sql(`
    select symbol, now() - max(captured_at) as age, max(captured_at) as last_ts
    from latest_orderbook group by symbol order by age desc;
  `);
  console.table(obFresh.slice(0, 10));

  console.log("\n=== 3) Memory coverage (recent) ===");
  const memCoverage = await sql(`
    select phase, trace_id, count(*) as events_written, max(ts) as last_ts
    from atlas_memory_events
    where ts > now() - interval '6 hours'
    group by phase, trace_id
    order by last_ts desc
    limit 25;
  `);
  console.table(memCoverage);

  console.log("\n=== 4) Brain loop ===");
  const exitClosed = await sql(`
    select count(*)::int as exit_closed_events, max(ts) as last_exit_closed
    from atlas_memory_events
    where phase='EXIT_CLOSED' and source='execution';
  `);
  console.table(exitClosed);

  const brainLogs = await sql(`
    select date_trunc('hour', ts) as hour, target_table, update_type, count(*)::int as n
    from atlas_brain_log
    where ts > now() - interval '72 hours'
    group by 1,2,3
    order by hour desc, target_table, update_type
    limit 50;
  `);
  console.table(brainLogs);

  console.log("\nHealthcheck complete.");
}

main().catch((e) => {
  console.error("\n❌ Healthcheck failed:", e.message);
  process.exit(1);
});
