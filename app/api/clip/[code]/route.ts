import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { decryptText, encryptText, hashCode } from "@/lib/encryption";
import { authorizeRead, isClipExpired, requireOwner } from "@/lib/clip-auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { isValidCodeFormat } from "@/lib/codes";
import { checkRateLimit, getClientIp, peekRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { MAX_TEXT_LENGTH } from "@/lib/limits";

export const dynamic = "force-dynamic";

// Codes are only 4 digits, so wrong guesses are capped hard per IP.
const MISS_LIMIT = 15;
const MISS_WINDOW_MS = 15 * 60_000;

const notFound = () => NextResponse.json({ message: "Clip not found" }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = getClientIp(req);
    // `?live=1` is the viewer's background refresh: it has its own budget and
    // doesn't count as a view.
    const live = new URL(req.url).searchParams.get("live") === "1";
    const rate = live
      ? await checkRateLimit(`live:${ip}`, 120, 60_000)
      : await checkRateLimit(`read:${ip}`, 60, 60_000); // 60 reads / minute / IP
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    const missKey = `miss:${ip}`;
    const misses = await peekRateLimit(missKey, MISS_LIMIT, MISS_WINDOW_MS);
    if (!misses.ok) return tooManyRequests(misses.retryAfter);

    const { code } = await params;
    if (!isValidCodeFormat(code)) return notFound();

    await dbConnect();
    const clip = await Clip.findOne({ code: hashCode(code) });
    if (!clip) {
      await checkRateLimit(missKey, MISS_LIMIT, MISS_WINDOW_MS);
      return notFound();
    }

    const auth = authorizeRead(req, clip);
    if (auth instanceof Response) return auth;

    let { views, lastViewedAt } = clip;
    if (!auth.owner && !live) {
      const now = new Date();
      await Clip.updateOne({ _id: clip._id }, { $inc: { views: 1 }, $set: { lastViewedAt: now } });
      views = (views ?? 0) + 1;
      lastViewedAt = now;
    }

    return NextResponse.json(
      {
        code,
        text: decryptText(clip.text || ""),
        files: clip.files.map((f: { filename: string; path: string; size: number; key?: string; resourceType?: string }) => ({
          filename: f.filename,
          path: f.path,
          size: f.size,
          key: f.key,
          resourceType: f.resourceType,
        })),
        createdAt: clip.createdAt,
        expiresAt: clip.expiresAt,
        isOwner: auth.owner,
        views: views ?? 0,
        lastViewedAt: lastViewedAt ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Access Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/** Edit the clip's text — creator only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const rate = await checkRateLimit(`write:${getClientIp(req)}`, 30, 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    const { code } = await params;
    if (!isValidCodeFormat(code)) return notFound();

    await dbConnect();
    const clip = await Clip.findOne({ code: hashCode(code) });
    if (!clip) return notFound();
    const denied = requireOwner(req, clip);
    if (denied) return denied;
    if (isClipExpired(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : null;
    if (text === null) return NextResponse.json({ message: "Text is required." }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ message: `Text content is too large (max ${MAX_TEXT_LENGTH / 1000}KB)` }, { status: 400 });
    }
    if (!text.trim() && clip.files.length === 0) {
      return NextResponse.json({ message: "A clip needs some text or files." }, { status: 400 });
    }

    await Clip.updateOne({ _id: clip._id }, { $set: { text: encryptText(text) } });
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Edit Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/** Delete the clip and its files — creator only. */
export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const rate = await checkRateLimit(`write:${getClientIp(req)}`, 30, 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    const { code } = await params;
    if (!isValidCodeFormat(code)) return notFound();

    await dbConnect();
    const clip = await Clip.findOne({ code: hashCode(code) });
    if (!clip) return notFound();
    const denied = requireOwner(req, clip);
    if (denied) return denied;

    await Clip.deleteOne({ _id: clip._id });
    for (const f of clip.files) {
      if (f.key) await deleteFromCloudinary(f.key, f.resourceType || "raw");
    }

    return NextResponse.json({ message: "Clip deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
