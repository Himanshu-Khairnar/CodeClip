import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const UPLOAD_FOLDER = "online-clipboard";

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "ico", "bmp"]);
const videoAudioExtensions = new Set([
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "ogg", "m4a", "flac", "aac",
]);

/**
 * Returns signed params for ONE direct browser → Cloudinary upload.
 * The file bytes never touch our Vercel function, so the ~4.5MB
 * serverless body limit doesn't apply.
 *
 * The server picks the public_id + resource_type (decided by file
 * extension) and signs exactly { folder, public_id, timestamp } —
 * the client must echo those same values back to Cloudinary.
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, 30, 60_000); // 30 signatures / minute / IP
    if (!rate.ok) {
      return NextResponse.json(
        { message: `Too many requests. Try again in ${rate.retryAfter}s.` },
        { status: 429 }
      );
    }

    let filename = "";
    try {
      const body = await req.json();
      filename = typeof body?.filename === "string" ? body.filename : "";
    } catch {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }

    if (!filename || filename.length > 255) {
      return NextResponse.json({ message: "Invalid filename." }, { status: 400 });
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    let resourceType: "image" | "video" | "raw" = "raw";
    if (imageExtensions.has(ext)) resourceType = "image";
    else if (videoAudioExtensions.has(ext)) resourceType = "video";

    const lastDot = filename.lastIndexOf(".");
    const base = lastDot !== -1 ? filename.slice(0, lastDot) : filename;
    const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "file";
    const publicId = `${Date.now()}-${sanitized}`;

    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      folder: UPLOAD_FOLDER,
      public_id: publicId,
      timestamp,
    };
    const signature = cloudinary.utils.api_sign_request(
      params,
      process.env.CLOUDINARY_API_SECRET as string
    );

    return NextResponse.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      ...params,
      publicId,
      signature,
    });
  } catch (error) {
    console.error("Sign Error:", error);
    return NextResponse.json({ message: "Could not prepare upload." }, { status: 500 });
  }
}
