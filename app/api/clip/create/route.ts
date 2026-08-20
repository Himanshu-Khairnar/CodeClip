import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText, hashCode } from "@/lib/encryption";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { generateCode } from "@/lib/codes";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOTAL_SIZE = 30 * 1024 * 1024;
const MAX_TEXT_LENGTH = 500_000; // ~500KB
const VALID_EXPIRY_HOURS = new Set([1, 24, 168]);

const PASSWORD_PEPPER = process.env.ENCRYPTION_KEY || "";

function hashPassword(password: string, salt: string): string {
  return createHash("sha256")
    .update(password + salt + PASSWORD_PEPPER)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, 20, 60_000); // 20 creations / minute / IP
    if (!rate.ok) {
      return NextResponse.json(
        { message: `Too many requests. Try again in ${rate.retryAfter}s.` },
        { status: 429 }
      );
    }

    await dbConnect();

    const formData = await req.formData();
    const text = (formData.get("text") as string) || "";
    const isOneTimeView = formData.get("isOneTimeView") === "true";
    const rawExpiry = formData.get("expiry") as string;
    const expiryHours = VALID_EXPIRY_HOURS.has(Number(rawExpiry))
      ? Number(rawExpiry)
      : 24;
    const password = (formData.get("password") as string) || "";

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { message: `Text content is too large (max ${MAX_TEXT_LENGTH / 1000}KB)` },
        { status: 400 }
      );
    }

    const files: File[] = formData.getAll("files") as File[];

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json({ message: "Limit exceeded (max 30MB)" }, { status: 400 });
    }

    const savedFiles: { filename: string; path: string; size: number; key: string; resourceType: string }[] = [];

    const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "ico", "bmp"]);
    const videoAudioExtensions = new Set(["mp4", "webm", "mov", "avi", "mkv", "mp3", "wav", "ogg", "m4a", "flac", "aac"]);

    const filesToUpload = files.filter((f) => f.name && f.size > 0);
    for (const file of filesToUpload) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      let resourceType: "image" | "video" | "raw" = "raw";
      if (imageExtensions.has(ext)) {
        resourceType = "image";
      } else if (videoAudioExtensions.has(ext)) {
        resourceType = "video";
      } else {
        resourceType = "raw";
      }

      const lastDotIndex = file.name.lastIndexOf(".");
      const baseName = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
      const sanitizedBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");
      // Note: do NOT append the file extension to the public_id. Cloudinary appends
      // the format automatically for images/videos, and raw files with an extension
      // in the public_id are rejected (401 deny/ACL failure) on the delivery URL.
      const publicId = `${Date.now()}-${sanitizedBase}`;

      let result;
      try {
        result = await uploadToCloudinary(buffer, {
          resource_type: resourceType,
          folder: "online-clipboard",
          public_id: publicId,
        });
      } catch (uploadErr) {
        console.warn(`Upload with resource_type ${resourceType} failed, trying raw fallback:`, uploadErr);
        result = await uploadToCloudinary(buffer, {
          resource_type: "raw",
          folder: "online-clipboard",
          public_id: publicId,
        });
      }

      savedFiles.push({
        filename: file.name,
        path: result.secure_url,
        size: file.size,
        key: result.public_id,
        resourceType: result.resource_type || resourceType,
      });
    }

    // Generate a unique code with a small collision-retry loop.
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateCode();
      const exists = await Clip.exists({ code: hashCode(code) });
      if (!exists) break;
    }

    const encryptedText = encryptText(text);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const salt = password ? randomBytes(16).toString("hex") : undefined;
    const passwordHash = password && salt ? hashPassword(password, salt) : undefined;

    await Clip.create({
      code: hashCode(code),
      text: encryptedText,
      files: savedFiles,
      totalSize,
      isOneTimeView,
      expiresAt,
      passwordHash,
      salt,
    });

    return NextResponse.json({ code }, { status: 201 });
  } catch (error: unknown) {
    console.error("Upload Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}