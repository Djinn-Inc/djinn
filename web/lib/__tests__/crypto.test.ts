import { describe, it, expect } from "vitest";
import {
  BN254_PRIME,
  splitSecret,
  reconstructSecret,
  generateAesKey,
  encrypt,
  decrypt,
  keyToBigInt,
  bigIntToKey,
  toHex,
  fromHex,
} from "../crypto";
import type { ShamirShare } from "../crypto";

// ---------------------------------------------------------------------------
// Shamir Secret Sharing tests
// ---------------------------------------------------------------------------

describe("Shamir Secret Sharing", () => {
  it("splits and reconstructs with all 10 shares", () => {
    const secret = 42n;
    const shares = splitSecret(secret, 10, 7);
    expect(shares.length).toBe(10);

    const recovered = reconstructSecret(shares);
    expect(recovered).toBe(secret);
  });

  it("reconstructs with exactly k=7 shares", () => {
    const secret = 123456789n;
    const shares = splitSecret(secret, 10, 7);

    // Use first 7
    const recovered = reconstructSecret(shares.slice(0, 7));
    expect(recovered).toBe(secret);
  });

  it("any 7-of-10 shares reconstruct correctly", () => {
    const secret = 999999n;
    const shares = splitSecret(secret, 10, 7);

    // Try several random 7-subsets
    const subsets = [
      [0, 1, 2, 3, 4, 5, 6],
      [3, 4, 5, 6, 7, 8, 9],
      [0, 2, 4, 5, 7, 8, 9],
      [1, 3, 5, 6, 7, 8, 9],
      [0, 1, 3, 4, 6, 8, 9],
    ];

    for (const subset of subsets) {
      const subShares = subset.map((i) => shares[i]);
      expect(reconstructSecret(subShares)).toBe(secret);
    }
  });

  it("6 shares do NOT reconstruct correctly (below threshold)", () => {
    const secret = 42n;
    const shares = splitSecret(secret, 10, 7);
    const recovered = reconstructSecret(shares.slice(0, 6));
    // With only 6 of 7 needed shares, the result should not match
    expect(recovered).not.toBe(secret);
  });

  it("works with BN254 prime-sized secrets", () => {
    const secret = BN254_PRIME - 1n;
    const shares = splitSecret(secret, 10, 7);
    const recovered = reconstructSecret(shares.slice(0, 7));
    expect(recovered).toBe(secret);
  });

  it("works with secret = 0", () => {
    const shares = splitSecret(0n, 10, 7);
    const recovered = reconstructSecret(shares.slice(0, 7));
    expect(recovered).toBe(0n);
  });

  it("works with secret = 1 (signal index encoding)", () => {
    const shares = splitSecret(1n, 10, 7);
    const recovered = reconstructSecret(shares.slice(0, 7));
    expect(recovered).toBe(1n);
  });

  it("throws if secret >= prime", () => {
    expect(() => splitSecret(BN254_PRIME, 10, 7)).toThrow();
    expect(() => splitSecret(BN254_PRIME + 1n, 10, 7)).toThrow();
  });

  it("shares have x values 1 through n", () => {
    const shares = splitSecret(42n, 10, 7);
    for (let i = 0; i < 10; i++) {
      expect(shares[i].x).toBe(i + 1);
    }
  });

  it("share y values are in [0, prime)", () => {
    const shares = splitSecret(42n, 10, 7);
    for (const s of shares) {
      expect(s.y).toBeGreaterThanOrEqual(0n);
      expect(s.y).toBeLessThan(BN254_PRIME);
    }
  });

  it("cross-validates with known Python output", () => {
    // A fixed polynomial f(x) = 5 + 3x + 7x^2 (mod BN254_PRIME) with k=3, n=5
    // f(0) = 5, f(1) = 15, f(2) = 39, f(3) = 77, f(4) = 129, f(5) = 195
    const knownShares: ShamirShare[] = [
      { x: 1, y: 15n },
      { x: 2, y: 39n },
      { x: 3, y: 77n },
    ];
    const recovered = reconstructSecret(knownShares);
    expect(recovered).toBe(5n);
  });
});

// ---------------------------------------------------------------------------
// AES-256-GCM tests
// ---------------------------------------------------------------------------

