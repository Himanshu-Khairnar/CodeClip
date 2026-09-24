import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { hashCode } from "@/lib/encryption";
import { isClipExpired } from "@/lib/clip-auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    await dbConnect();
    const { code } = await params;
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ message: "File key is required" }, { status: 400 });

    const clip = await Clip.findOne({ code: hashCode(code) });
    if (!clip) return NextResponse.json({ message: "Clip not found" }, { status: 404 });

    if (isClipExpired(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    const file = clip.files.find((f: { key: string }) => f.key === key);
    if (!file) return NextResponse.json({ message: "File not found in clip" }, { status: 404 });

    // Delete from Cloudinary first
    try {
      await deleteFromCloudinary(file.key, file.resourceType || "raw");
    } catch (e) {
      console.warn("Cloudinary delete failed for", key, e);
    }

    // Pull from DB and recalc totalSize
    clip.files = clip.files.filter((f: { key: string }) => f.key !== key);
    clip.totalSize = clip.files.reduce((s: number, f: { size: number }) => s + (f.size || 0), 0);
    // Avoid deprecated document save validation issues - use update
    await Clip.updateOne({ _id: clip._id }, { $set: { files: clip.files, totalSize: clip.totalSize } });

    return NextResponse.json({ message: "File deleted", remaining: clip.files.length });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
