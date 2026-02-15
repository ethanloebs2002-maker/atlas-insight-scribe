/**
 * Canonical probability scalar for ATLAS.
 * Must always be in the range [0, 1].
 */
export type Probability = number & { __brand: "Probability" };

export function asProbability(value: number, source = "unknown"): Probability {
  if (!Number.isFinite(value)) {
    throw new Error(`[Probability] Non-finite value from ${source}: ${value}`);
  }

  // Auto-normalize legacy percent values ONCE
  if (value > 1 && value <= 100) {
    console.warn(
      `[Probability] Auto-normalizing ${value} from ${source} (assumed %)`
    );
    value = value / 100;
  }

  if (value < 0 || value > 1) {
    throw new Error(
      `[Probability] Out of range from ${source}: ${value}`
    );
  }

  return value as Probability;
}
