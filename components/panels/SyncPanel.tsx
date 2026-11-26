import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import {
  generateCode, isValidCode, normaliseCode, savedCode, saveCode, forgetCode,
  pairingUrl, lastSyncedAt,
} from '../../services/syncService';
import { formatCode } from '../../utils/syncCrypto';
import { BUILD_ID } from '../../utils/buildVersion';
import { IconDeviceMobile, IconRefresh, IconCheck, IconAlertTriangle } from '@tabler/icons-react';

interface SyncPanelProps {
  /** Runs a full pull-merge-push cycle and reports what changed. */
  onSync: (code: string) => Promise<{ added: number }>;
}

type Mode = 'idle' | 'showing' | 'entering';

export const SyncPanel: React.FC<SyncPanelProps> = ({ onSync }) => {
  const [code, setCode] = useState<string | null>(() => savedCode());
  const [mode, setMode] = useState<Mode>('idle');
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState(() => lastSyncedAt());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The QR library is loaded only when a code is on screen — the same
  // on-demand pattern the PDF export uses, so it never reaches the main bundle.
  useEffect(() => {
    if (mode !== 'showing' || !code || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const { default: QRCode } = await import('qrcode');
      if (cancelled || !canvasRef.current) return;
      await QRCode.toCanvas(canvasRef.current, pairingUrl(code), {
        width: 180, margin: 1,
        color: { dark: '#0b1120', light: '#ffffff' },
      });
    })().catch(() => setError('Could not draw the QR code. The code below still works.'));
    return () => { cancelled = true; };
  }, [mode, code]);

  const runSync = async (withCode: string) => {
    setBusy(true); setError(null); setResult(null);
    try {
      const { added } = await onSync(withCode);
      setSyncedAt(Date.now());
      setResult(added > 0 ? `Synced — ${added} new ${added === 1 ? 'entry' : 'entries'} from your other device.` : 'Synced. Everything was already up to date.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const startNew = async () => {
    const fresh = generateCode();
    saveCode(fresh);
    setCode(fresh);
    setMode('showing');
    await runSync(fresh);
  };

  const useExisting = async () => {
    const normalised = normaliseCode(entry);
    if (!isValidCode(normalised)) { setError('That code is not complete. Check for a missing character.'); return; }
    saveCode(normalised);
    setCode(normalised);
    setMode('idle');
    setEntry('');
    await runSync(normalised);
  };

  const disconnect = () => {
    forgetCode();
    setCode(null); setMode('idle'); setResult(null); setError(null); setSyncedAt(0);
  };

  return (
    <section aria-labelledby="sync-title" className="bg-raised rounded-tile p-5 border border-edge">
      <h4 id="sync-title" className="inline-flex items-center gap-2 font-display font-bold text-fg">
        <IconDeviceMobile size={18} className="text-nutri" /> Use this on your phone
      </h4>
      <p className="text-sm text-fg-soft mt-1.5 leading-snug">
        Your data is encrypted on this device before it is sent. The server stores
        bytes it cannot read — there is still no account and nothing readable to breach.
      </p>

      {!code && mode !== 'entering' && (
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" onClick={startNew} loading={busy} loadingLabel="Setting up…">
            Create a sync code
          </Button>
          <Button variant="outline" onClick={() => { setMode('entering'); setError(null); }}>
            I already have one
          </Button>
        </div>
      )}

      {mode === 'entering' && (
        <div className="mt-4 space-y-3">
          <Field
            label="Sync code"
            id="sync-code-entry"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={useExisting} loading={busy} loadingLabel="Connecting…">
              Connect
            </Button>
            <Button variant="ghost" onClick={() => { setMode('idle'); setEntry(''); setError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {code && (
        <div className="mt-4 space-y-4">
          {mode === 'showing' && (
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-card rounded-tile p-4 border border-edge">
              {/* White plate behind the QR: scanners need the quiet zone and
                  the contrast, and the card surface is off-white in light mode
                  and near-black in dark. */}
              <div className="bg-white p-2 rounded-control shrink-0">
                <canvas ref={canvasRef} width={180} height={180} aria-label="Pairing QR code" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-sm text-fg-soft leading-snug">
                  Point your phone&apos;s camera at this, then tap the link. Or type the
                  code into the app on your phone.
                </p>
                <code className="nums block mt-3 text-sm font-bold tracking-wide text-fg break-all">
                  {formatCode(code)}
                </code>
                <p className="text-[11px] text-fg-mute mt-2 leading-snug">
                  Anyone with this code can read your data. It is the only way back
                  in — we cannot recover it for you.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => runSync(code)} loading={busy} loadingLabel="Syncing…">
              <IconRefresh size={16} /> Sync now
            </Button>
            {mode !== 'showing' && (
              <Button variant="outline" onClick={() => setMode('showing')}>Show code &amp; QR</Button>
            )}
            <Button variant="ghost" className="text-fg-mute text-sm ml-auto" onClick={disconnect}>
              Disconnect
            </Button>
          </div>

          {syncedAt > 0 && !result && !error && (
            <p className="nums text-xs text-fg-mute">
              Last synced {new Date(syncedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {result && (
        <p role="status" className="mt-3 inline-flex items-start gap-1.5 text-sm text-nutri">
          <IconCheck size={15} stroke={2.5} className="mt-0.5 shrink-0" /> {result}
        </p>
      )}
      {/* Both devices must be on the same build for a sync to behave. When one
          is not, the symptom is "I synced and nothing happened" — with nothing
          on screen to explain it. */}
      <p className="nums text-[10px] text-fg-mute mt-4">Build {BUILD_ID}</p>

      {error && (
        <p role="alert" className="mt-3 inline-flex items-start gap-1.5 text-sm text-fat">
          <IconAlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </section>
  );
};
