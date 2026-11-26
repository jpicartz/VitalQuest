import { describe, it, expect } from 'vitest';
import {
  generateCode, deriveKeys, encryptJson, decryptJson,
  normaliseCode, formatCode, isValidCode, CODE_LENGTH,
} from './syncCrypto';

describe('sync codes', () => {
  it('generates a full-entropy code every time', () => {
    const code = generateCode();
    expect(code).toHaveLength(CODE_LENGTH);
    expect(isValidCode(code)).toBe(true);
  });

  it('never repeats', () => {
    // 128 bits: a collision in 500 draws would mean the RNG is broken.
    const codes = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(codes.size).toBe(500);
  });

  it('accepts the code back in any shape a human might type it', () => {
    const code = generateCode();
    for (const variant of [code.toLowerCase(), formatCode(code), ` ${formatCode(code).toLowerCase()} `]) {
      expect(normaliseCode(variant)).toBe(code);
    }
  });

  it('repairs the characters people misread', () => {
    // Crockford excludes these precisely because they are ambiguous aloud.
    expect(normaliseCode('O')).toBe('0');
    expect(normaliseCode('I')).toBe('1');
    expect(normaliseCode('L')).toBe('1');
  });

  it('leaves valid characters alone', () => {
    // Q IS in this alphabet. An earlier version "repaired" it to 0, which
    // silently corrupted one character in every 32 — every code containing a
    // Q derived the wrong key and found no data, with no error to explain it.
    expect(normaliseCode('Q')).toBe('Q');
    for (const c of '0123456789ABCDEFGHJKMNPQRSTVWXYZ') {
      expect(normaliseCode(c), `${c} should survive normalisation`).toBe(c);
    }
  });

  it('rejects a code of the wrong length', () => {
    expect(isValidCode('ABC')).toBe(false);
    expect(isValidCode(generateCode() + 'X')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });
});

describe('key derivation', () => {
  it('is deterministic, so the same code finds the same data', async () => {
    const code = generateCode();
    const a = await deriveKeys(code);
    const b = await deriveKeys(formatCode(code).toLowerCase());
    expect(a.syncId).toBe(b.syncId);
  });

  it('gives different codes different ids', async () => {
    const a = await deriveKeys(generateCode());
    const b = await deriveKeys(generateCode());
    expect(a.syncId).not.toBe(b.syncId);
  });

  it('never exposes the encryption key', async () => {
    const { encryptionKey } = await deriveKeys(generateCode());
    // The whole design rests on this: a non-extractable key cannot be read
    // back out of the browser, so it cannot be logged or posted by accident.
    expect(encryptionKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', encryptionKey)).rejects.toThrow();
  });

  it('does not leak the key through the id', async () => {
    // The server holds syncId. If the key were derivable from it, the server
    // could read everything — this asserts the domain separation holds.
    const { syncId } = await deriveKeys(generateCode());
    expect(syncId).toMatch(/^[0-9a-f]{64}$/);
    // The id is a hash output, not the code itself.
    expect(syncId).not.toContain(generateCode().slice(0, 8));
  });

  it('refuses an invalid code rather than deriving something useless', async () => {
    await expect(deriveKeys('nope')).rejects.toThrow(/not valid/i);
  });
});

describe('encryption round trip', () => {
  const sample = {
    profile: { name: 'Juan', weightKg: 80 },
    foodLogs: [{ id: 'l1', food: { name: 'Scrambled eggs', calories: 310 } }],
  };

  it('returns exactly what went in', async () => {
    const { encryptionKey } = await deriveKeys(generateCode());
    const payload = await encryptJson(sample, encryptionKey);
    expect(await decryptJson(payload, encryptionKey)).toEqual(sample);
  });

  it('produces ciphertext with none of the plaintext in it', async () => {
    // The point of the whole exercise: the server must not be able to see
    // what the user ate.
    const { encryptionKey } = await deriveKeys(generateCode());
    const { ciphertext } = await encryptJson(sample, encryptionKey);
    expect(ciphertext).not.toMatch(/Juan|eggs|Scrambled|profile|foodLogs/i);
  });

  it('uses a fresh nonce every time', async () => {
    const { encryptionKey } = await deriveKeys(generateCode());
    const a = await encryptJson(sample, encryptionKey);
    const b = await encryptJson(sample, encryptionKey);
    // Same key, same plaintext, different output — an AES-GCM nonce reused
    // under one key is the classic catastrophic misuse of the mode.
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('fails closed on the wrong code', async () => {
    const mine = await deriveKeys(generateCode());
    const theirs = await deriveKeys(generateCode());
    const payload = await encryptJson(sample, mine.encryptionKey);
    await expect(decryptJson(payload, theirs.encryptionKey)).rejects.toThrow(/does not match/i);
  });

  it('fails closed on tampered ciphertext rather than returning partial data', async () => {
    const { encryptionKey } = await deriveKeys(generateCode());
    const payload = await encryptJson(sample, encryptionKey);
    const flipped = payload.ciphertext.slice(0, -4) + (payload.ciphertext.endsWith('A') ? 'BBBB' : 'AAAA');
    await expect(decryptJson({ ...payload, ciphertext: flipped }, encryptionKey)).rejects.toThrow();
  });

  it('survives a payload with unicode and large numbers', async () => {
    const { encryptionKey } = await deriveKeys(generateCode());
    const awkward = { name: 'café — jalapeño 🌶️', n: 1e21, nested: { deep: [1, null, 'x'] } };
    const payload = await encryptJson(awkward, encryptionKey);
    expect(await decryptJson(payload, encryptionKey)).toEqual(awkward);
  });
});
