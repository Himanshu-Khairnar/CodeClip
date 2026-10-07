import { NextResponse } from "next/server";
import { cloudinary, UPLOAD_FOLDER } from "@/lib/cloudinary";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { MAX_FILE_SIZE } from "@/lib/limits";
import { buildPublicId, getResourceType } from "@/lib/file-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Returns signed params for ONE direct browser → Cloudinary upload.
 * The file bytes never touch our Vercel function, so the ~4.5MB
 * serverless body limit doesn't apply.
 *
 * The server picks the public_id + resource_type (decided by file
 * extension) and signs exactly { folder, public_id, timestamp } —
 * the client must echo those same values back to Cloudinary.
 *
 * Uploads that are never attached to a clip are removed by the cleanup
 * cron's orphan sweep, so a leaked signature can't park files forever.
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    // One clip holds at most 20 files; a few clips a minute is plenty.
    const rate = await checkRateLimit(`sign:${ip}`, 60, 10 * 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    let filename = "";
    let size: unknown = undefined;
    try {
      const body = await req.json();
      filename = typeof body?.filename === "string" ? body.filename : "";
      size = body?.size;
    } catch {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }

    if (!filename || filename.length > 255) {
      return NextResponse.json({ message: "Invalid filename." }, { status: 400 });
    }

    if (typeof size === "number" && size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: `Each file must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.` },
        { status: 400 }
      );
    }

    const resourceType = getResourceType(filename);
    // Raw assets (PDFs, archives, docs…) must keep the extension in the
    // public_id so the delivery URL has a format; media assets must not.
    const publicId = buildPublicId(filename, Date.now(), resourceType);

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
