import type { AttributionScenario } from "@/types/trade-vm";

export function buildAttributionPayload(input: any[]): AttributionScenario[] {
  return (input ?? [])
    .map((s) => ({
      scenario_key: String(s?.key ?? s?.scenario_key ?? ""),
      contributed_direction: (s?.direction ?? s?.contributed_direction ?? "NEUTRAL") as
        | "LONG"
        | "SHORT"
        | "NEUTRAL",
      contributed_confidence:
        typeof s?.confidence === "number"
          ? s.confidence
          : typeof s?.contributed_confidence === "number"
            ? s.contributed_confidence
            : null,
      timeframe: s?.timeframe ?? null,
      metadata: s?.metadata ?? {},
    }))
    .filter((s) => s.scenario_key.length > 0);
}
