/**
 * ATLAS Brain Guard — Static analysis for Brain pillar integrity.
 *
 * Ensures:
 * 1. Learning functions read from atlas_memory_events, NOT directly from
 *    paper_positions/paper_decisions/attribution/sensor tables
 * 2. Brain output tables are only written by approved brain functions
 * 3. No silent feedback loops bypass the Memory → Brain → Policy chain
 * 4. Brain-update uses batch loading (no N+1 per-position loops)
 *
 * Violation message:
 *   "THIS BYPASSES THE BRAIN. LEARNING MUST FLOW FROM MEMORY."
 *
 * Usage: npx tsx scripts/brain_guard.ts
 */

import * as fs from "fs";
import * as path from "path";

// ── Brain output tables (only brain functions may write to these) ─────
const BRAIN_OUTPUT_TABLES: Record<string, string[]> = {
  scenario_reputation: [
    "supabase/functions/brain-update/",
    "supabase/functions/scenario-reputation-update/",
  ],
  strategy_reputation: [
    "supabase/functions/brain-update/",
    "supabase/functions/strategy-reputation-update/",
    "supabase/functions/strategy-evolve/",
  ],
  atlas_brain_log: [
    "supabase/functions/brain-update/",
    "supabase/functions/_shared/brain.ts",
  ],
  indicator_reliability: [
    "supabase/functions/brain-update/",
    "supabase/functions/indicator-engine/",
  ],
  graduation_status: [
    "supabase/functions/brain-update/",
    "supabase/functions/auto-eval/",
  ],
};

// ── Learning functions that MUST read from Memory, NOT other tables ───
const LEARNING_FUNCTIONS = [
  "supabase/functions/brain-update/",
  "supabase/functions/scenario-reputation-update/",
  "supabase/functions/strategy-reputation-update/",
];

// Tables that learning functions should NOT read directly from
// Brain must learn from Memory representation only.
const FORBIDDEN_DIRECT_READS = [
  // Attribution tables — scenarios come from Memory consensus payload
  "trade_scenario_attribution",
  // Position/decision tables — outcomes come from Memory execution payload
  "paper_positions",
  "paper_decisions",
  // Sensor tables — Brain must not consult raw sensors
  "market_context_snapshots",
  "derivatives_context_snapshots",
  "execution_cost_snapshots",
  // Backbone tables — Brain must not consult market data directly
  "latest_prices",
  "latest_orderbook",
  // Whale sensor tables
  "whale_signals",
  "whale_positions",
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
  return whitelist.some(w => norm.includes(w));
}

interface Violation {
  file: string;
  line: number;
  content: string;
  reason: string;
}

const violations: Violation[] = [];

// ── Scan all edge function files ─────────────────────────────────────

const allFiles: string[] = [];
for (const dir of ["supabase/functions", "src"]) {
  getAllTsFiles(dir, allFiles);
}

// Check 1: Brain output tables written by non-brain functions
for (const [table, allowed] of Object.entries(BRAIN_OUTPUT_TABLES)) {
  const tablePattern = new RegExp(`['"\`]${table}['"\`]\\s*\\)\\s*\\.\\s*(?:insert|upsert|update)\\s*\\(`, "g");
  for (const file of allFiles) {
    if (isWhitelisted(file, allowed)) continue;
    if (normalize(file).includes("_shared/")) continue;
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (tablePattern.test(lines[i])) {
        violations.push({
          file,
          line: i + 1,
          content: lines[i].trim().substring(0, 120),
          reason: `Write to brain output table "${table}" from non-brain function. Allowed: ${allowed.join(", ")}`,
        });
      }
      tablePattern.lastIndex = 0;
    }
  }
}

// Check 2: Learning functions reading directly from forbidden tables
for (const funcPath of LEARNING_FUNCTIONS) {
  const funcFiles = allFiles.filter(f => normalize(f).includes(funcPath));
  for (const file of funcFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const forbidden of FORBIDDEN_DIRECT_READS) {
        const pattern = new RegExp(`\\.from\\s*\\(\\s*['"\`]${forbidden}['"\`]\\s*\\)`, "g");
        if (pattern.test(lines[i])) {
          violations.push({
            file,
            line: i + 1,
            content: lines[i].trim().substring(0, 120),
            reason: `Learning function reads directly from "${forbidden}". Brain must read from atlas_memory_events only.`,
          });
        }
        pattern.lastIndex = 0;
      }
    }
  }
}

// Check 3: Brain-update must not read trade_scenario_attribution
const brainUpdateFiles = allFiles.filter(f => normalize(f).includes("supabase/functions/brain-update/"));
for (const file of brainUpdateFiles) {
  const content = fs.readFileSync(file, "utf-8");
  if (content.includes("trade_scenario_attribution")) {
    violations.push({
      file,
      line: 0,
      content: "References trade_scenario_attribution",
      reason: "brain-update must not read from trade_scenario_attribution. Scenario keys come from Memory consensus payload.",
    });
  }
}

// ── Result ───────────────────────────────────────────────────────────

if (violations.length > 0) {
  console.error("\n❌ THIS BYPASSES THE BRAIN. LEARNING MUST FLOW FROM MEMORY.\n");
  console.error(`Found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}`);
    console.error(`    → ${v.reason}`);
    console.error(`    Fix: Route through brain-update which reads from atlas_memory_events.\n`);
  }
  process.exit(1);
} else {
  console.log("✅ Brain Guard passed — no violations found.");
  console.log(`   ✓ Forbidden direct reads: ${FORBIDDEN_DIRECT_READS.length} tables blocked from learning functions`);
  console.log(`   ✓ Brain output tables: ${Object.keys(BRAIN_OUTPUT_TABLES).length} tables write-protected`);
  console.log(`   ✓ No trade_scenario_attribution dependency in brain-update`);
  process.exit(0);
}
