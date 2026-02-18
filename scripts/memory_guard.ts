/**
 * ATLAS Memory Guard — Static analysis for Memory pillar integrity.
 *
 * Detects writes to atlas_memory_events from non-approved modules,
 * and detects new ad-hoc event tables that bypass Memory.
 *
 * Usage: npx tsx scripts/memory_guard.ts
 *
 * Exit code 1 if violations found.
 */

import * as fs from "fs";
import * as path from "path";

// ── Approved writers to atlas_memory_events ──────────────────────────────
const MEMORY_TABLE = "atlas_memory_events";

const MEMORY_WRITE_WHITELIST = [
  "supabase/functions/_shared/memory.ts",
  "supabase/functions/memory-write/index.ts",
  "scripts/memory_guard.ts",
];

// ── Approved writers for other sensitive tables ──────────────────────────
// Maps table → list of allowed file path suffixes
const SENSITIVE_TABLE_WRITERS: Record<string, string[]> = {
  // Backbone pillar
  latest_prices: ["supabase/functions/market-data-pump/", "supabase/functions/crypto-data/"],
  latest_orderbook: ["supabase/functions/market-data-pump/"],
  // Snapshot tables: only their dedicated snapshotters
  market_context_snapshots: ["supabase/functions/market-context-snap/", "supabase/functions/_shared/market_context.ts"],
  derivatives_context_snapshots: ["supabase/functions/derivatives-context-snap/"],
  execution_cost_snapshots: ["supabase/functions/execution-cost-snap/"],
  // Engine tables: only from engine functions
  paper_positions: ["supabase/functions/paper-engine/", "supabase/functions/paper-engine-tick/"],
  paper_decisions: ["supabase/functions/paper-engine/", "supabase/functions/paper-engine-tick/", "supabase/functions/auto-eval/"],
  paper_orders: ["supabase/functions/paper-engine/", "supabase/functions/paper-engine-tick/"],
  paper_fills: ["supabase/functions/paper-engine-tick/"],
};

// ── Disallowed: creating new ad-hoc event tables from UI code ────────────
// Patterns that suggest someone is inserting into random tables from src/
const UI_INSERT_PATTERN = /\.from\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.\s*(?:insert|upsert)\s*\(/;

// Tables that UI is allowed to insert into
const UI_INSERT_WHITELIST = [
  "admin_messages",
  "profiles",
  "user_roles",
];

// ── Helpers ──────────────────────────────────────────────────────────────

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

function normalize(p: string) {
  return p.replace(/\\/g, "/");
}

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

// ── Main scan ────────────────────────────────────────────────────────────

const violations: Violation[] = [];

// 1. Check for atlas_memory_events writes outside whitelist
const allFiles: string[] = [];
for (const dir of ["src", "supabase/functions", "scripts"]) {
  getAllTsFiles(dir, allFiles);
}

const memoryInsertPattern = new RegExp(`['"\`]${MEMORY_TABLE}['"\`]\\s*\\)\\s*\\.\\s*(?:insert|upsert|update)\\s*\\(`, "g");

for (const file of allFiles) {
  if (isWhitelisted(file, MEMORY_WRITE_WHITELIST)) continue;
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (memoryInsertPattern.test(lines[i])) {
      violations.push({
        file,
        line: i + 1,
        content: lines[i].trim().substring(0, 120),
        reason: `Direct write to ${MEMORY_TABLE} outside approved Memory writer`,
      });
    }
    memoryInsertPattern.lastIndex = 0;
  }
}

// 2. Check sensitive table writes from wrong modules
for (const [table, allowed] of Object.entries(SENSITIVE_TABLE_WRITERS)) {
  const tablePattern = new RegExp(`['"\`]${table}['"\`]\\s*\\)\\s*\\.\\s*(?:insert|upsert)\\s*\\(`, "g");
  for (const file of allFiles) {
    if (isWhitelisted(file, allowed)) continue;
    // Also allow shared helpers used by the approved modules
    if (normalize(file).includes("_shared/")) continue;
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (tablePattern.test(lines[i])) {
        violations.push({
          file,
          line: i + 1,
          content: lines[i].trim().substring(0, 120),
          reason: `Write to "${table}" from non-approved module. Allowed: ${allowed.join(", ")}`,
        });
      }
      tablePattern.lastIndex = 0;
    }
  }
}

// 3. Check UI code (src/) for inserts into non-whitelisted tables
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
          file,
          line: i + 1,
          content: lines[i].trim().substring(0, 120),
          reason: `UI code inserts into "${tableName}". Route through Memory (atlas_memory_events) via memoryWrite() helper or an edge function.`,
        });
      }
    }
  }
}

// ── Result ───────────────────────────────────────────────────────────────

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
  process.exit(0);
}
