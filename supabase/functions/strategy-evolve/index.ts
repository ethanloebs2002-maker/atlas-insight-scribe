/**
 * ATLAS Strategy Evolve — Recombination Engine
 *
 * COLOSSAL PATCH:
 * - Gaussian mutation with additive step (prevents zero/explosion)
 * - Param bounds clamping (1e-6 .. 1e6)
 * - Genome sanitization on all inputs and outputs
 * - Explicit "shadow_only" tag on all children
 * - Consistent required-slot validation
 *
 * BACKBONE SAFE — no external fetches, pure DB operations.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

const MAX_PRIMITIVES = 8;
const PARAM_MIN = 1e-6;
const PARAM_MAX = 1e6;

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function gaussian(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function mutateNumber(val: number, scale = 0.12): number {
  // Additive mutation (more stable than multiplicative for small vals)
  const z = gaussian();
  const next = val + z * Math.max(PARAM_MIN, Math.abs(val) * scale);
  return clamp(next, PARAM_MIN, PARAM_MAX);
}

function mutateParams(params: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...params };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = mutateNumber(v, 0.15);
    }
  }
  return out;
}

function sanitizePrimitive(p: any): any | null {
  if (!p || typeof p !== "object") return null;
  return {
    key: String(p.key ?? p.type ?? "unknown"),
    params: mutateParams(p.params ?? p.default_params ?? {}),
    ...(p.weight != null ? { weight: p.weight } : {}),
    ...(p.name != null ? { name: p.name } : {}),
  };
}

function sanitizeGenome(genome: any): any {
  const SLOTS = ["signal", "gates", "risk", "exit", "sizing"];
  const out: any = {};
  for (const slot of SLOTS) {
    const arr = Array.isArray(genome?.[slot]) ? genome[slot] : [];
    out[slot] = arr.map(sanitizePrimitive).filter(Boolean);
  }
  return out;
}

function crossover(a: any, b: any): any {
  const A = sanitizeGenome(a);
  const B = sanitizeGenome(b);
  return sanitizeGenome({
    signal: A.signal.length ? A.signal : B.signal,
    gates: B.gates.length ? B.gates : A.gates,
    risk: (Math.random() > 0.5 ? A.risk : B.risk),
    exit: (Math.random() > 0.5 ? A.exit : B.exit),
    sizing: (Math.random() > 0.5 ? A.sizing : B.sizing),
  });
}

function countPrimitives(genome: any): number {
  return ["signal", "gates", "risk", "exit", "sizing"]
    .map(s => Array.isArray(genome?.[s]) ? genome[s].length : 0)
    .reduce((a, b) => a + b, 0);
}

function hasRequiredSlots(genome: any): boolean {
  const hasGate = Array.isArray(genome.gates) && genome.gates.length >= 1;
  const hasRisk = Array.isArray(genome.risk) && genome.risk.length >= 1;
  const hasExit = Array.isArray(genome.exit) && genome.exit.length >= 1;
  const hasTimeStop = genome.risk?.some((r: any) => r?.key === "time_stop") ?? false;
  return hasGate && hasRisk && (hasExit || hasTimeStop);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = sbAdmin();

  // Get top blueprints by reputation
  const { data: topBps } = await sb.from("strategy_reputation")
    .select("blueprint_id,reputation,confidence,strategy_blueprints(id,name,genome,tags)")
    .order("reputation", { ascending: false })
    .limit(10);

  const parents = (topBps ?? [])
    .filter((r: any) => r.strategy_blueprints)
    .map((r: any) => ({
      id: r.blueprint_id,
      name: r.strategy_blueprints.name,
      genome: sanitizeGenome(r.strategy_blueprints.genome),
      reputation: r.reputation,
    }));

  if (parents.length < 2) {
    return new Response(JSON.stringify({ ok: true, created: 0, msg: "need at least 2 parents" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const children: any[] = [];
  const nonce = Date.now().toString(36).slice(-5);

  // Mutations (top 4 parents)
  for (const p of parents.slice(0, 4)) {
    const mutated = sanitizeGenome(p.genome);
    if (countPrimitives(mutated) <= MAX_PRIMITIVES && hasRequiredSlots(mutated)) {
      children.push({
        name: `${p.name}_mut_${nonce}`,
        genome: mutated,
        tags: ["evolved", "mutation", "shadow_only"],
        is_active: false, // must pass shadow threshold first
        created_by: "atlas_evolve",
      });
    }
  }

  // Crossovers (pairs from top 6)
  const crossParents = parents.slice(0, 6);
  for (let i = 0; i < crossParents.length - 1; i += 2) {
    const child = crossover(crossParents[i].genome, crossParents[i + 1].genome);
    if (countPrimitives(child) <= MAX_PRIMITIVES && hasRequiredSlots(child)) {
      children.push({
        name: `cross_${crossParents[i].name.slice(0, 8)}_${crossParents[i + 1].name.slice(0, 8)}_${nonce}`,
        genome: child,
        tags: ["evolved", "crossover", "shadow_only"],
        is_active: false,
        created_by: "atlas_evolve",
      });
    }
  }

  let created = 0;
  if (children.length) {
    const { data, error } = await sb.from("strategy_blueprints").insert(children).select("id");
    if (!error && data) {
      created = data.length;
      // Initialize reputation for new children
      const repRows = data.map((d: any) => ({
        blueprint_id: d.id,
        reputation: 0,
        confidence: 0.1,
      }));
      await sb.from("strategy_reputation").upsert(repRows, { onConflict: "blueprint_id" });
    }
  }

  return new Response(JSON.stringify({ ok: true, created, parents: parents.length }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
