/**
 * ATLAS Strategy Evolve — Recombination Engine
 * Creates new blueprints via mutation + crossover of top performers.
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

function gaussianStep(val: number, scale = 0.1): number {
  // Simple Box-Muller approximation
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return val * (1 + z * scale);
}

function mutateParams(params: Record<string, any>): Record<string, any> {
  const result = { ...params };
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === "number") {
      result[k] = Math.max(0, gaussianStep(v, 0.15));
    }
  }
  return result;
}

function mutatePrimitive(prim: any): any {
  return {
    ...prim,
    params: mutateParams(prim.params ?? prim.default_params ?? {}),
  };
}

function mutateGenome(genome: any): any {
  const result: any = {};
  for (const [slot, prims] of Object.entries(genome)) {
    if (!Array.isArray(prims)) { result[slot] = prims; continue; }
    result[slot] = (prims as any[]).map(mutatePrimitive);
  }
  return result;
}

function crossover(parentA: any, parentB: any): any {
  // Take signal from A, gates from B, risk from best of either, sizing random
  return {
    signal: parentA.signal ?? parentB.signal ?? [],
    gates: parentB.gates ?? parentA.gates ?? [],
    risk: (Math.random() > 0.5 ? parentA.risk : parentB.risk) ?? [],
    exit: (Math.random() > 0.5 ? parentA.exit : parentB.exit) ?? [],
    sizing: (Math.random() > 0.5 ? parentA.sizing : parentB.sizing) ?? [],
  };
}

function countPrimitives(genome: any): number {
  let n = 0;
  for (const slot of Object.values(genome)) {
    if (Array.isArray(slot)) n += slot.length;
  }
  return n;
}

function hasRequiredSlots(genome: any): boolean {
  const hasGate = Array.isArray(genome.gates) && genome.gates.length >= 1;
  const hasRisk = Array.isArray(genome.risk) && genome.risk.length >= 1;
  const hasExit = Array.isArray(genome.exit) && genome.exit.length >= 1;
  return hasGate && hasRisk && (hasExit || genome.risk?.some((r: any) => r.key === "time_stop"));
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
      genome: r.strategy_blueprints.genome,
      reputation: r.reputation,
    }));

  if (parents.length < 2) {
    return new Response(JSON.stringify({ ok: true, created: 0, msg: "need at least 2 parents" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const children: any[] = [];

  // Mutations (top 4 parents)
  for (const p of parents.slice(0, 4)) {
    const mutated = mutateGenome(p.genome);
    if (countPrimitives(mutated) <= MAX_PRIMITIVES && hasRequiredSlots(mutated)) {
      children.push({
        name: `${p.name}_mut_${Date.now().toString(36).slice(-4)}`,
        genome: mutated,
        tags: ["evolved", "mutation"],
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
        name: `cross_${crossParents[i].name.slice(0, 8)}_${crossParents[i + 1].name.slice(0, 8)}_${Date.now().toString(36).slice(-4)}`,
        genome: child,
        tags: ["evolved", "crossover"],
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
