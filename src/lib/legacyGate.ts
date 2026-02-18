// src/lib/legacyGate.ts
// Legacy data is invisible in the UI unless explicitly unlocked via console command.
// Unlock:  localStorage.setItem("atlas_legacy_unlock", "ATLAS:UNLOCK_LEGACY:2026_02_17"); location.reload();
// Lock:    localStorage.removeItem("atlas_legacy_unlock"); location.reload();

export const LEGACY_UNLOCK_KEY = "atlas_legacy_unlock";
export const LEGACY_UNLOCK_CODE = "ATLAS:UNLOCK_LEGACY:2026_02_17";

export function isLegacyUnlocked(): boolean {
  try {
    return localStorage.getItem(LEGACY_UNLOCK_KEY) === LEGACY_UNLOCK_CODE;
  } catch {
    return false;
  }
}

export function unlockLegacy(code: string): boolean {
  if (code !== LEGACY_UNLOCK_CODE) return false;
  try {
    localStorage.setItem(LEGACY_UNLOCK_KEY, code);
    return true;
  } catch {
    return false;
  }
}

export function lockLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_UNLOCK_KEY);
  } catch {}
}
