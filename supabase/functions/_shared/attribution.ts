export type AttributionScenario = {
  scenario_key: string;
  contributed_direction?: "LONG" | "SHORT" | "NEUTRAL";
  contributed_confidence?: number | null;
  timeframe?: string | null;
  metadata?: Record<string, any>;
};

export function buildAttributionPayload(input: any[]): AttributionScenario[] {
  return (input ?? [])
    .map((s) => ({
      scenario_key: String(s?.key ?? s?.scenario_key ?? s?.type ?? ""),
      contributed_direction: (s?.direction ?? s?.contributed_direction ?? (s?.type === "bullish" ? "LONG" : s?.type === "bearish" ? "SHORT" : "NEUTRAL")) as
        | "LONG"
        | "SHORT"
        | "NEUTRAL",
      contributed_confidence:
        typeof s?.confidence === "number"
          ? s.confidence
          : typeof s?.contributed_confidence === "number"
            ? s.contributed_confidence
            : typeof s?.probability === "number"
              ? s.probability
              : null,
      timeframe: s?.timeframe ?? null,
      metadata: s?.metadata ?? {},
    }))
    .filter((s) => s.scenario_key.length > 0);
}
