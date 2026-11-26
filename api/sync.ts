import type { VercelRequest, VercelResponse } from '@vercel/node';
import { originAllowed, clientKey, rateLimited } from './claude';

/**
 * Encrypted snapshot store.
 *
 * This endpoint holds ciphertext for a key it cannot derive. It never sees a
 * sync code, a decryption key, or anything about what the user ate — the client
 * derives `syncId` and the AES key from the same code with domain-separated
 * HKDF labels, and only the id is ever sent (see utils/syncCrypto.ts).
 *
 * So the honest description of this store is: a row of opaque bytes under a
 * random 256-bit name. That is what lets decision §7 be amended without giving
 * up anything it actually promised.
 *
 * It reuses the proxy's guards rather than reimplementing them, because those
 * were hardened against real attacks (see docs/decisions.md §8) and a second
 * copy would drift from the first.
 */

/** 1 MB. A year of logs is well under this; it stops the store being free hosting. */
const MAX_BLOB_BYTES = 1024 * 1024;

/** Rows expire 90 days after the last write, so abandoned syncs clean themselves up. */
const TTL_SECONDS = 90 * 24 * 60 * 60;

/** A syncId is a SHA-256 digest in hex, and nothing else is accepted as one. */
const SYNC_ID = /^[0-9a-f]{64}$/;

const store = () => {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
};

/**
 * Upstash over its REST API, via plain fetch.
 *
 * Deliberately no client library: this app has seven runtime dependencies and
 * two HTTP calls do not justify an eighth.
 */
const kv = async (kvStore: { url: string; token: string }, command: unknown[]) => {
  const response = await fetch(kvStore.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvStore.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`store ${response.status}`);
  return (await response.json()) as { result: unknown };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || '');
  if (origin && !originAllowed(origin, req.headers.host)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  if (rateLimited(clientKey(req))) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const kvStore = store();
  if (!kvStore) {
    return res.status(503).json({ error: 'Sync is not configured on this deployment.' });
  }

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      // A malformed id is rejected rather than queried. The pattern is also
      // what stops an id being used to probe other keys in the store.
      if (!SYNC_ID.test(id)) return res.status(400).json({ error: 'Invalid sync id' });

      const { result } = await kv(kvStore, ['GET', `sync:${id}`]);
      if (!result) return res.status(404).json({ error: 'No data for that code yet' });
      return res.status(200).json(JSON.parse(String(result)));
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = String(body.id || '');
      if (!SYNC_ID.test(id)) return res.status(400).json({ error: 'Invalid sync id' });

      const ciphertext = String(body.ciphertext || '');
      const iv = String(body.iv || '');
      if (!ciphertext || !iv) return res.status(400).json({ error: 'Missing payload' });

      // Base64 only. The server cannot read the contents, but it can refuse to
      // store anything that is not shaped like the ciphertext it expects.
      if (!/^[A-Za-z0-9+/=]+$/.test(ciphertext) || !/^[A-Za-z0-9+/=]+$/.test(iv)) {
        return res.status(400).json({ error: 'Malformed payload' });
      }

      // Checked on the decoded length, not the header: content-length is absent
      // under chunked transfer encoding, the same hole that was closed in the
      // Claude proxy.
      if (ciphertext.length > MAX_BLOB_BYTES) {
        return res.status(413).json({ error: 'Too much data to sync' });
      }

      const syncedAt = Number(body.syncedAt) || Date.now();
      const payload = JSON.stringify({ ciphertext, iv, syncedAt, v: 1 });

      await kv(kvStore, ['SET', `sync:${id}`, payload, 'EX', String(TTL_SECONDS)]);
      return res.status(200).json({ ok: true, syncedAt });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      if (!SYNC_ID.test(id)) return res.status(400).json({ error: 'Invalid sync id' });
      await kv(kvStore, ['DEL', `sync:${id}`]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    // Same policy as the Claude proxy: log server-side, say nothing useful to a
    // caller probing for the store's shape.
    console.error('sync error:', error);
    return res.status(502).json({ error: 'Sync is unavailable right now. Please try again.' });
  }
}
