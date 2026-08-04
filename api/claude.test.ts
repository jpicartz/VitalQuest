import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { messagesAreTextOnly, clientKey, originAllowed } from './claude';

// ── Test doubles ───────────────────────────────────────────────────────────

const res = () => {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { r.statusCode = code; return r; },
    json(payload: unknown) { r.body = payload; return r; },
  };
  return r as unknown as VercelResponse & { statusCode: number; body: any };
};

const req = (over: Partial<VercelRequest> = {}): VercelRequest => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: {
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: 'hello' }],
  },
  ...over,
} as VercelRequest);

/** Unique per test so the module-level rate-limit Map never bleeds across cases. */
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter % 250}-${ipCounter}`;
const withIp = (over: Partial<VercelRequest> = {}) =>
  req({ ...over, headers: { 'content-type': 'application/json', 'x-real-ip': freshIp(), ...(over.headers ?? {}) } });

const okUpstream = (payload: unknown = { content: [{ text: '{}' }] }) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  vi.stubGlobal('fetch', okUpstream());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Pure guard functions ───────────────────────────────────────────────────

describe('messagesAreTextOnly', () => {
  it('accepts plain string content', () => {
    expect(messagesAreTextOnly([{ role: 'user', content: 'hi' }])).toBe(true);
  });

  it('accepts an array of text blocks', () => {
    expect(messagesAreTextOnly([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])).toBe(true);
  });

  it('accepts an assistant turn', () => {
    expect(messagesAreTextOnly([{ role: 'assistant', content: 'sure' }])).toBe(true);
  });

  // The reason this function exists: an image block with a URL source would
  // make Anthropic fetch an arbitrary URL on the owner's key, billed at image
  // rates. This is the SSRF / cost-abuse defence.
  it('REJECTS an image block with a URL source', () => {
    expect(messagesAreTextOnly([{
      role: 'user',
      content: [{ type: 'image', source: { type: 'url', url: 'https://attacker.example/x.png' } }],
    }])).toBe(false);
  });

  it('REJECTS a base64 image block', () => {
    expect(messagesAreTextOnly([{
      role: 'user',
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }],
    }])).toBe(false);
  });

  it('rejects an image hidden among valid text blocks', () => {
    expect(messagesAreTextOnly([{
      role: 'user',
      content: [
        { type: 'text', text: 'innocent' },
        { type: 'image', source: { type: 'url', url: 'https://attacker.example/x.png' } },
      ],
    }])).toBe(false);
  });

  it('rejects a non-user/assistant role', () => {
    expect(messagesAreTextOnly([{ role: 'system', content: 'hi' }])).toBe(false);
  });

  it.each([null, 'a string', 42, undefined])('rejects %o as a message', (bad) => {
    expect(messagesAreTextOnly([bad])).toBe(false);
  });

  it('rejects a text block whose text is not a string', () => {
    expect(messagesAreTextOnly([{ role: 'user', content: [{ type: 'text', text: 123 }] }])).toBe(false);
  });

  it('rejects tool_use and document blocks', () => {
    expect(messagesAreTextOnly([{ role: 'user', content: [{ type: 'tool_use', name: 'x' }] }])).toBe(false);
    expect(messagesAreTextOnly([{ role: 'user', content: [{ type: 'document', source: {} }] }])).toBe(false);
  });
});

describe('clientKey', () => {
  it('prefers x-vercel-forwarded-for over a spoofable x-forwarded-for', () => {
    // The whole point: x-forwarded-for is caller-supplied, so a rotating value
    // would mint a fresh rate-limit bucket per request.
    const key = clientKey({ headers: {
      'x-forwarded-for': '1.2.3.4',
      'x-vercel-forwarded-for': '9.9.9.9',
      'x-real-ip': '5.5.5.5',
    } } as unknown as VercelRequest);
    expect(key).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip before x-forwarded-for', () => {
    const key = clientKey({ headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.5.5.5' } } as unknown as VercelRequest);
    expect(key).toBe('5.5.5.5');
  });

  it('uses x-forwarded-for only as a last resort', () => {
    expect(clientKey({ headers: { 'x-forwarded-for': '1.2.3.4' } } as unknown as VercelRequest)).toBe('1.2.3.4');
  });

  it('takes the first entry of a comma-separated chain and trims it', () => {
    expect(clientKey({ headers: { 'x-real-ip': ' 1.1.1.1 , 2.2.2.2 ' } } as unknown as VercelRequest)).toBe('1.1.1.1');
  });

  it('handles array-valued headers', () => {
    expect(clientKey({ headers: { 'x-real-ip': ['3.3.3.3', '4.4.4.4'] } } as unknown as VercelRequest)).toBe('3.3.3.3');
  });

  it('returns "unknown" when no address header is present', () => {
    expect(clientKey({ headers: {} } as unknown as VercelRequest)).toBe('unknown');
  });
});

describe('originAllowed', () => {
  it('accepts the production origin', () => {
    expect(originAllowed('https://vital-quest-rho.vercel.app')).toBe(true);
  });

  it('accepts Vercel preview subdomains', () => {
    expect(originAllowed('https://vital-quest-git-feature-abc.vercel.app')).toBe(true);
  });

  it('rejects http even on an allowed host', () => {
    expect(originAllowed('http://vital-quest-rho.vercel.app')).toBe(false);
  });

  it('rejects an unrelated origin', () => {
    expect(originAllowed('https://evil.example.com')).toBe(false);
  });

  it('is anchored to the hostname, not the URL string', () => {
    // A query string or path containing the allowed host must not pass.
    expect(originAllowed('https://evil.example.com/?x=vital-quest.vercel.app')).toBe(false);
    expect(originAllowed('https://vital-quest-rho.vercel.app.evil.com')).toBe(false);
  });

  it('rejects a prefixed lookalike host', () => {
    expect(originAllowed('https://notvital-quest.vercel.app')).toBe(false);
  });

  it('returns false for an unparseable origin rather than throwing', () => {
    expect(originAllowed('not a url')).toBe(false);
    expect(originAllowed('')).toBe(false);
  });
});

// ── Handler guards ─────────────────────────────────────────────────────────

describe('handler — request guards', () => {
  it('rejects non-POST with 405', async () => {
    const r = res();
    await handler(withIp({ method: 'GET' }), r);
    expect(r.statusCode).toBe(405);
  });

  it('rejects a non-JSON content type with 415', async () => {
    const r = res();
    await handler(withIp({ headers: { 'content-type': 'text/plain' } }), r);
    expect(r.statusCode).toBe(415);
  });

  it('rejects a disallowed origin with 403', async () => {
    const r = res();
    await handler(withIp({ headers: { origin: 'https://evil.example.com' } }), r);
    expect(r.statusCode).toBe(403);
  });

  it('allows a request with no Origin header (non-browser client)', async () => {
    const r = res();
    await handler(withIp(), r);
    expect(r.statusCode).toBe(200);
  });

  it('rejects an oversized content-length with 413', async () => {
    const r = res();
    await handler(withIp({ headers: { 'content-length': String(33 * 1024) } }), r);
    expect(r.statusCode).toBe(413);
  });

  it('returns 500 when the API key is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = res();
    await handler(withIp(), r);
    expect(r.statusCode).toBe(500);
  });
});

describe('handler — payload validation', () => {
  it.each([
    ['claude-opus-4-8', 'a more expensive model'],
    ['gpt-4', 'another vendor'],
    ['', 'an empty model'],
    [undefined, 'a missing model'],
  ])('rejects %s (%s) with 400', async (model) => {
    const r = res();
    await handler(withIp({ body: { model, messages: [{ role: 'user', content: 'hi' }] } }), r);
    expect(r.statusCode).toBe(400);
    expect(r.body).toEqual({ error: 'Model not allowed' });
  });

  it.each(['claude-sonnet-4-5', 'claude-haiku-4-5-20251001'])('accepts the allowlisted model %s', async (model) => {
    const r = res();
    await handler(withIp({ body: { model, messages: [{ role: 'user', content: 'hi' }] } }), r);
    expect(r.statusCode).toBe(200);
  });

  it('rejects missing or empty messages with 400', async () => {
    for (const messages of [undefined, [], 'not-an-array']) {
      const r = res();
      await handler(withIp({ body: { model: 'claude-sonnet-4-5', messages } }), r);
      expect(r.statusCode).toBe(400);
    }
  });

  it('rejects an image-URL message with 400', async () => {
    const r = res();
    await handler(withIp({ body: {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://attacker.example/x' } }] }],
    } }), r);
    expect(r.statusCode).toBe(400);
    expect(r.body).toEqual({ error: 'Only text messages are supported' });
  });

  it('rejects an oversized system prompt with 413', async () => {
    const r = res();
    await handler(withIp({ body: {
      model: 'claude-sonnet-4-5',
      system: 'A'.repeat(5000),
      messages: [{ role: 'user', content: 'hi' }],
    } }), r);
    expect(r.statusCode).toBe(413);
  });

  it('rejects oversized messages even without a content-length header', async () => {
    // Backstop for chunked transfer encoding, where content-length is absent.
    const r = res();
    await handler(withIp({ body: {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'A'.repeat(40 * 1024) }],
    } }), r);
    expect(r.statusCode).toBe(413);
  });
});

describe('handler — upstream payload sanitisation', () => {
  const upstreamBody = (spy: ReturnType<typeof vi.fn>) => JSON.parse(spy.mock.calls[0][1].body);

  it('drops non-whitelisted fields before forwarding', async () => {
    const spy = okUpstream();
    vi.stubGlobal('fetch', spy);
    await handler(withIp({ body: {
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      // None of these may reach Anthropic:
      tools: [{ name: 'exfiltrate' }],
      metadata: { user_id: 'someone-else' },
      stream: true,
      temperature: 2,
      top_k: 500,
    } }), res());

    const sent = upstreamBody(spy);
    expect(Object.keys(sent).sort()).toEqual(['max_tokens', 'messages', 'model']);
    for (const k of ['tools', 'metadata', 'stream', 'temperature', 'top_k']) {
      expect(sent).not.toHaveProperty(k);
    }
  });

  it('forwards a system prompt when it is a string', async () => {
    const spy = okUpstream();
    vi.stubGlobal('fetch', spy);
    await handler(withIp({ body: {
      model: 'claude-sonnet-4-5', system: 'be helpful',
      messages: [{ role: 'user', content: 'hi' }],
    } }), res());
    expect(upstreamBody(spy).system).toBe('be helpful');
  });

  it.each<[unknown, number, string]>([
    [50000, 4096, 'clamps above the ceiling'],
    [-5, 1024, 'replaces a negative value with the default'],
    [0, 1024, 'replaces zero with the default'],
    ['abc', 1024, 'replaces a non-numeric value with the default'],
    [undefined, 1024, 'defaults when absent'],
    [500.7, 500, 'floors a fractional value'],
    [2000, 2000, 'passes a valid value through'],
  ])('max_tokens %o becomes %i (%s)', async (input, expected) => {
    const spy = okUpstream();
    vi.stubGlobal('fetch', spy);
    await handler(withIp({ body: {
      model: 'claude-sonnet-4-5', max_tokens: input,
      messages: [{ role: 'user', content: 'hi' }],
    } }), res());
    expect(upstreamBody(spy).max_tokens).toBe(expected);
  });

  it('sends the key in the header and never in the body', async () => {
    const spy = okUpstream();
    vi.stubGlobal('fetch', spy);
    await handler(withIp(), res());
    const [, init] = spy.mock.calls[0];
    expect(init.headers['x-api-key']).toBe('sk-ant-test-key');
    expect(init.body).not.toContain('sk-ant-test-key');
  });
});

describe('handler — upstream error handling', () => {
  it('never echoes the upstream error body', async () => {
    // Anthropic's errors reveal key validity and credit exhaustion.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key sk-ant-REAL' } }),
    }));
    const r = res();
    await handler(withIp(), r);
    expect(r.statusCode).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('sk-ant-REAL');
    expect(JSON.stringify(r.body)).not.toContain('authentication_error');
  });

  it.each([429, 529])('maps upstream %i to a 503 "busy" response', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status, json: async () => ({ error: { message: 'rate limited' } }),
    }));
    const r = res();
    await handler(withIp(), r);
    expect(r.statusCode).toBe(503);
  });

  it('returns 502 when the upstream call throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = res();
    await handler(withIp(), r);
    expect(r.statusCode).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('ECONNREFUSED');
  });

  it('passes a successful response through', async () => {
    const payload = { content: [{ text: '{"ok":true}' }] };
    vi.stubGlobal('fetch', okUpstream(payload));
    const r = res();
    await handler(withIp(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual(payload);
  });
});

describe('handler — rate limiting', () => {
  it('allows 20 requests then blocks the 21st from the same address', async () => {
    const ip = `ratelimit-test-${Date.now()}`;
    const send = () => {
      const r = res();
      return handler(req({ headers: { 'content-type': 'application/json', 'x-real-ip': ip } }), r).then(() => r);
    };
    for (let i = 1; i <= 20; i++) {
      expect((await send()).statusCode, `request ${i} should be allowed`).toBe(200);
    }
    expect((await send()).statusCode).toBe(429);
  });

  it('tracks addresses independently', async () => {
    const a = `iso-a-${Date.now()}`;
    const b = `iso-b-${Date.now()}`;
    const send = (ip: string) => {
      const r = res();
      return handler(req({ headers: { 'content-type': 'application/json', 'x-real-ip': ip } }), r).then(() => r);
    };
    for (let i = 0; i < 20; i++) await send(a);
    expect((await send(a)).statusCode).toBe(429);
    expect((await send(b)).statusCode).toBe(200);
  });
});
