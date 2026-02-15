/**
 * Normalize raw scenario scores into integer percentages that sum to exactly 100.
 * Uses largest-remainder method for rounding.
 */
export function normalizeScenarioPercents(scores: {
  bull: number;
  bear: number;
  neutral: number;
}): { bull: number; bear: number; neutral: number } {
  const { bull, bear, neutral } = scores;
  const total = bull + bear + neutral;

  if (!Number.isFinite(total) || total <= 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeScenarioPercents] Invalid total, falling back to equal thirds', scores);
    }
    return { bull: 34, bear: 33, neutral: 33 };
  }

  const raw = [
    { key: 'bull' as const, value: (bull / total) * 100 },
    { key: 'bear' as const, value: (bear / total) * 100 },
    { key: 'neutral' as const, value: (neutral / total) * 100 },
  ];

  // Floor each and compute remainder
  const floored = raw.map(r => ({ ...r, floor: Math.floor(r.value), remainder: r.value - Math.floor(r.value) }));
  const floorSum = floored.reduce((s, r) => s + r.floor, 0);
  let leftover = 100 - floorSum;

  // Sort by largest remainder descending, distribute leftover
  const sorted = [...floored].sort((a, b) => b.remainder - a.remainder);
  for (const item of sorted) {
    if (leftover <= 0) break;
    item.floor += 1;
    leftover -= 1;
  }

  const result = { bull: 0, bear: 0, neutral: 0 };
  for (const item of floored) {
    result[item.key] = Math.max(0, Math.min(100, item.floor));
  }

  if (process.env.NODE_ENV === 'development') {
    const sum = result.bull + result.bear + result.neutral;
    if (sum !== 100) console.warn('[normalizeScenarioPercents] Sum != 100:', result);
  }

  return result;
}
