/**
 * ATLAS Fetch Guard
 *
 * Prevents drift: ensures fetch() only appears in explicitly allowed modules.
 * Allowlist: market-data-pump (Backbone), whale-exchange-scan (explicit),
 *            exchange_binance helper (explicit), news-engine (external API),
 *            crypto-data (external API).
 *
 * Run: npx tsx scripts/fetch_guard.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = "supabase/functions";

const ALLOW = [
  "supabase/functions/market-data-pump",
  "supabase/functions/whale-exchange-scan",
  "supabase/functions/whale-onchain-scan",
  "supabase/functions/news-engine",
  "supabase/functions/crypto-data",
  "supabase/functions/_shared/exchange_binance.ts",
];

function isAllowed(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return ALLOW.some(a => normalized.startsWith(a));
}

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const bad: string[] = [];
const allFiles = walkDir(ROOT);

for (const filePath of allFiles) {
  if (isAllowed(filePath)) continue;

  const txt = fs.readFileSync(filePath, "utf-8");
  // Match fetch( but not fetchJson definition or comments
  const lines = txt.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("//") || line.startsWith("*")) continue;
    // Match standalone fetch( calls (not fetchJson, not type annotations)
    if (/\bfetch\s*\(/.test(line) && !line.includes("fetchJson") && !line.includes("function fetch")) {
      bad.push(`${filePath}:${i + 1}: ${line.slice(0, 80)}`);
    }
  }
}

if (bad.length) {
  console.error("❌ fetch_guard FAILED. External fetch() found in prohibited files:");
  for (const b of bad) console.error("  -", b);
  process.exit(1);
} else {
  console.log("✅ fetch_guard passed. No prohibited fetch() calls found.");
}
