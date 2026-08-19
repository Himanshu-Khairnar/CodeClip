import CryptoJS from "crypto-js";

if (!process.env.ENCRYPTION_KEY) {
  throw new Error(
    "ENCRYPTION_KEY environment variable is required. Generate one with:\n" +
      'node -e "console.log(\'ENCRYPTION_KEY=\' + require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

const SECRET_KEY: string = process.env.ENCRYPTION_KEY;

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