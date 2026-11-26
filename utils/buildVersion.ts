/**
 * Which build this tab is actually running.
 *
 * This exists because a correct fix, deployed and verified, still did nothing
 * for the user: an iOS home-screen app resumed from the app switcher does not
 * re-request anything, and neither does a laptop tab left open since before
 * the deploy. Both kept running the previous bundle, so a deletion recorded no
 * tombstone and the next sync "did nothing" — with no way for either of us to
 * tell from the outside.
 *
 * There is no service worker here (decision: parsing a meal needs the network
 * anyway), so nothing else was going to notice a new deployment.
 */

/** Injected at build time by vite.config.ts. */
declare const __BUILD_ID__: string;

export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** The hashed bundle this page loaded, e.g. "index-Bw2Ct1jg.js". */
const runningBundle = (): string | null => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  for (const el of scripts) {
    const src = (el as HTMLScriptElement).getAttribute('src') ?? '';
    const match = src.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    if (match) return match[1];
  }
  return null;
};

/**
 * Has a newer build been deployed since this tab loaded?
 *
 * Compares the bundle filename in the live index.html against the one this
 * page is running. Vite hashes that filename by content, so a difference means
 * a genuinely different build — not a cache quirk or a clock difference.
 *
 * Returns false on any failure: offline, blocked, or an unexpected document.
 * A false "update available" nag would be worse than missing one.
 */
export const isStale = async (): Promise<boolean> => {
  const current = runningBundle();
  if (!current) return false;
  try {
    const response = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return false;
    const html = await response.text();
    const match = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    return !!match && match[1] !== current;
  } catch {
    return false;
  }
};
