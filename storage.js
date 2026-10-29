import { validSave } from "./engine.js";
// Keep the original key so renames and updates preserve existing games.
export const SAVE_KEY = "little-breaks-save-v1";
export const BACKUP_KEY = `${SAVE_KEY}-backup`;
export const SETTINGS_KEY = "little-breaks-settings-v1";
export function readProgress(storage) {
  let available = true;
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      available = false;
      continue;
    }
    try {
      const value = JSON.parse(raw);
      if (validSave(value)) return { saved: value, available };
    } catch {
      /* Try the second copy. */
    }
  }
  return { saved: null, available };
}
export function writeProgress(storage, state) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    return false;
  }
  try {
    storage.setItem(BACKUP_KEY, JSON.stringify(state));
  } catch {
    /* The main copy still succeeded. */
  }
  return true;
}
