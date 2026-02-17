/**
 * ATLAS Guard — Static analysis tool for canonical integrity.
 *
 * Usage: npm run guard
 *        (or: npx tsx scripts/atlas_guard.ts)
 *
 * Steps:
 *  1. Run existing backbone guard
 *  2. Check canonical symbol duplication
 *  3. Check accidental duplicate files
 *  4. Check backbone bypass in src/
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ── Step 1: Run existing backbone guard ──────────────────────────────────────

console.log("⏳ Step 1/4 — Running backbone guard...");
try {
  execSync("npx tsx scripts/backbone_guard.ts", { stdio: "inherit" });
} catch {
  console.error("\n❌ Backbone guard failed. Aborting atlas guard.");
  process.exit(1);
}

// ── Step 2: Load config ──────────────────────────────────────────────────────

interface GuardConfig {
  allowedDuplicateGlobs: string[];
  canonicalSymbolNames: string[];
  canonicalFileHints: string[];
  forbiddenInUiExecution: string[];
  restrictedDirs: string[];
}

const configPath = path.join(__dirname, "atlas_guard.config.json");
const config: GuardConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Check if a file path matches any of the allowed duplicate globs (simplified) */
function isAllowedDuplicate(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return config.allowedDuplicateGlobs.some((glob) => {
    // Convert simple globs to a test:
    // **/__tests__/** → /__tests__/
    // **/*.test.* → .test.
    const fragment = glob
      .replace(/^\*\*\//, "")
      .replace(/\/\*\*$/, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "");
    return normalized.includes(fragment);
  });
}

let failed = false;

// ── Step 3: Canonical symbol duplication check ───────────────────────────────

console.log("\n⏳ Step 3/4 — Checking canonical symbol duplication...");

const srcFiles = getAllTsFiles("src");

const DEFINITION_RE = /^export\s+(?:function|const|type|interface)\s+(\w+)/;

for (const symbol of config.canonicalSymbolNames) {
  const locations: string[] = [];

  for (const file of srcFiles) {
    if (isAllowedDuplicate(file)) continue;
    const lines = fs.readFileSync(file, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(DEFINITION_RE);
      if (match && match[1] === symbol) {
        locations.push(`${file}:${i + 1}`);
      }
    }
  }

  if (locations.length > 1) {
    failed = true;
    console.error(`\n❌ Duplicate canonical symbol "${symbol}" defined in ${locations.length} places:`);
    for (const loc of locations) {
      console.error(`   ${loc}`);
    }
  }
}

// ── Step 4: Accidental duplicate file detection ──────────────────────────────

console.log("\n⏳ Step 4/4a — Checking for accidental duplicate files...");

const allProjectFiles: string[] = [];
for (const dir of config.restrictedDirs) {
  getAllTsFiles(dir, allProjectFiles);
}

for (const hint of config.canonicalFileHints) {
  const hintLower = hint.toLowerCase();
  const matching = allProjectFiles.filter((f) => {
    if (isAllowedDuplicate(f)) return false;
    const base = path.basename(f).toLowerCase();
    return base.includes(hintLower);
  });

  if (matching.length > 1) {
    failed = true;
    console.error(`\n❌ Multiple files match canonical hint "${hint}":`);
    for (const f of matching) {
      console.error(`   ${f}`);
    }
    console.error(`   → Ensure only one canonical file exists per concept.`);
  }
}

// ── Step 5: Backbone bypass prevention in src/ ───────────────────────────────

console.log("⏳ Step 4/4b — Checking for backbone bypass in src/...");

for (const file of srcFiles) {
  if (isAllowedDuplicate(file)) continue;
  const lines = fs.readFileSync(file, "utf-8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const forbidden of config.forbiddenInUiExecution) {
      if (line.includes(forbidden)) {
        failed = true;
        console.error(`\n❌ Forbidden term "${forbidden}" found:`);
        console.error(`   ${file}:${i + 1}`);
        console.error(`   ${line.trim().substring(0, 120)}`);
      }
    }
  }
}

// ── Result ───────────────────────────────────────────────────────────────────

if (failed) {
  console.error("\n❌ ATLAS Guard FAILED — fix violations above.");
  process.exit(1);
} else {
  console.log("\n✅ ATLAS Guard passed — no violations found.");
  process.exit(0);
}
