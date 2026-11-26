import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './sync';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** An in-memory stand-in for the Upstash REST API. */
const makeStore = () => {
  const rows = new Map<string, string>();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const [command, key, value] = JSON.parse(String(init.body)) as string[];
    if (command === 'GET') return json({ result: rows.get(key) ?? null });
    if (command === 'SET') { rows.set(key, value); return json({ result: 'OK' }); }
    if (command === 'DEL') { rows.delete(key); return json({ result: 1 }); }
    return json({ result: null });
  });
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
  return { rows, fetchMock };
};

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);

// Every call comes from its own IP. The rate limiter lives in module state in
// api/claude.ts and is shared across this whole file, so without this the 21st
// assertion in the suite gets a 429 instead of whatever it was testing.
let caller = 0;

const call = async (req: Partial<VercelRequest>) => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse;
  const headers = { 'x-vercel-forwarded-for': `10.0.0.${++caller}`, ...(req.headers ?? {}) };
  await handler({ query: {}, ...req, headers } as VercelRequest, res);
  return {
    status: (res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    body: (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
  };
};

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  process.env.KV_REST_API_URL = 'https://store.test';
  process.env.KV_REST_API_TOKEN = 'test-token';
  store = makeStore();
  vi.stubGlobal('fetch', store.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('a blob belongs to exactly one sync id', () => {
  it('never returns one code’s data to another', async () => {
    // The single most important property of this endpoint. If this ever fails,
    // one user's encrypted health data is being handed to a different code.
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==' } });

    const mine = await call({ method: 'GET', query: { id: ID_A } });
    expect(mine.status).toBe(200);
    expect(mine.body.ciphertext).toBe('QUFB');

    const theirs = await call({ method: 'GET', query: { id: ID_B } });
    expect(theirs.status).toBe(404);
    expect(theirs.body.ciphertext).toBeUndefined();
  });

  it('stores under a namespaced key, not the bare id', async () => {
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==' } });
    expect([...store.rows.keys()]).toEqual([`sync:${ID_A}`]);
  });

  it('stores only the ciphertext it was given', async () => {
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==', secret: 'leak me' } });
    const stored = store.rows.get(`sync:${ID_A}`)!;
    expect(stored).not.toContain('leak me');
  });
});

describe('sync id validation', () => {
  it.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['not hex', 'z'.repeat(64)],
    ['uppercase', 'A'.repeat(64)],
    ['a redis glob', '*'.repeat(64)],
    ['a key traversal attempt', `${'a'.repeat(58)}\nKEYS *`],
  ])('rejects %s', async (_label, id) => {
    const get = await call({ method: 'GET', query: { id } });
    expect(get.status).toBe(400);
    const put = await call({ method: 'PUT', body: { id, ciphertext: 'QUFB', iv: 'SVZJVg==' } });
    expect(put.status).toBe(400);
  });
});

describe('payload guards', () => {
  it('rejects a blob over the size cap', async () => {
    const huge = 'A'.repeat(1024 * 1024 + 1);
    const { status } = await call({ method: 'PUT', body: { id: ID_A, ciphertext: huge, iv: 'SVZJVg==' } });
    expect(status).toBe(413);
  });

  it('rejects anything that is not base64', async () => {
    const { status } = await call({
      method: 'PUT', body: { id: ID_A, ciphertext: '<script>alert(1)</script>', iv: 'SVZJVg==' },
    });
    expect(status).toBe(400);
  });

  it('rejects a missing payload', async () => {
    expect((await call({ method: 'PUT', body: { id: ID_A, iv: 'SVZJVg==' } })).status).toBe(400);
    expect((await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB' } })).status).toBe(400);
  });
});

describe('origin and method', () => {
  it('rejects a foreign origin', async () => {
    const { status } = await call({
      method: 'GET', query: { id: ID_A }, headers: { origin: 'https://evil.example.com' },
    });
    expect(status).toBe(403);
  });

  it('rejects an unsupported method', async () => {
    expect((await call({ method: 'PATCH' })).status).toBe(405);
  });
});

describe('failure modes are honest', () => {
  it('accepts the Upstash variable names too', async () => {
    // The integration sets one pair or the other depending on how the store
    // was connected. Reading only KV_* meant a working database still 503'd.
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = 'https://store.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    const { status } = await call({ method: 'GET', query: { id: ID_B } });
    expect(status).toBe(404);   // reached the store and found nothing, not 503
  });

  it('says so plainly when the store is not configured', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const { status, body } = await call({ method: 'GET', query: { id: ID_A } });
    expect(status).toBe(503);
    expect(body.error).toMatch(/not configured/i);
  });

  it('does not leak the store’s error to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 }) as Response));
    const { status, body } = await call({ method: 'GET', query: { id: ID_A } });
    expect(status).toBe(502);
    // Same policy as the Claude proxy: an attacker learns nothing about the
    // store's shape or whether the token is valid.
    expect(JSON.stringify(body)).not.toMatch(/401|token|upstash|redis/i);
  });

  it('404s for a code that has never synced', async () => {
    const { status } = await call({ method: 'GET', query: { id: ID_B } });
    expect(status).toBe(404);
  });
});

describe('round trip', () => {
  it('returns what was stored, with its timestamp', async () => {
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==', syncedAt: 1700000000000 } });
    const { body } = await call({ method: 'GET', query: { id: ID_A } });
    expect(body).toMatchObject({ ciphertext: 'QUFB', iv: 'SVZJVg==', syncedAt: 1700000000000 });
  });

  it('overwrites on a later write', async () => {
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==' } });
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QkJC', iv: 'SVZJVg==' } });
    const { body } = await call({ method: 'GET', query: { id: ID_A } });
    expect(body.ciphertext).toBe('QkJC');
  });

  it('sets an expiry so abandoned rows clean themselves up', async () => {
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==' } });
    const command = JSON.parse(String(store.fetchMock.mock.calls[0][1].body));
    expect(command).toContain('EX');
    expect(Number(command[command.length - 1])).toBe(90 * 24 * 60 * 60);
  });

  it('deletes on request', async () => {
    await call({ method: 'PUT', body: { id: ID_A, ciphertext: 'QUFB', iv: 'SVZJVg==' } });
    await call({ method: 'DELETE', query: { id: ID_A } });
    expect((await call({ method: 'GET', query: { id: ID_A } })).status).toBe(404);
  });
});
