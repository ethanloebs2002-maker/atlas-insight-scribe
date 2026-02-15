export type RunMode = "DEMO" | "PAPER" | "EVALUATION" | "LIVE";

export function getRunMode(): RunMode {
  const fromWindow =
    typeof window !== "undefined" && (window as any).__ATLAS_MODE
      ? String((window as any).__ATLAS_MODE)
      : null;

  const fromEnv =
    typeof import.meta !== "undefined" && (import.meta as any).env
      ? String(((import.meta as any).env.VITE_ATLAS_MODE ?? "")).trim()
      : "";

  const raw = (fromWindow || fromEnv || "PAPER").toUpperCase();

  if (raw === "DEMO" || raw === "PAPER" || raw === "EVALUATION" || raw === "LIVE")
    return raw as RunMode;

  return "PAPER";
}

export function assertDemoOnly(feature: string): void {
  const mode = getRunMode();
  if (mode !== "DEMO") {
    throw new Error(
      `[ATLAS] ${feature} is DEMO-only but was accessed in mode=${mode}.`
    );
  }
}
