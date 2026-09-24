import { randomInt } from "crypto";

// 4-digit numeric access code (1000–9999), e.g. "4821".
export function generateCode(): string {
  return String(randomInt(1000, 10000));
}
