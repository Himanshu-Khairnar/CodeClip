import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { hashCode } from "@/lib/encryption";
import { isClipExpired, requireOwner } from "@/lib/clip-auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { isValidCodeFormat } from "@/lib/codes";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Remove one file from a clip — creator only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const rate = await checkRateLimit(`write:${getClientIp(req)}`, 30, 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    const { code } = await params;
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ message: "File key is required" }, { status: 400 });
    if (!isValidCodeFormat(code)) return NextResponse.json({ message: "Clip not found" }, { status: 404 });

    await dbConnect();
    const clip = await Clip.findOne({ code: hashCode(code) });
    if (!clip) return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    const denied = requireOwner(req, clip);
    if (denied) return denied;

    if (isClipExpired(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    const file = clip.files.find((f: { key: string }) => f.key === key);
    if (!file) return NextResponse.json({ message: "File not found in clip" }, { status: 404 });

    // Pull from DB first so a failed Cloudinary call can't leave a dangling entry.
    const files = clip.files.filter((f: { key: string }) => f.key !== key);
    const totalSize = files.reduce((s: number, f: { size: number }) => s + (f.size || 0), 0);
    await Clip.updateOne({ _id: clip._id }, { $set: { files, totalSize } });

    try {
      await deleteFromCloudinary(file.key, file.resourceType || "raw");
    } catch (e) {
      // The cleanup cron's orphan sweep will catch it.
      console.warn("Cloudinary delete failed for", key, e);
    }

    return NextResponse.json({ message: "File deleted", remaining: files.length });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
