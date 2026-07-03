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

// Origins allowed to use the proxy from a browser. Non-browser clients (curl)
// send no Origin header — those are caught by the rate limit + allowlist.
const ALLOWED_ORIGINS = new Set([
  'https://vital-quest-rho.vercel.app',
]);

// ── Best-effort in-memory rate limit ───────────────────────────────────────
// Module-level state persists only within a warm serverless instance, so this
// is a speed bump per instance, not a hard global cap. The Anthropic spend
// limit is the real backstop; swap in Upstash Redis if real traffic appears.
const RATE_LIMIT = 20;             // requests
const RATE_WINDOW_MS = 60 * 1000;  // per 60s per IP
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
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
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  // Body-size guard
  const rawLen = Number(req.headers['content-length'] || 0);
  if (rawLen > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request too large' });
  }

  // Per-IP rate limit
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
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
  // Extra guard on serialised message size (content-length may be absent)
  if (JSON.stringify(body.messages).length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request too large' });
  }

  const maxTokens = Math.min(Number(body.max_tokens) || 1024, MAX_OUTPUT_TOKENS);

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
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Claude proxy upstream error:', err);
    return res.status(502).json({ error: 'Upstream error' });
  }
}
