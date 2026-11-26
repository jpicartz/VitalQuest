/**
 * End-to-end encryption for device sync.
 *
 * The server stores ciphertext and nothing else. That is what lets this amend
 * decision §7 ("no account, no database") without giving up the part of it that
 * mattered: there is still nothing readable to breach and no account to create.
 *
 * THE KEY NEVER REACHES THE SERVER. Two independent values are derived from one
 * code via HKDF with different `info` labels:
 *
 *     code (128 random bits)
 *       ├─ HKDF(info: "id")  → syncId  → sent to the server as the row key
 *       └─ HKDF(info: "key") → AES-GCM → stays on the device
 *
 * HKDF is one-way and the two labels are domain-separated, so holding every
 * syncId in the database gets you no closer to any key.
 *
 * The code is GENERATED, never chosen. A user-picked passphrase would be
 * brute-forceable offline by anyone who copied the stored blob; 128 random bits
 * are not. This removes the weakest link rather than warning about it.
 */

/** Crockford base32 — no I, L, O or U, so it cannot produce a misread digit. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Bytes of entropy in a sync code. */
const CODE_BYTES = 16; // 128 bits

/**
 * Fixed salt. Public and constant on purpose.
 *
 * HKDF's salt adds nothing here: the input is already 128 bits of uniform
 * entropy, so there is no low-entropy secret to stretch. It is present to
 * domain-separate this app's derivation from any other use of the same code.
 */
const SALT = new TextEncoder().encode('vitalquest-sync-v1');

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    // Web Crypto is unavailable on insecure origins other than localhost.
    throw new Error('Secure storage is unavailable in this browser context.');
  }
  return c.subtle;
};

const toBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const fromBase32 = (text: string): Uint8Array => {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
};

/**
 * Normalise a code the user typed.
 *
 * Accepts lower case and any grouping, and repairs ONLY the three characters
 * Crockford excludes because they are misread: O for zero, I and L for one.
 *
 * It deliberately does NOT repair Q or U. Q is a VALID character in this
 * alphabet, so "fixing" it to 0 corrupted one character in every 32 — caught
 * by the round-trip test rather than by reading the alphabet carefully. U is
 * excluded by Crockford but has no obvious intended value, so it is stripped
 * and the length check then rejects the code with a clear error, which beats
 * guessing V and handing back someone else's data.
 */
export const normaliseCode = (input: string): string =>
  String(input ?? '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
    .replace(/U/g, '');

/** A sync code is 26 base32 characters once normalised. */
export const CODE_LENGTH = Math.ceil((CODE_BYTES * 8) / 5);

export const isValidCode = (input: string): boolean =>
  normaliseCode(input).length === CODE_LENGTH;

/** Group a code for display. Never used for comparison — normalise first. */
export const formatCode = (code: string): string =>
  (normaliseCode(code).match(/.{1,5}/g) ?? []).join('-');

/** A fresh 128-bit code. The only way a code is ever created. */
export const generateCode = (): string => {
  const bytes = new Uint8Array(CODE_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase32(bytes);
};

export interface DerivedKeys {
  /** Hex. Safe to send — the server uses it as the row key. */
  syncId: string;
  /** Non-extractable AES-GCM key. Never serialised, never sent. */
  encryptionKey: CryptoKey;
}

export const deriveKeys = async (code: string): Promise<DerivedKeys> => {
  const normalised = normaliseCode(code);
  if (normalised.length !== CODE_LENGTH) throw new Error('That sync code is not valid.');

  const material = await subtle().importKey(
    'raw', fromBase32(normalised), 'HKDF', false, ['deriveBits', 'deriveKey'],
  );

  const idBits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode('id') },
    material, 256,
  );
  const syncId = [...new Uint8Array(idBits)]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  // `extractable: false` — the browser will not hand this key back out, so it
  // cannot be logged, serialised into state, or posted anywhere by mistake.
  const encryptionKey = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode('key') },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );

  return { syncId, encryptionKey };
};

export interface Encrypted {
  /** base64 ciphertext. */
  ciphertext: string;
  /** base64 nonce, fresh for every encryption. */
  iv: string;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const encryptJson = async (value: unknown, key: CryptoKey): Promise<Encrypted> => {
  // A fresh random IV per encryption. Reusing one under the same AES-GCM key
  // is the classic catastrophic misuse of this mode.
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const buffer = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext: toBase64(new Uint8Array(buffer)), iv: toBase64(iv) };
};

/**
 * Decrypt, or throw.
 *
 * AES-GCM is authenticated, so a wrong key, a corrupted blob and a tampered
 * blob are indistinguishable here and all fail closed. There is deliberately no
 * "best effort" path: silently returning partial data would be worse than an
 * error in an app whose numbers are the product.
 */
export const decryptJson = async <T>(payload: Encrypted, key: CryptoKey): Promise<T> => {
  try {
    const buffer = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(buffer)) as T;
  } catch {
    throw new Error('That sync code does not match this data.');
  }
};