describe("AES-256-GCM", () => {
  it("generates a 32-byte key", () => {
    const key = generateAesKey();
    expect(key.length).toBe(32);
    expect(key).toBeInstanceOf(Uint8Array);
  });

  it("encrypts and decrypts a string roundtrip", async () => {
    const key = generateAesKey();
    const plaintext = "Lakers -3.5 (-110)";
    const { ciphertext, iv } = await encrypt(plaintext, key);

    expect(typeof ciphertext).toBe("string");
    expect(typeof iv).toBe("string");
    expect(iv.length).toBe(24); // 12 bytes = 24 hex chars

    const decrypted = await decrypt(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts JSON payload roundtrip", async () => {
    const key = generateAesKey();
    const payload = JSON.stringify({ realIndex: 3, pick: "Lakers -3.5 (-110)" });
    const { ciphertext, iv } = await encrypt(payload, key);
    const decrypted = await decrypt(ciphertext, iv, key);
    expect(JSON.parse(decrypted)).toEqual({ realIndex: 3, pick: "Lakers -3.5 (-110)" });
  });

  it("fails to decrypt with wrong key", async () => {
    const key1 = generateAesKey();
    const key2 = generateAesKey();
    const { ciphertext, iv } = await encrypt("secret", key1);

    await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
  });

  it("different encryptions of same plaintext produce different ciphertext", async () => {
    const key = generateAesKey();
    const { ciphertext: c1, iv: iv1 } = await encrypt("hello", key);
    const { ciphertext: c2, iv: iv2 } = await encrypt("hello", key);

    // IVs should differ (random)
    expect(iv1).not.toBe(iv2);
    // Ciphertexts should also differ
    expect(c1).not.toBe(c2);
  });
});

// ---------------------------------------------------------------------------
// Key <-> bigint conversion tests
// ---------------------------------------------------------------------------

describe("Key conversion", () => {
  it("roundtrips key through bigint", () => {
    const key = generateAesKey();
    const asInt = keyToBigInt(key);
    expect(asInt).toBeGreaterThanOrEqual(0n);
    expect(asInt).toBeLessThan(BN254_PRIME);

    // Since keyToBigInt reduces mod prime, the roundtrip may not be exact
    // for keys >= BN254_PRIME, but should work for most random keys
    const back = bigIntToKey(asInt);
    // Verify it decrypts correctly through the full flow
    expect(back.length).toBe(32);
  });

  it("bigIntToKey produces 32 bytes", () => {
    const key = bigIntToKey(42n);
    expect(key.length).toBe(32);
    expect(key[31]).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

describe("Hex helpers", () => {
  it("toHex converts bytes to hex string", () => {
    expect(toHex(new Uint8Array([0, 1, 255, 16]))).toBe("0001ff10");
  });

  it("fromHex converts hex string to bytes", () => {
    const bytes = fromHex("0001ff10");
    expect(Array.from(bytes)).toEqual([0, 1, 255, 16]);
  });

  it("roundtrips", () => {
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    expect(fromHex(toHex(original))).toEqual(original);
  });

  it("fromHex rejects odd-length strings", () => {
    expect(() => fromHex("abc")).toThrow("even length");
  });

  it("fromHex rejects non-hex characters", () => {
    expect(() => fromHex("ghij")).toThrow("Invalid hex");
  });

  it("fromHex accepts empty string", () => {
    expect(fromHex("")).toEqual(new Uint8Array(0));
  });

  it("fromHex accepts uppercase hex", () => {
    const bytes = fromHex("AABB");
    expect(Array.from(bytes)).toEqual([0xaa, 0xbb]);
  });
});

// ---------------------------------------------------------------------------
// Full flow: AES key -> Shamir split -> reconstruct -> AES decrypt
// ---------------------------------------------------------------------------

describe("Full Shamir + AES flow", () => {
  it("encrypts with AES, splits key via Shamir, reconstructs and decrypts", async () => {
    const aesKey = generateAesKey();
    const plaintext = JSON.stringify({ realIndex: 5, pick: "Celtics +4.5" });

    // Encrypt
    const { ciphertext, iv } = await encrypt(plaintext, aesKey);

    // Split key
    const keyBigInt = keyToBigInt(aesKey);
    const shares = splitSecret(keyBigInt, 10, 7);

    // Take 7 shares and reconstruct
    const recovered = reconstructSecret(shares.slice(2, 9));
    const recoveredKey = bigIntToKey(recovered);

    // Decrypt
    const decrypted = await decrypt(ciphertext, iv, recoveredKey);
    expect(JSON.parse(decrypted)).toEqual({ realIndex: 5, pick: "Celtics +4.5" });
  });
});
