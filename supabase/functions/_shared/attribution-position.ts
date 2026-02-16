import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AttributionScenario = {
  scenario_key: string;
  contributed_direction?: "LONG" | "SHORT" | "NEUTRAL";
  contributed_confidence?: number | null;
  timeframe?: string | null;
  metadata?: Record<string, any>;
};

function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export async function insertAttributionForPosition(args: {
  position_id: string;
  decision_id: string | null;
}) {
  const sb = sbAdmin();

  if (!args.decision_id) {
    return { inserted: 0, reason: "no decision_id on position" };
  }

  const dec = await sb
    .from("paper_decisions")
    .select("id,asset_id,timeframe,probability_components")
    .eq("id", args.decision_id)
    .maybeSingle();

  if (dec.error || !dec.data) {
    return { inserted: 0, reason: "decision not found" };
  }

  const symbol = dec.data.asset_id;
  const decisionTimeframe = dec.data.timeframe ?? null;
  const components = dec.data.probability_components as any;
  const scenarios: AttributionScenario[] = components?.attribution_scenarios ?? [];

  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return { inserted: 0, reason: "no attribution_scenarios stored on decision" };
  }

  const rows = scenarios.map((s) => ({
    position_id: args.position_id,
    decision_id: args.decision_id,
    symbol,
    timeframe: s.timeframe ?? decisionTimeframe,
    scenario_key: s.scenario_key,
    contributed_direction: s.contributed_direction ?? "NEUTRAL",
    contributed_confidence: typeof s.contributed_confidence === "number" ? s.contributed_confidence : null,
    metadata: s.metadata ?? {},
  }));

  const ins = await sb
    .from("trade_scenario_attribution")
    .upsert(rows, { onConflict: "position_id,scenario_key" });

  if (ins.error) throw new Error(`trade_scenario_attribution upsert failed: ${ins.error.message}`);

  return { inserted: rows.length };
}
