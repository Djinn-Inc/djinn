/**
 * Client-side cryptographic primitives for the Djinn protocol.
 *
 * - AES-256-GCM encryption via Web Crypto API (zero external dependencies)
 * - Shamir Secret Sharing over the BN254 scalar field
 *
 * The Shamir implementation matches the validator's Python crypto.py exactly.
 */

// ---------------------------------------------------------------------------
// BN254 scalar field prime (same as circom + validator)
// ---------------------------------------------------------------------------

export const BN254_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// ---------------------------------------------------------------------------
// Shamir types
// ---------------------------------------------------------------------------

export interface ShamirShare {
  x: number;
  y: bigint;
}

// ---------------------------------------------------------------------------
// Modular arithmetic helpers
// ---------------------------------------------------------------------------

function mod(a: bigint, p: bigint): bigint {
  const r = a % p;
  return r < 0n ? r + p : r;
}

function extendedGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (a === 0n) return [b, 0n, 1n];
  const [g, x, y] = extendedGcd(mod(b, a), a);
  return [g, y - (b / a) * x, x];
}

function modInverse(a: bigint, p: bigint): bigint {
  const a2 = mod(a, p);
  const [g, x] = extendedGcd(a2, p);
  if (g !== 1n) throw new Error("Modular inverse does not exist");
  return mod(x, p);
}

function modPow(base: bigint, exp: bigint, p: bigint): bigint {
  let result = 1n;
  let b = mod(base, p);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b, p);
    b = mod(b * b, p);
    e >>= 1n;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shamir Secret Sharing
// ---------------------------------------------------------------------------

function getRandomFieldElement(prime: bigint): bigint {
  // Generate random bytes and reduce mod prime
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let val = 0n;
  for (const b of bytes) {
    val = (val << 8n) | BigInt(b);
  }
  return mod(val, prime);
}

export function splitSecret(
  secret: bigint,
  n: number = 10,
  k: number = 7,
  prime: bigint = BN254_PRIME,
): ShamirShare[] {
  if (secret >= prime) throw new Error(`Secret must be < prime`);

  // Random polynomial: a_0 = secret, a_1..a_{k-1} random
  const coeffs: bigint[] = [secret];
  for (let i = 1; i < k; i++) {
    coeffs.push(getRandomFieldElement(prime));
  }

  const shares: ShamirShare[] = [];
  for (let i = 1; i <= n; i++) {
    let y = 0n;
    const x = BigInt(i);
    for (let j = 0; j < coeffs.length; j++) {
      y = mod(y + coeffs[j] * modPow(x, BigInt(j), prime), prime);
    }
    shares.push({ x: i, y });
  }

  return shares;
}

export function reconstructSecret(
  shares: ShamirShare[],
  prime: bigint = BN254_PRIME,
): bigint {
  const k = shares.length;
  let secret = 0n;

  for (let i = 0; i < k; i++) {
    const xi = BigInt(shares[i].x);
    const yi = shares[i].y;
    let numerator = 1n;
    let denominator = 1n;

    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      const xj = BigInt(shares[j].x);
      numerator = mod(numerator * (0n - xj), prime);
      denominator = mod(denominator * (xi - xj), prime);
    }

    const lagrangeCoeff = mod(numerator * modInverse(denominator, prime), prime);
    secret = mod(secret + yi * lagrangeCoeff, prime);
  }

  return secret;
}

// ---------------------------------------------------------------------------
// AES-256-GCM (Web Crypto API)
// ---------------------------------------------------------------------------

function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer instanceof ArrayBuffer
    ? arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)
    : new Uint8Array(arr).buffer as ArrayBuffer;
}

export function generateAesKey(): Uint8Array {
  // Generate a random key that fits within BN254 field (so Shamir roundtrip works).
  // We generate random bytes, reduce mod prime, then convert back to 32 bytes.
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const reduced = keyToBigInt(raw);
  return bigIntToKey(reduced);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  if (hex.length > 0 && !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid hex characters");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function encrypt(
  plaintext: string,
  key: Uint8Array,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    cryptoKey,
    encoded,
  );

  return {
    ciphertext: toHex(new Uint8Array(encrypted)),
    iv: toHex(iv),
  };
}

export async function decrypt(
  ciphertext: string,
  iv: string,
  key: Uint8Array,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const ivBytes = fromHex(iv);
  const ctBytes = fromHex(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
    cryptoKey,
    toArrayBuffer(ctBytes),
  );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Key <-> bigint conversion helpers
// ---------------------------------------------------------------------------

export function keyToBigInt(key: Uint8Array): bigint {
  let val = 0n;
  for (const b of key) {
    val = (val << 8n) | BigInt(b);
  }
  // Ensure it fits in the BN254 field
  return mod(val, BN254_PRIME);
}

export function bigIntToKey(val: bigint): Uint8Array {
  const key = new Uint8Array(32);
  let v = val;
  for (let i = 31; i >= 0; i--) {
    key[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return key;
}

// Hex helpers exported for use in API calls
export { toHex, fromHex };
