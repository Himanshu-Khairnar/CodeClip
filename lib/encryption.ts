import CryptoJS from "crypto-js";

const SECRET_KEY = process.env.ENCRYPTION_KEY || "default_super_secret_key_123!";

export function encryptText(text: string): string {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

export function decryptText(cipherText: string): string {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("Failed to decrypt text", err);
    return "";
  }
}

// Hash the access code (with a pepper) so the raw code is never stored in the DB.
// Deterministic so we can still look clips up by code.
export function hashCode(code: string): string {
  return CryptoJS.SHA256(code.toUpperCase() + SECRET_KEY).toString();
}
