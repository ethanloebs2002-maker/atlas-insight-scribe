/**
 * ATLAS Brain Guard — Static analysis for Brain pillar integrity.
 *
 * Ensures:
 * 1. Learning functions read from atlas_memory_events, NOT directly from paper_positions/paper_decisions
 * 2. Brain output tables are only written by approved brain functions
 * 3. No silent feedback loops bypass the Memory → Brain → Policy chain
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
    "supabase/functions/scenario-reputation-update/", // legacy, being migrated
  ],
  strategy_reputation: [
    "supabase/functions/brain-update/",
    "supabase/functions/strategy-reputation-update/", // legacy, being migrated
    "supabase/functions/strategy-evolve/",             // initializes reputation for new children
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

// ── Learning functions that MUST read from Memory, NOT paper_positions ─
const LEARNING_FUNCTIONS = [
  "supabase/functions/brain-update/",
  "supabase/functions/scenario-reputation-update/",
  "supabase/functions/strategy-reputation-update/",
];

// Tables that learning functions should NOT read directly from
const FORBIDDEN_DIRECT_READS = [
  "paper_positions",
  "paper_decisions",
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

// Check 2: Learning functions reading directly from paper_positions/paper_decisions
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
  process.exit(0);
}
