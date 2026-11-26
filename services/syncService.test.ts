import { describe, it, expect, vi, afterEach } from 'vitest';
import { pull, push } from './syncService';
import { generateCode } from '../utils/syncCrypto';

const respond = (status: number, body: unknown, asText = false) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (asText) throw new SyntaxError('Unexpected token');
      return body;
    },
  }));
};

afterEach(() => vi.unstubAllGlobals());

describe('the sync client never leaks a parser error to the user', () => {
  it('explains a non-JSON 200 instead of throwing SyntaxError', async () => {
    // `vite dev` serves api/sync.ts as a JS module, and a Vercel timeout
    // returns HTML. Both used to surface as
    // `Unexpected token 'i', "import { o"... is not valid JSON`.
    respond(200, null, true);
    await expect(pull(generateCode())).rejects.toThrow(/sync/i);
    await expect(pull(generateCode())).rejects.not.toThrow(/Unexpected token/);
  });

  it('explains a non-JSON error page', async () => {
    respond(502, null, true);
    await expect(pull(generateCode())).rejects.toThrow(/unavailable|try again/i);
  });

  it('passes the server’s own message through when there is one', async () => {
    respond(503, { error: 'Sync is not configured on this deployment.' });
    await expect(pull(generateCode())).rejects.toThrow(/not configured/i);
  });

  it('treats a network failure as a connection problem, not a bug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(pull(generateCode())).rejects.toThrow(/connection/i);
  });

  it('returns null for a code that has never synced', async () => {
    respond(404, { error: 'No data for that code yet' });
    await expect(pull(generateCode())).resolves.toBeNull();
  });
});

describe('what actually goes over the wire', () => {
  it('sends ciphertext and an id, never the code or the data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const code = generateCode();
    await push(code, { profile: { name: 'Juan' }, foodLogs: [{ id: 'a', food: { name: 'Scrambled eggs' } }] } as never);

    const sent = String(fetchMock.mock.calls[0][1].body);
    expect(sent).not.toContain(code);
    expect(sent).not.toMatch(/Juan|Scrambled|eggs|profile|foodLogs/);
    const parsed = JSON.parse(sent);
    expect(parsed.id).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.ciphertext).toBeTruthy();
    expect(parsed.iv).toBeTruthy();
  });
});
