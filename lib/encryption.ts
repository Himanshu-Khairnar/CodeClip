import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

function getSecretKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    // During `next build` env vars may not be set — don't throw at import time.
    // Throw lazily when encryption is actually used at runtime.
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. Generate one with:\n" +
        'node -e "console.log(\'ENCRYPTION_KEY=\' + require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return key;
}

const V2_PREFIX = "v2:";

/** 256-bit AES key derived from the configured secret. */
function aesKey(): Buffer {
  return createHash("sha256").update(getSecretKey(), "utf8").digest();
}

/** AES-256-GCM. Output: `v2:` + base64(iv | authTag | ciphertext). */
export function encryptText(text: string): string {
  if (!text) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return V2_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/**
 * OpenSSL EVP_BytesToKey (MD5, 1 iteration) — the KDF crypto-js used for
 * passphrase encryption. Only kept so clips written before the switch to
 * AES-GCM still decrypt.
 */
function evpBytesToKey(pass: Buffer, salt: Buffer, keyLen: number, ivLen: number) {
  const chunks: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let total = 0;
  while (total < keyLen + ivLen) {
    prev = createHash("md5").update(Buffer.concat([prev, pass, salt])).digest();
    chunks.push(prev);
    total += prev.length;
  }
  const all = Buffer.concat(chunks);
  return { key: all.subarray(0, keyLen), iv: all.subarray(keyLen, keyLen + ivLen) };
}

function decryptLegacy(cipherText: string): string {
  const raw = Buffer.from(cipherText, "base64");
  if (raw.subarray(0, 8).toString("latin1") !== "Salted__") throw new Error("Unknown ciphertext format");
  const salt = raw.subarray(8, 16);
  const { key, iv } = evpBytesToKey(Buffer.from(getSecretKey(), "utf8"), salt, 32, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString("utf8");
}

export function decryptText(cipherText: string): string {
  if (!cipherText) return cipherText;
  try {
    if (!cipherText.startsWith(V2_PREFIX)) return decryptLegacy(cipherText);
    const raw = Buffer.from(cipherText.slice(V2_PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", aesKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("Failed to decrypt text", err);
    return "";
  }
}

// Hash the access code (with a pepper) so the raw code is never stored in the DB.
// Deterministic so we can still look clips up by code. Output is identical to
// the previous crypto-js implementation, so existing clips stay reachable.
export function hashCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase() + getSecretKey(), "utf8").digest("hex");
}

/** Random secret handed to the clip creator; only its hash is stored. */
export function generateOwnerToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(`owner:${token}:${getSecretKey()}`, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** scrypt password hash, stored as `salt:hash` (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 32).toString("hex");
  return safeEqualHex(actual, hashHex);
}
