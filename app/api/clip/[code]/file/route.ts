import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { hashCode } from "@/lib/encryption";
import { deleteFromCloudinary } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

const PASSWORD_PEPPER = process.env.ENCRYPTION_KEY || "";

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt + PASSWORD_PEPPER).digest("hex");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    await dbConnect();
    const { code } = await params;
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ message: "File key is required" }, { status: 400 });

    const clip = await Clip.findOne({ code: hashCode(code) });
    if (!clip) return NextResponse.json({ message: "Clip not found" }, { status: 404 });

    if (new Date() > new Date(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    if (clip.passwordHash && clip.salt) {
      const provided = req.headers.get("x-clip-password") || "";
      if (hashPassword(provided, clip.salt) !== clip.passwordHash) {
        return NextResponse.json({ message: "This clip is password protected" }, { status: 401 });
      }
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
