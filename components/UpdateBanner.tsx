import React, { useEffect, useState } from 'react';
import { isStale } from '../utils/buildVersion';
import { IconRefresh } from '@tabler/icons-react';

/**
 * Tells the user when their tab is running an old build.
 *
 * Without a service worker nothing else notices a deployment, and an installed
 * iOS app resumed from the app switcher can run week-old code indefinitely.
 * That is how a shipped, verified sync fix appeared to do nothing.
 *
 * Checks on mount and whenever the app is brought back to the foreground,
 * which is exactly the moment a phone resumes a stale page.
 */
export const UpdateBanner: React.FC = () => {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (await isStale()) !cancelled && setStale(true);
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!stale) return null;

  return (
    <div role="status" className="bg-nutri/10 border-b border-nutri/30 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <IconRefresh size={16} className="text-nutri shrink-0" />
        <p className="text-sm text-fg flex-1">
          <span className="font-bold">A newer version is available.</span>{' '}
          Reload to pick up the latest fixes.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-bold text-nutri hover:underline shrink-0
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri rounded-control px-2 py-1"
        >
          Reload
        </button>
      </div>
    </div>
  );
};
