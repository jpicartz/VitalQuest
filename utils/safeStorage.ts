/**
 * localStorage that cannot crash the app.
 *
 * Reads were already guarded; writes were not. `setItem` throws in two real
 * situations:
 *
 *   - Safari private browsing (and some blocked-storage settings) throw
 *     immediately on any write, so the app crashed on first render for anyone
 *     in a private window.
 *   - QuotaExceededError once the store is full. At ~1.9 KB per logged day that
 *     takes years, but it is not impossible and it fails at the worst moment.
 *
 * Writes are the whole persistence story for this app, so a failed write means
 * the user's data is not being saved. That must be surfaced, never swallowed —
 * the same reasoning as the medications field: do not let the product imply a
 * promise the code is not keeping.
 */

export type StorageFailure = 'quota' | 'unavailable';

export const readItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Returns null on success, or why the write failed. */
export const writeItem = (key: string, value: string): StorageFailure | null => {
  try {
    localStorage.setItem(key, value);
    return null;
  } catch (err) {
    // Browsers disagree on the name and code, so check several signals.
    const e = err as { name?: string; code?: number };
    const isQuota =
      e?.name === 'QuotaExceededError' ||
      e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e?.code === 22 ||
      e?.code === 1014;
    return isQuota ? 'quota' : 'unavailable';
  }
};

export const removeItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Nothing useful to do — the caller is clearing state that may not exist. */
  }
};
