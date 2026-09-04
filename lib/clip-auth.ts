import { createHash } from "crypto";

const PASSWORD_PEPPER = process.env.ENCRYPTION_KEY || "";

interface PasswordProtected {
  passwordHash?: string | null;
  salt?: string | null;
}

/** Single canonical password hash — previously copy-pasted in 4 route handlers. */
export function hashClipPassword(password: string, salt: string): string {
  return createHash("sha256")
    .update(password + salt + PASSWORD_PEPPER)
    .digest("hex");
}

/** True when the clip carries no password, or the provided value matches. */
export function hasValidClipPassword(
  clip: PasswordProtected,
  provided: string
): boolean {
  if (!clip.passwordHash || !clip.salt) return true;
  return hashClipPassword(provided, clip.salt) === clip.passwordHash;
}

/** True when the clip's expiry timestamp is in the past. */
export function isClipExpired(expiresAt: unknown): boolean {
  return new Date() > new Date(expiresAt as string);
}
