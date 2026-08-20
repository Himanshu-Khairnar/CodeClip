import CryptoJS from "crypto-js";

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

export function encryptText(text: string): string {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, getSecretKey()).toString();
}

export function decryptText(cipherText: string): string {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, getSecretKey());
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("Failed to decrypt text", err);
    return "";
  }
}

// Hash the access code (with a pepper) so the raw code is never stored in the DB.
// Deterministic so we can still look clips up by code.
export function hashCode(code: string): string {
  return CryptoJS.SHA256(code.toUpperCase() + getSecretKey()).toString();
}