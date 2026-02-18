/**
 * ATLAS Memory Guard — Static analysis for Memory pillar integrity.
 *
 * Detects writes to atlas_memory_events from non-approved modules,
 * detects new ad-hoc event tables that bypass Memory,
 * and validates source participation contract.
 *
 * Usage: npx tsx scripts/memory_guard.ts
 *
 * Exit code 1 if violations found.
 */

import * as fs from "fs";
import * as path from "path";

// ── Approved writers to atlas_memory_events ──────────────────────────
const MEMORY_TABLE = "atlas_memory_events";

const MEMORY_WRITE_WHITELIST = [
  "supabase/functions/_shared/memory.ts",
  "supabase/functions/memory-write/index.ts",
  "scripts/memory_guard.ts",
];

// ── Approved writers for other sensitive tables ──────────────────────
const SENSITIVE_TABLE_WRITERS: Record<string, string[]> = {
  latest_prices: ["supabase/functions/market-data-pump/", "supabase/functions/crypto-data/"],
  latest_orderbook: ["supabase/functions/market-data-pump/"],
  market_context_snapshots: ["supabase/functions/market-context-snap/", "supabase/functions/_shared/market_context.ts"],
  derivatives_context_snapshots: ["supabase/functions/derivatives-context-snap/"],
  execution_cost_snapshots: ["supabase/functions/execution-cost-snap/"],
  paper_positions: ["supabase/functions/paper-engine/", "supabase/functions/paper-engine-tick/"],
  paper_decisions: ["supabase/functions/paper-engine/", "supabase/functions/paper-engine-tick/", "supabase/functions/auto-eval/"],
  paper_orders: ["supabase/functions/paper-engine/", "supabase/functions/paper-engine-tick/"],
  paper_fills: ["supabase/functions/paper-engine-tick/"],
};

// ── Disallowed: creating new ad-hoc event tables from UI code ────────
const UI_INSERT_PATTERN = /\.from\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.\s*(?:insert|upsert)\s*\(/;

const UI_INSERT_WHITELIST = [
  "admin_messages",
  "profiles",
  "user_roles",
];

// ── All 10 registered sources (must match atlas_memory_sources) ──────
const REQUIRED_SOURCES = [
  "consensus", "market", "orderbook", "derivatives",
  "execution", "risk_lab", "policy", "whale", "news", "strategy",
];

// ── Helpers ──────────────────────────────────────────────────────────

function getAllTsFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", "build", ".vite"].includes(entry.name)) continue;
      getAllTsFiles(full, files);
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function normalize(p: string) { return p.replace(/\\/g, "/"); }

function isWhitelisted(filePath: string, whitelist: string[]): boolean {
  const norm = normalize(filePath);
  return whitelist.some(w => norm.endsWith(w) || norm.includes(w));
}

interface Violation {
  file: string;
  line: number;
  content: string;
  reason: string;
}

// ── Main scan ────────────────────────────────────────────────────────

const violations: Violation[] = [];

const allFiles: string[] = [];
for (const dir of ["src", "supabase/functions", "scripts"]) {
  getAllTsFiles(dir, allFiles);
}

// Check 1: atlas_memory_events writes outside whitelist
const memoryInsertPattern = new RegExp(`['"\`]${MEMORY_TABLE}['"\`]\\s*\\)\\s*\\.\\s*(?:insert|upsert|update)\\s*\\(`, "g");

for (const file of allFiles) {
  if (isWhitelisted(file, MEMORY_WRITE_WHITELIST)) continue;
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (memoryInsertPattern.test(lines[i])) {
      violations.push({
        file, line: i + 1,
        content: lines[i].trim().substring(0, 120),
        reason: `Direct write to ${MEMORY_TABLE} outside approved Memory writer`,
      });
    }
    memoryInsertPattern.lastIndex = 0;
  }
}

// Check 2: Sensitive table writes from wrong modules
for (const [table, allowed] of Object.entries(SENSITIVE_TABLE_WRITERS)) {
  const tablePattern = new RegExp(`['"\`]${table}['"\`]\\s*\\)\\s*\\.\\s*(?:insert|upsert)\\s*\\(`, "g");
  for (const file of allFiles) {
    if (isWhitelisted(file, allowed)) continue;
    if (normalize(file).includes("_shared/")) continue;
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (tablePattern.test(lines[i])) {
        violations.push({
          file, line: i + 1,
          content: lines[i].trim().substring(0, 120),
          reason: `Write to "${table}" from non-approved module. Allowed: ${allowed.join(", ")}`,
        });
      }
      tablePattern.lastIndex = 0;
    }
  }
}

// Check 3: UI code inserts into non-whitelisted tables
const srcFiles = getAllTsFiles("src");
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(UI_INSERT_PATTERN);
    if (match) {
      const tableName = match[1];
      if (!UI_INSERT_WHITELIST.includes(tableName)) {
        violations.push({
          file, line: i + 1,
          content: lines[i].trim().substring(0, 120),
          reason: `UI code inserts into "${tableName}". Route through Memory or an edge function.`,
        });
      }
    }
  }
}

// Check 4: Validate fan-out completeness in choke-point code
// Ensure memoryFanOut is used at all 3 choke points (not memoryWrite directly)
const CHOKE_POINT_FILES = [
  "supabase/functions/paper-engine/index.ts",
  "supabase/functions/paper-engine-tick/index.ts",
];

for (const relPath of CHOKE_POINT_FILES) {
  const fullPath = allFiles.find(f => normalize(f).endsWith(relPath));
  if (!fullPath) continue;
  const content = fs.readFileSync(fullPath, "utf-8");

  // Check for direct memoryWrite calls (should use memoryFanOut instead)
  const directWritePattern = /memoryWrite\s*\(/g;
  const fanOutPattern = /memoryFanOut\s*\(/g;

  const hasDirectWrite = directWritePattern.test(content);
  const hasFanOut = fanOutPattern.test(content);

  if (hasDirectWrite && !hasFanOut) {
    violations.push({
      file: relPath, line: 0,
      content: "Uses memoryWrite() directly instead of memoryFanOut()",
      reason: `Choke-point file must use memoryFanOut() for full source coverage. All ${REQUIRED_SOURCES.length} sources must report at each phase.`,
    });
  }
}

// ── Result ───────────────────────────────────────────────────────────

if (violations.length > 0) {
  console.error("\n❌ THIS BREAKS THE MEMORY, PLEASE ADJUST\n");
  console.error(`Found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}`);
    console.error(`    → ${v.reason}`);
    console.error(`    Fix: Route this write through Memory (atlas_memory_events) via memoryWrite() helper.\n`);
  }
  process.exit(1);
} else {
  console.log("✅ Memory Guard passed — no violations found.");
  console.log(`   ✓ Source participation contract: ${REQUIRED_SOURCES.length} sources required at each choke point`);
  console.log(`   ✓ Fan-out enforcement: choke-point files use memoryFanOut()`);
  process.exit(0);
}
