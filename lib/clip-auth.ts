import { hashToken, safeEqualHex, verifyPassword } from "@/lib/encryption";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { BURN_GRACE_MS } from "@/lib/limits";

export const OWNER_HEADER = "x-owner-token";
export const PASSWORD_HEADER = "x-clip-password";

interface AuthClip {
  _id: unknown;
  ownerTokenHash?: string;
  passwordHash?: string;
  burnedAt?: Date | null;
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

/**
 * Gate read access: expiry, burn-after-read, and password. Owners bypass
 * burn and password checks. Returns a Response to send on failure, or
 * `{ owner }` on success.
 */
export async function authorizeRead(
  req: Request,
  clip: AuthClip,
  opts: { allowBurnGrace?: boolean } = {}
): Promise<Response | { owner: boolean }> {
  if (isClipExpired(clip.expiresAt)) {
    return Response.json({ message: "Clip has expired" }, { status: 410 });
  }
  const owner = isOwner(req, clip);
  if (owner) return { owner };

  if (clip.burnedAt) {
    const withinGrace = Date.now() - new Date(clip.burnedAt).getTime() < BURN_GRACE_MS;
    if (!opts.allowBurnGrace || !withinGrace) {
      return Response.json(
        { message: "This clip was set to self-destruct and has already been opened." },
        { status: 410 }
      );
    }
  }

  if (clip.passwordHash) {
    const raw = req.headers.get(PASSWORD_HEADER);
    if (!raw) {
      return Response.json({ message: "This clip is password protected.", passwordRequired: true }, { status: 401 });
    }
    const rate = await checkRateLimit(`pw:${getClientIp(req)}:${String(clip._id)}`, 10, 10 * 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter);
    let password = raw;
    try {
      password = decodeURIComponent(raw);
    } catch {
      // use the raw header value
    }
    if (!verifyPassword(password, clip.passwordHash)) {
      return Response.json({ message: "Incorrect password.", passwordRequired: true }, { status: 401 });
    }
  }

  return { owner };
}
