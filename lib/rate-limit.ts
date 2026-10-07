import dbConnect from "@/lib/db";
import RateLimit from "@/models/RateLimit";

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export interface RateResult {
  ok: boolean;
  retryAfter?: number;
}

// In-memory fallback, used only if MongoDB is unreachable.
const memory = new Map<string, number>();

function windowFor(windowMs: number) {
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  return { start, end: start + windowMs };
}

/**
 * Count one hit for `key` and report whether it is within `limit` per
 * `windowMs`. Backed by MongoDB so the limit holds across serverless
 * instances (a per-process Map resets on every cold start).
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const { start, end } = windowFor(windowMs);
  const id = `${key}:${windowMs}:${start}`;
  let count: number;
  try {
    await dbConnect();
    const doc = await RateLimit.findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(end) } },
      { upsert: true, new: true }
    ).lean<{ count: number }>();
    count = doc?.count ?? 1;
  } catch (err) {
    console.warn("Rate limit store unavailable, using memory:", err);
    if (memory.size > 5000) memory.clear();
    count = (memory.get(id) ?? 0) + 1;
    memory.set(id, count);
  }
  if (count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((end - Date.now()) / 1000)) };
  return { ok: true };
}

/** Read the current count without incrementing it. */
export async function peekRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const { start, end } = windowFor(windowMs);
  const id = `${key}:${windowMs}:${start}`;
  try {
    await dbConnect();
    const doc = await RateLimit.findById(id).lean<{ count: number }>();
    if ((doc?.count ?? 0) >= limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((end - Date.now()) / 1000)) };
    }
  } catch {
    if ((memory.get(id) ?? 0) >= limit) return { ok: false, retryAfter: Math.ceil((end - Date.now()) / 1000) };
  }
  return { ok: true };
}

export function tooManyRequests(retryAfter?: number) {
  return Response.json(
    { message: `Too many requests. Try again in ${retryAfter ?? 60}s.` },
    { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined }
  );
}
