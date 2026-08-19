import { NextResponse } from "next/server";
import { createHash } from "crypto";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { decryptText, hashCode } from "@/lib/encryption";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const PASSWORD_PEPPER = process.env.ENCRYPTION_KEY || "";

function hashPassword(password: string, salt: string): string {
  return createHash("sha256")
    .update(password + salt + PASSWORD_PEPPER)
    .digest("hex");
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, 60, 60_000); // 60 reads / minute / IP
    if (!rate.ok) {
      return NextResponse.json(
        { message: `Too many requests. Try again in ${rate.retryAfter}s.` },
        { status: 429 }
      );
    }

    await dbConnect();
    const { code } = await params;
    const codeHash = hashCode(code);

    let clip = await Clip.findOne({ code: codeHash });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    if (new Date() > new Date(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    // Password-protected clips require a matching password header.
    if (clip.passwordHash && clip.salt) {
      const provided = req.headers.get("x-clip-password") || "";
      if (hashPassword(provided, clip.salt) !== clip.passwordHash) {
        return NextResponse.json({ message: "This clip is password protected" }, { status: 401 });
      }
    }

    // One-time view: atomically claim the clip so a second concurrent
    // request gets a 410 instead of the content. The clip itself is NOT
    // deleted here — the recipient keeps working (downloads/previews) and
    // the /api/cleanup cron purges DB + Cloudinary at expiry.
    if (clip.isOneTimeView) {
      const claimed = await Clip.findOneAndUpdate(
        { _id: clip._id, consumed: { $ne: true } },
        { $set: { consumed: true } },
        { new: true }
      );
      if (!claimed) {
        return NextResponse.json(
          { message: "Clip has already been viewed and deleted" },
          { status: 410 }
        );
      }
      clip = claimed;
    }

    // Decrypt text
    const text = decryptText(clip.text || "");

    const responseData = {
      code,
      text,
      files: clip.files,
      isOneTimeView: clip.isOneTimeView,
      createdAt: clip.createdAt,
      expiresAt: clip.expiresAt,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Access Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await dbConnect();
    const { code } = await params;

    const clip = await Clip.findOneAndDelete({ code: hashCode(code) });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    for (const f of clip.files) {
      if (f.key) {
        await deleteFromCloudinary(f.key, f.resourceType || "raw");
      }
    }

    return NextResponse.json({ message: "Clip deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}