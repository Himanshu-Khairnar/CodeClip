/** True when the clip's expiry timestamp is in the past. */
export function isClipExpired(expiresAt: unknown): boolean {
  return new Date() > new Date(expiresAt as string);
}
