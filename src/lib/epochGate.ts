// src/lib/epochGate.ts
// UI-only: hide brain cohort rows before a "brain epoch start" timestamp.
// Default: no epoch set => show all brain rows.
// Unlock:  localStorage.setItem("atlas_brain_epoch_start_ts", new Date().toISOString()); location.reload();
// Clear:   localStorage.removeItem("atlas_brain_epoch_start_ts"); location.reload();

const LS_EPOCH_KEY = "atlas_brain_epoch_start_ts";

export function getBrainEpochStartTs(): string | null {
  try {
    return localStorage.getItem(LS_EPOCH_KEY);
  } catch {
    return null;
  }
}

export function setBrainEpochStartNow(): void {
  try {
    localStorage.setItem(LS_EPOCH_KEY, new Date().toISOString());
  } catch {}
}

export function clearBrainEpochStart(): void {
  try {
    localStorage.removeItem(LS_EPOCH_KEY);
  } catch {}
}

/** Returns true if rowTs is allowed under current epoch settings. */
export function passesBrainEpoch(rowTs: string | null | undefined): boolean {
  const epoch = getBrainEpochStartTs();
  if (!epoch) return true; // no epoch => allow all

  if (!rowTs) return false; // can't time-place it => hide
  const t = Date.parse(rowTs);
  const e = Date.parse(epoch);

  if (!Number.isFinite(t) || !Number.isFinite(e)) return true;
  return t >= e;
}
