import { randomBytes } from "crypto";

// Base32 alphabet without ambiguous characters (0, O, I, L, 1 removed).
// 32^6 = ~1.07 billion combinations (vs ~16.7M for 6 hex chars).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}