import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { isValidCode, normaliseCode, saveCode } from '../services/syncService';
import { IconDeviceMobile, IconAlertTriangle } from '@tabler/icons-react';

interface RestoreFromSyncProps {
  /** Pulls, merges and applies. Resolves once the device holds the data. */
  onRestore: (code: string) => Promise<{ added: number }>;
}

/**
 * The way back in on a device that has no data yet.
 *
 * This sits on the ONBOARDING screen, which is the only place it is any use.
 * The sync panel proper lives in the profile sheet, reachable only from the
 * dashboard — so a device with nothing stored could receive a code and have
 * nowhere to type it.
 *
 * That is not a rare path. iOS gives a home-screen web app its own storage
 * container, separate from Safari's, so installing the app creates exactly
 * this situation: everything synced, and a fresh onboarding form with no way
 * to say "I already have an account".
 */
export const RestoreFromSync: React.FC<RestoreFromSyncProps> = ({ onRestore }) => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    const normalised = normaliseCode(code);
    if (!isValidCode(normalised)) {
      setError('That code is not complete. It should be 26 characters.');
      return;
    }
    setBusy(true); setError(null);
    try {
      // Saved first: a successful pull immediately triggers the persist and
      // opening-sync paths, which both read the code from storage.
      saveCode(normalised);
      await onRestore(normalised);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore from that code.');
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="text-center mt-6">
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-fg-soft hover:text-nutri underline underline-offset-4 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri rounded-control px-2 py-1"
        >
          Already use VitalQuest? Restore with your sync code
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-raised border border-edge rounded-tile p-5 max-w-md mx-auto">
      <h3 className="inline-flex items-center gap-2 font-display font-bold text-fg">
        <IconDeviceMobile size={18} className="text-nutri" /> Restore your data
      </h3>
      <p className="text-sm text-fg-soft mt-1.5 leading-snug">
        Open VitalQuest on your other device, go to your profile, and copy the
        sync code shown there.
      </p>

      <div className="mt-4 space-y-3">
        <Field
          label="Sync code"
          id="restore-code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) restore(); }}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <Button variant="primary" onClick={restore} loading={busy} loadingLabel="Restoring…">
            Restore
          </Button>
          <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 inline-flex items-start gap-1.5 text-sm text-fat">
          <IconAlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
};
