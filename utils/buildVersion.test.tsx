import { describe, it, expect, vi, afterEach } from 'vitest';
import { isStale } from './buildVersion';

const withPage = (runningSrc: string | null, servedHtml: string | null, ok = true) => {
  document.head.innerHTML = runningSrc ? `<script src="${runningSrc}"></script>` : '';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    text: async () => servedHtml ?? '',
  }));
};

afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; });

describe('detecting a tab running an old build', () => {
  it('spots a newer bundle on the server', async () => {
    // The real failure this prevents: a deployed fix that the device never
    // loaded, so a sync "did nothing" with no way to tell why.
    withPage('/assets/index-OLD123.js', '<script src="/assets/index-NEW456.js"></script>');
    expect(await isStale()).toBe(true);
  });

  it('is quiet when the build matches', async () => {
    withPage('/assets/index-SAME99.js', '<script src="/assets/index-SAME99.js"></script>');
    expect(await isStale()).toBe(false);
  });

  it('asks the network not to serve it a cached copy', async () => {
    withPage('/assets/index-A.js', '<script src="/assets/index-A.js"></script>');
    await isStale();
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // Checking for a new build via a cached response would be circular.
    expect(init.cache).toBe('no-store');
  });

  it('stays quiet when offline rather than nagging', async () => {
    document.head.innerHTML = '<script src="/assets/index-A.js"></script>';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await isStale()).toBe(false);
  });

  it('stays quiet on an error response or an unexpected document', async () => {
    withPage('/assets/index-A.js', '<html>nope</html>');
    expect(await isStale()).toBe(false);
    withPage('/assets/index-A.js', '<script src="/assets/index-B.js"></script>', false);
    expect(await isStale()).toBe(false);
  });

  it('stays quiet when it cannot tell what it is running', async () => {
    withPage(null, '<script src="/assets/index-B.js"></script>');
    expect(await isStale()).toBe(false);
  });
});
