import {
  deriveKeys, encryptJson, decryptJson, generateCode, normaliseCode, isValidCode,
  type Encrypted,
} from '../utils/syncCrypto';
import {
  mergeSyncData, SYNC_ENVELOPE_VERSION,
  type SyncData, type SyncEnvelope, type MergeResult,
} from '../utils/syncMerge';
import { readItem, writeItem, removeItem } from '../utils/safeStorage';

/**
 * Device sync, client side.
 *
 * Holds no state of its own beyond the saved code: everything else is derived
 * on each call, so there is no cached key to go stale or leak into a snapshot.
 *
 * The code is stored in localStorage like everything else in this app. That is
 * a real and stated limitation — anyone with the unlocked device can read it,
 * exactly as they could already read the food logs themselves. It is not stored
 * anywhere else, and nothing ever sends it.
 */

const CODE_KEY = 'vitalQuestSyncCode';
const LAST_SYNC_KEY = 'vitalQuestSyncedAt';
const ENDPOINT = '/api/sync';

export { generateCode, isValidCode, normaliseCode };

export const savedCode = (): string | null => {
  const stored = readItem(CODE_KEY);
  return stored && isValidCode(stored) ? normaliseCode(stored) : null;
};

export const saveCode = (code: string): void => { writeItem(CODE_KEY, normaliseCode(code)); };

/** Forget the code on this device only. The remote row is untouched. */
export const forgetCode = (): void => {
  removeItem(CODE_KEY);
  removeItem(LAST_SYNC_KEY);
};

export const lastSyncedAt = (): number => Number(readItem(LAST_SYNC_KEY)) || 0;
const rememberSyncedAt = (at: number): void => { writeItem(LAST_SYNC_KEY, String(at)); };

/** The link a phone opens. The code sits in the FRAGMENT, which browsers never send. */
export const pairingUrl = (code: string): string =>
  `${globalThis.location?.origin ?? ''}/#sync=${normaliseCode(code)}`;

/**
 * A code handed over in the URL fragment, if there is one.
 *
 * Reads and then CLEARS it, so the code does not sit in the address bar, in
 * history, or in whatever the user pastes next.
 */
export const takeCodeFromUrl = (): string | null => {
  const hash = globalThis.location?.hash ?? '';
  const match = hash.match(/sync=([0-9A-Za-z-]+)/);
  if (!match) return null;
  const code = normaliseCode(match[1]);
  try {
    globalThis.history?.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
  } catch { /* history is unavailable in some embedded contexts; not fatal */ }
  return isValidCode(code) ? code : null;
};

/**
 * One request to the sync endpoint, with every non-JSON outcome handled.
 *
 * `response.json()` throws on anything that is not JSON, and there are three
 * ways that happens here: a Vercel function timeout returns an HTML page, a
 * misrouted path returns the SPA shell, and `vite dev` serves api/sync.ts as a
 * JavaScript MODULE — which surfaced to the user as
 * `Unexpected token 'i', "import { o"... is not valid JSON`.
 *
 * claudeService already learned this lesson; this is the same guard.
 */
const request = async (path: string, init?: RequestInit) => {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error('Could not reach the sync service. Check your connection.');
  }

  if (response.status === 404) return null;

  let body: Record<string, unknown> | null = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) {
      throw new Error(
        import.meta.env.DEV
          // Vite does not run the serverless functions, so this is expected.
          ? 'Sync needs the deployed app — `vite dev` does not run /api routes.'
          : 'The sync service returned something unreadable. Please try again.',
      );
    }
  }

  if (!response.ok) {
    throw new Error(String(body?.error || 'Sync is unavailable right now. Please try again.'));
  }
  return body;
};

/** Fetch and decrypt the remote snapshot, or null if this code has never synced. */
export const pull = async (code: string): Promise<SyncEnvelope | null> => {
  const { syncId, encryptionKey } = await deriveKeys(code);
  const stored = await request(`${ENDPOINT}?id=${syncId}`);
  if (!stored) return null;
  const envelope = await decryptJson<SyncEnvelope>(stored as unknown as Encrypted, encryptionKey);
  if (envelope?.v !== SYNC_ENVELOPE_VERSION) {
    throw new Error('That data was saved by a different version of the app.');
  }
  return envelope;
};

/** Encrypt and upload. Returns the timestamp the snapshot was stamped with. */
export const push = async (code: string, data: SyncData): Promise<number> => {
  const { syncId, encryptionKey } = await deriveKeys(code);
  const syncedAt = Date.now();
  const envelope: SyncEnvelope = { v: SYNC_ENVELOPE_VERSION, syncedAt, data };
  const payload = await encryptJson(envelope, encryptionKey);

  await request(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: syncId, ...payload, syncedAt }),
  });
  rememberSyncedAt(syncedAt);
  return syncedAt;
};

export interface SyncOutcome extends MergeResult {
  syncedAt: number;
}

/**
 * One full cycle: pull, merge, push the result back.
 *
 * Pushing the MERGED data rather than the local data is what makes this
 * converge — otherwise each device would keep overwriting the other's entries
 * with a snapshot that never contained them.
 */
export const syncNow = async (code: string, local: SyncData): Promise<SyncOutcome> => {
  const remote = await pull(code);
  const merged = mergeSyncData(local, remote, lastSyncedAt());
  const syncedAt = await push(code, merged.data);
  return { ...merged, syncedAt };
};
