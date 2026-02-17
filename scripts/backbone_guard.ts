/**
 * ATLAS Backbone Guard
 *
 * Scans the repository for disallowed direct market API fetches
 * outside the canonical Market Data Layer.
 *
 * Usage: npx ts-node scripts/backbone_guard.ts
 *   or:  node scripts/backbone_guard.ts  (if pre-compiled)
 *
 * Exit code 1 if violations found.
 */

import * as fs from "fs";
import * as path from "path";

// Whitelisted files that ARE allowed to fetch external market APIs
const WHITELIST = [
  "supabase/functions/market-data-pump/index.ts",
  "supabase/functions/crypto-data/index.ts",
  // Whale scanners use Binance for trade/volume scanning (not price sourcing)
  "supabase/functions/whale-exchange-scan/index.ts",
  "supabase/functions/whale-onchain-scan/index.ts",
  // Market context snap uses Binance for depth/volatility snapshots
  "supabase/functions/_shared/market_context.ts",
  // Execution cost snap uses Binance depth for slippage estimation
  "supabase/functions/execution-cost-snap/index.ts",
  // Derivatives context uses Binance futures for funding/OI
  "supabase/functions/_shared/exchange_binance.ts",
  "supabase/functions/derivatives-context-snap/index.ts",
  // The guard itself
  "scripts/backbone_guard.ts",
];

// Patterns that indicate direct external market API usage
const DISALLOWED_PATTERNS = [
  /fetch\s*\(\s*[`'"]https?:\/\/(min-api\.)?cryptocompare\.com/i,
  /fetch\s*\(\s*[`'"]https?:\/\/(api|data-api)\.binance\.(com|vision)/i,
  /fetch\s*\(\s*[`'"]https?:\/\/api\.coinbase\.com/i,
  /fetch\s*\(\s*[`'"]https?:\/\/api\.coingecko\.com/i,
  // Also catch variable-based binance URLs used for price fetching
  /fetch\s*\(\s*`\$\{.*\}\/api\/v3\/ticker/i,
];

// Also flag "bookTicker" or "klines" fetches outside whitelist
const PRICE_ENDPOINT_PATTERNS = [
  /\/api\/v3\/ticker\/bookTicker/,
  /\/api\/v3\/ticker\/price/,
  /\/api\/v3\/ticker\/24hr/,
  /\/data\/v2\/histo(minute|hour|day)/,
  /\/data\/pricemultifull/,
];

function getAllTsFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      getAllTsFiles(fullPath, files);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isWhitelisted(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return WHITELIST.some((w) => normalized.endsWith(w));
}

interface Violation {
  file: string;
  line: number;
  content: string;
  pattern: string;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of [...DISALLOWED_PATTERNS, ...PRICE_ENDPOINT_PATTERNS]) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          content: line.trim().substring(0, 120),
          pattern: pattern.source,
        });
      }
    }
  }

  return violations;
}

// Main
const dirs = ["src", "supabase/functions"];
const allFiles: string[] = [];
for (const dir of dirs) {
  getAllTsFiles(dir, allFiles);
}

const allViolations: Violation[] = [];
for (const file of allFiles) {
  if (isWhitelisted(file)) continue;
  const v = scanFile(file);
  allViolations.push(...v);
}

if (allViolations.length > 0) {
  console.error("\n❌ THIS WILL BREAK YOUR BACKBONE, PLEASE ADJUST\n");
  console.error(`Found ${allViolations.length} violation(s):\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}`);
    console.error(`    → Route through market-data-pump + canonical tables / marketData.ts\n`);
  }
  process.exit(1);
} else {
  console.log("✅ Backbone guard passed — no violations found.");
  process.exit(0);
}
