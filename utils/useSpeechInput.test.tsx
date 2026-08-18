import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput } from './useSpeechInput';

/**
 * Speech support is genuinely patchy — Firefox has none, Safari uses the webkit
 * prefix — so the capability check is the most important thing here. A button
 * that cannot work is worse than no button.
 */

class MockRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  static last: MockRecognition | null = null;
  constructor() { MockRecognition.last = this; }
}

const install = (key: 'SpeechRecognition' | 'webkitSpeechRecognition') => {
  (window as unknown as Record<string, unknown>)[key] = MockRecognition;
};

beforeEach(() => { MockRecognition.last = null; });
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('useSpeechInput — capability detection', () => {
  it('reports unsupported when the API is absent (Firefox)', () => {
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    expect(result.current.supported).toBe(false);
  });

  it('detects the unprefixed API', () => {
    install('SpeechRecognition');
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    expect(result.current.supported).toBe(true);
  });

  it('detects the webkit-prefixed API (Safari, Chrome)', () => {
    install('webkitSpeechRecognition');
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    expect(result.current.supported).toBe(true);
  });

  it('start is a safe no-op when unsupported', () => {
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    expect(() => act(() => result.current.start())).not.toThrow();
    expect(result.current.listening).toBe(false);
  });
});

describe('useSpeechInput — dictating', () => {
  beforeEach(() => install('webkitSpeechRecognition'));

  it('starts listening', () => {
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    act(() => result.current.start());
    expect(MockRecognition.last!.start).toHaveBeenCalled();
    expect(result.current.listening).toBe(true);
  });

  it('hands the transcript to the caller', () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onTranscript));
    act(() => result.current.start());
    act(() => {
      MockRecognition.last!.onresult!({ results: [[{ transcript: 'two eggs and toast' }]] });
    });
    expect(onTranscript).toHaveBeenCalledWith('two eggs and toast');
  });

  it('ignores an empty transcript', () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onTranscript));
    act(() => result.current.start());
    act(() => { MockRecognition.last!.onresult!({ results: [[{ transcript: '   ' }]] }); });
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('stops listening when the utterance ends', () => {
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    act(() => result.current.start());
    act(() => { MockRecognition.last!.onend!(); });
    expect(result.current.listening).toBe(false);
  });

  it('releases the microphone on unmount', () => {
    const { result, unmount } = renderHook(() => useSpeechInput(vi.fn()));
    act(() => result.current.start());
    const rec = MockRecognition.last!;
    unmount();
    expect(rec.abort).toHaveBeenCalled();
  });
});

describe('useSpeechInput — errors', () => {
  beforeEach(() => install('webkitSpeechRecognition'));

  it('explains a blocked microphone and points back to typing', () => {
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    act(() => result.current.start());
    act(() => { MockRecognition.last!.onerror!({ error: 'not-allowed' }); });
    expect(result.current.error).toMatch(/blocked/i);
    expect(result.current.error).toMatch(/type/i);
    expect(result.current.listening).toBe(false);
  });

  it.each(['aborted', 'no-speech'])('treats %s as a normal outcome, not an error', (error) => {
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    act(() => result.current.start());
    act(() => { MockRecognition.last!.onerror!({ error }); });
    expect(result.current.error).toBeNull();
    expect(result.current.listening).toBe(false);
  });

  it('recovers if constructing recognition throws', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      function () { throw new Error('nope'); };
    const { result } = renderHook(() => useSpeechInput(vi.fn()));
    act(() => result.current.start());
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toMatch(/still type/i);
  });
});
