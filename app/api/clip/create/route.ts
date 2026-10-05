import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText, hashCode } from "@/lib/encryption";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { generateCode } from "@/lib/codes";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { MAX_TOTAL_SIZE, MAX_FILE_SIZE } from "@/lib/limits";
import { buildPublicId, getResourceType } from "@/lib/file-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEXT_LENGTH = 500_000; // ~500KB
const MAX_FILES = 20;
const VALID_EXPIRY_HOURS = new Set([1, 24]);
const VALID_RESOURCE_TYPES = new Set(["image", "video", "raw"]);

interface PreUploadedFile {
  filename: string;
  path: string;
  size: number;
  key: string;
  resourceType: string;
}

/**
 * Validates a file entry that was uploaded directly from the browser
 * to Cloudinary (via /api/clip/sign). The delivery URL must belong to
 * our own Cloudinary cloud so callers can't attach arbitrary URLs.
 */
function validatePreUploadedFile(
  f: unknown,
  cloudName: string
): PreUploadedFile | null {
  if (!f || typeof f !== "object") return null;
  const { filename, path, size, key, resourceType } = f as Record<string, unknown>;
  if (
    typeof filename !== "string" || !filename || filename.length > 255 ||
    typeof path !== "string" ||
    !path.startsWith(`https://res.cloudinary.com/${cloudName}/`) ||
    typeof size !== "number" || !Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE ||
    typeof key !== "string" || !key ||
    typeof resourceType !== "string" || !VALID_RESOURCE_TYPES.has(resourceType)
  ) {
    return null;
  }
  const cleanName = filename.split("/").pop()?.split("\\").pop() || "file";
  return { filename: cleanName, path, size: Math.floor(size), key, resourceType };
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

    // --- Path A: JSON with files already uploaded directly to Cloudinary
    // from the browser (via /api/clip/sign). Bytes never pass through
    // the Vercel function, so the ~4.5MB serverless body limit is avoided.
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const text = typeof body?.text === "string" ? body.text : "";
      const rawExpiry = body?.expiry;
      const expiryHours = VALID_EXPIRY_HOURS.has(Number(rawExpiry))
        ? Number(rawExpiry)
        : 24;

      if (text.length > MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { message: `Text content is too large (max ${MAX_TEXT_LENGTH / 1000}KB)` },
          { status: 400 }
        );
      }
      if (!text.trim() && (!Array.isArray(body?.files) || body.files.length === 0)) {
        return NextResponse.json(
          { message: "Please add some text or files to upload." },
          { status: 400 }
        );
      }

      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
      const rawFiles = Array.isArray(body?.files) ? body.files : [];
      if (rawFiles.length > MAX_FILES) {
        return NextResponse.json(
          { message: `Too many files (max ${MAX_FILES})` },
          { status: 400 }
        );
      }
      const savedFiles: PreUploadedFile[] = [];
      for (const f of rawFiles) {
        const claimedSize = (f as Record<string, unknown>)?.size;
        if (typeof claimedSize === "number" && claimedSize > MAX_FILE_SIZE) {
          return NextResponse.json(
            { message: `Each file must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.` },
            { status: 400 }
          );
        }
        const valid = validatePreUploadedFile(f, cloudName);
        if (!valid) {
          return NextResponse.json({ message: "Invalid file data." }, { status: 400 });
        }
        savedFiles.push(valid);
      }

      const totalSize = savedFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        return NextResponse.json(
          { message: `Limit exceeded (max ${MAX_TOTAL_SIZE / (1024 * 1024)}MB)` },
          { status: 400 }
        );
      }

      const code = await generateUniqueCode();
      const encryptedText = encryptText(text);
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      await Clip.create({
        code: hashCode(code),
        text: encryptedText,
        files: savedFiles,
        totalSize,
        expiresAt,
      });

      return NextResponse.json({ code }, { status: 201 });
    }

    // --- Path B: legacy multipart upload (small files, proxied through us)
    const formData = await req.formData();
    const text = (formData.get("text") as string) || "";
    const rawExpiry = formData.get("expiry") as string;
    const expiryHours = VALID_EXPIRY_HOURS.has(Number(rawExpiry))
      ? Number(rawExpiry)
      : 24;

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { message: `Text content is too large (max ${MAX_TEXT_LENGTH / 1000}KB)` },
        { status: 400 }
      );
    }

    const files: File[] = formData.getAll("files") as File[];

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { message: `Limit exceeded (max ${MAX_TOTAL_SIZE / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }
    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      return NextResponse.json(
        { message: `"${oversized.name}" exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB per-file limit.` },
        { status: 400 }
      );
    }

    const savedFiles: { filename: string; path: string; size: number; key: string; resourceType: string }[] = [];

    const filesToUpload = files.filter((f) => f.name && f.size > 0);
    for (const file of filesToUpload) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const resourceType = getResourceType(file.name);
      // Raw assets (PDFs, archives, docs…) must keep the extension in the
      // public_id so the delivery URL has a format; media assets must not.
      const publicId = buildPublicId(file.name, Date.now(), resourceType);

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
          public_id: buildPublicId(file.name, Date.now(), "raw"),
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
    const code = await generateUniqueCode();

    const encryptedText = encryptText(text);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    await Clip.create({
      code: hashCode(code),
      text: encryptedText,
      files: savedFiles,
      totalSize,
      expiresAt,
    });

    return NextResponse.json({ code }, { status: 201 });
  } catch (error: unknown) {
    console.error("Upload Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

async function generateUniqueCode(): Promise<string> {
  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    const exists = await Clip.exists({ code: hashCode(code) });
    if (!exists) break;
  }
  return code;
}