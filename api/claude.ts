import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Hardened Claude proxy ──────────────────────────────────────────────────
// The browser bundle never carries the API key; it POSTs here and this
// function forwards a *sanitised* request to Anthropic using a server-side key.
// Defences: model allowlist, max_tokens clamp, field whitelist, body-size cap,
// soft origin check, and a best-effort per-IP rate limit.

// Only the two models the app actually uses. Anything else (e.g. an attacker
// asking for expensive Opus) is rejected outright.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001',
]);

// Ceiling on output tokens. Large enough for the app's biggest legitimate
// response (meal suggestions / multi-item food parse enumerate 28 micronutrient
// keys → ~1700-2500 tokens) while still bounding abuse cost (a 4096-token Haiku
// reply is ~$0.02).
const MAX_OUTPUT_TOKENS = 4096;
const MAX_BODY_BYTES = 32 * 1024; // 32 KB request-body cap
// The app's own system prompts are a few hundred chars; anything far larger is
// abuse. Input tokens are cheap per-token but unbounded input is not, and the
// max_tokens clamp only bounds *output*.
const MAX_SYSTEM_CHARS = 4000;

// Origins allowed to use the proxy from a browser. Non-browser clients (curl)
// send no Origin header — those are caught by the rate limit + allowlist.
const ALLOWED_ORIGINS = new Set([
  'https://vital-quest-rho.vercel.app',
]);

// Vercel branch/preview deployments get generated subdomains, which would
// otherwise 403 on every AI call and make the preview look broken.
export function originAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:') return false;
    return /^vital-quest[a-z0-9-]*\.vercel\.app$/.test(hostname);
  } catch {
    return false;
  }
}

// ── Best-effort in-memory rate limit ───────────────────────────────────────
// Module-level state persists only within a warm serverless instance, so this
// is a speed bump per instance, not a hard global cap. The Anthropic spend
// limit is the real backstop; swap in Upstash Redis if real traffic appears.
const RATE_LIMIT = 20;             // requests
const RATE_WINDOW_MS = 60 * 1000;  // per 60s per IP
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(ip: string): boolean {
  const now = Date.now();

  // Drop expired buckets so a flood of distinct keys can't grow the Map without
  // bound for the lifetime of a warm instance.
  if (hits.size > 5000) {
    for (const [key, rec] of hits) {
      if (now > rec.resetAt) hits.delete(key);
    }
  }

  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

// `x-forwarded-for` is caller-supplied and can be spoofed to mint a fresh
// rate-limit bucket per request. Vercel's own headers are set at the edge and
// cannot be overridden by the client, so prefer them and treat XFF as a
// last resort.
export function clientKey(req: VercelRequest): string {
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const pick = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v || '').split(',')[0].trim();
  return (
    pick(vercelIp) ||
    pick(realIp) ||
    pick(req.headers['x-forwarded-for']) ||
    'unknown'
  );
}

// The top-level field whitelist doesn't reach inside messages. Anthropic accepts
// image blocks with a URL source, which would let a caller make Anthropic fetch
// arbitrary URLs on this key (and bill at image rates), so restrict content to
// plain text.
export function messagesAreTextOnly(messages: unknown[]): boolean {
  return messages.every((m) => {
    if (typeof m !== 'object' || m === null) return false;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return false;
    if (typeof content === 'string') return true;
    if (!Array.isArray(content)) return false;
    return content.every(
      (block) =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
    );
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Reject non-JSON payloads early
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  // Soft same-origin check: block browser cross-site abuse. A missing Origin
  // (server-to-server) is allowed here and handled by the rate limit below.
  const origin = req.headers.origin;
  if (origin && !originAllowed(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  // Body-size guard
  const rawLen = Number(req.headers['content-length'] || 0);
  if (rawLen > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request too large' });
  }

  // Per-IP rate limit
  if (rateLimited(clientKey(req))) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // ── Validate + sanitise the body; never forward it verbatim ──────────────
  const body = (req.body ?? {}) as Record<string, unknown>;

  const model = String(body.model || '');
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ error: 'Model not allowed' });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }
  if (!messagesAreTextOnly(body.messages)) {
    return res.status(400).json({ error: 'Only text messages are supported' });
  }
  // Extra guard on serialised message size (content-length may be absent under
  // chunked transfer encoding, so the header check above can be bypassed).
  if (JSON.stringify(body.messages).length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request too large' });
  }
  if (typeof body.system === 'string' && body.system.length > MAX_SYSTEM_CHARS) {
    return res.status(413).json({ error: 'Request too large' });
  }

  // Clamp on both ends: Math.min alone lets a negative value through.
  const requested = Number(body.max_tokens);
  const maxTokens = Math.min(
    Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1024,
    MAX_OUTPUT_TOKENS
  );

  // Whitelist only the fields we send upstream — drop tools/metadata/etc.
  const upstreamBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: body.messages,
  };
  if (typeof body.system === 'string') {
    upstreamBody.system = body.system;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await response.json();

    if (!response.ok) {
      // Never echo Anthropic's error body: it reveals whether the key is valid,
      // whether the account is out of credit, and internal request IDs. Log the
      // detail server-side and return something generic and actionable.
      console.error('Claude upstream error:', response.status, JSON.stringify(data).slice(0, 500));
      const status = response.status === 429 || response.status === 529 ? 503 : 502;
      return res.status(status).json({
        error:
          status === 503
            ? 'The AI service is busy right now. Please try again in a moment.'
            : 'The AI service could not complete that request. Please try again.',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Claude proxy upstream error:', err);
    return res.status(502).json({ error: 'The AI service is unreachable. Please try again.' });
  }
}
