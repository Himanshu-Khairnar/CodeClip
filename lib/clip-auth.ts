import { hashToken, safeEqualHex } from "@/lib/encryption";

export const OWNER_HEADER = "x-owner-token";

interface AuthClip {
  ownerTokenHash?: string;
  expiresAt: Date;
}

/** True when the clip's expiry timestamp is in the past. */
export function isClipExpired(expiresAt: unknown): boolean {
  return new Date() > new Date(expiresAt as string);
}

/** True when the request carries the creator's owner token. */
export function isOwner(req: Request, clip: AuthClip): boolean {
  const token = req.headers.get(OWNER_HEADER);
  if (!token || !clip.ownerTokenHash) return false;
  return safeEqualHex(hashToken(token), clip.ownerTokenHash);
}

/** 403 unless the request carries the creator's owner token. */
export function requireOwner(req: Request, clip: AuthClip): Response | null {
  if (isOwner(req, clip)) return null;
  return Response.json(
    { message: "Only the creator of this clip can change it." },
    { status: 403 }
  );
}

/** Gate read access on expiry. Returns a Response to send on failure, or `{ owner }` on success. */
export function authorizeRead(req: Request, clip: AuthClip): Response | { owner: boolean } {
  if (isClipExpired(clip.expiresAt)) {
    return Response.json({ message: "Clip has expired" }, { status: 410 });
  }
  return { owner: isOwner(req, clip) };
}
