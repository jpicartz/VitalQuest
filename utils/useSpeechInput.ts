import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Dictation via the Web Speech API.
 *
 * Deliberately additive: it writes a transcript into whatever text state the
 * caller already has, so the existing typed path stays the primary one and
 * nothing breaks when speech is unavailable.
 *
 * Availability is genuinely patchy — Chrome and Safari expose it behind the
 * webkit prefix, Firefox does not implement it at all. `supported` is false in
 * that case and the caller should hide the button rather than show one that
 * cannot work.
 *
 * PRODUCTION NOTE: this also needs `Permissions-Policy: microphone=(self)` in
 * vercel.json. Vite's dev server does not apply those headers, so without it
 * dictation works perfectly on localhost and is silently dead once deployed.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

const getRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    (new () => SpeechRecognitionLike) | null;
};

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export const useSpeechInput = (onTranscript: (text: string) => void): SpeechInput => {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Held in a ref so restarting does not need a new recognition instance.
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  const supported = getRecognitionCtor() !== null;

  // Never leave the microphone open if the component unmounts mid-utterance.
  useEffect(() => () => { recRef.current?.abort(); }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);

    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (e) => {
        const text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0]?.transcript ?? '')
          .join(' ')
          .trim();
        if (text) cbRef.current(text);
      };

      rec.onerror = (e) => {
        setListening(false);
        // 'aborted' and 'no-speech' are normal outcomes, not failures worth
        // shouting about.
        if (e.error === 'aborted' || e.error === 'no-speech') return;
        setError(
          e.error === 'not-allowed'
            ? 'Microphone access was blocked. You can still type instead.'
            : "Couldn't hear that. Try again, or type it instead."
        );
      };

      rec.onend = () => setListening(false);

      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setError('Voice input is unavailable. You can still type instead.');
    }
  }, []);

  return { supported, listening, error, start, stop };
};
