import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText, generateOwnerToken, hashCode, hashPassword, hashToken } from "@/lib/encryption";
import { deleteFromCloudinary, ownDeliveryPrefix, uploadToCloudinary, UPLOAD_FOLDER } from "@/lib/cloudinary";
import { generateCode } from "@/lib/codes";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import {
  DEFAULT_EXPIRY_MINUTES,
  EXPIRY_OPTIONS,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PASSWORD_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TOTAL_SIZE,
} from "@/lib/limits";
import { buildPublicId, getResourceType } from "@/lib/file-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_EXPIRY_MINUTES = new Set<number>(EXPIRY_OPTIONS.map((o) => o.minutes));
const VALID_RESOURCE_TYPES = new Set(["image", "video", "raw"]);

interface SavedFile {
  filename: string;
  path: string;
  size: number;
  key: string;
  resourceType: string;
}

interface ClipOptions {
  expiryMinutes: number;
  password: string;
  burnAfterRead: boolean;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

/** Accepts `expiryMinutes`, or the legacy `expiry` (hours) field. */
function parseOptions(get: (name: string) => unknown): ClipOptions | string {
  const minutes = Number(get("expiryMinutes"));
  const legacyHours = Number(get("expiry"));
  const expiryMinutes = VALID_EXPIRY_MINUTES.has(minutes)
    ? minutes
    : VALID_EXPIRY_MINUTES.has(legacyHours * 60)
      ? legacyHours * 60
      : DEFAULT_EXPIRY_MINUTES;

  const rawPassword = get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (password.length > MAX_PASSWORD_LENGTH) return `Password is too long (max ${MAX_PASSWORD_LENGTH} characters).`;

  const burn = get("burnAfterRead");
  return { expiryMinutes, password, burnAfterRead: burn === true || burn === "true" };
}

/**
 * Validates a file entry that was uploaded directly from the browser
 * to Cloudinary (via /api/clip/sign). The delivery URL must belong to
 * our own Cloudinary cloud and the public_id must live in our upload
 * folder and match that URL, so callers can't attach arbitrary URLs or
 * claim (and later delete) another clip's asset.
 */
function validatePreUploadedFile(f: unknown): SavedFile | null {
  if (!f || typeof f !== "object") return null;
  const { filename, path, size, key, resourceType } = f as Record<string, unknown>;
  if (
    typeof filename !== "string" || !filename || filename.length > 255 ||
    typeof path !== "string" || !path.startsWith(ownDeliveryPrefix()) ||
    typeof size !== "number" || !Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE ||
    typeof key !== "string" || !key.startsWith(`${UPLOAD_FOLDER}/`) || key.includes("..") ||
    typeof resourceType !== "string" || !VALID_RESOURCE_TYPES.has(resourceType)
  ) {
    return null;
  }
  // Delivery URLs look like …/<type>/upload/v123/<public_id>[.<ext>]
  const afterUpload = path.split(`/${resourceType}/upload/`)[1];
  if (!afterUpload) return null;
  const idInUrl = decodeURIComponent(afterUpload.replace(/^v\d+\//, ""));
  if (idInUrl !== key && !idInUrl.startsWith(`${key}.`)) return null;

  const cleanName = filename.split("/").pop()?.split("\\").pop() || "file";
  return { filename: cleanName, path, size: Math.floor(size), key, resourceType };
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = await checkRateLimit(`create:${ip}`, 20, 60_000); // 20 creations / minute / IP
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    await dbConnect();

    // --- Path A: JSON with files already uploaded directly to Cloudinary
    // from the browser (via /api/clip/sign). Bytes never pass through
    // the Vercel function, so the ~4.5MB serverless body limit is avoided.
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return bad("Invalid request body.");
      const text = typeof body.text === "string" ? body.text : "";
      const options = parseOptions((name) => body[name]);
      if (typeof options === "string") return bad(options);

      if (text.length > MAX_TEXT_LENGTH) return bad(`Text content is too large (max ${MAX_TEXT_LENGTH / 1000}KB)`);
      const rawFiles: unknown[] = Array.isArray(body.files) ? body.files : [];
      if (!text.trim() && rawFiles.length === 0) return bad("Please add some text or files to upload.");
      if (rawFiles.length > MAX_FILES) return bad(`Too many files (max ${MAX_FILES})`);

      const savedFiles: SavedFile[] = [];
      for (const f of rawFiles) {
        const claimedSize = (f as Record<string, unknown>)?.size;
        if (typeof claimedSize === "number" && claimedSize > MAX_FILE_SIZE) {
          return bad(`Each file must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
        }
        const valid = validatePreUploadedFile(f);
        if (!valid) return bad("Invalid file data.");
        savedFiles.push(valid);
      }

      const keys = savedFiles.map((f) => f.key);
      if (new Set(keys).size !== keys.length) return bad("Invalid file data.");
      if (keys.length > 0 && (await Clip.exists({ "files.key": { $in: keys } }))) {
        return bad("Invalid file data.");
      }

      const totalSize = savedFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) return bad(`Limit exceeded (max ${MAX_TOTAL_SIZE / (1024 * 1024)}MB)`);

      return NextResponse.json(await saveClip(text, savedFiles, totalSize, options), { status: 201 });
    }

    // --- Path B: legacy multipart upload (small files, proxied through us)
    const formData = await req.formData();
    const text = (formData.get("text") as string) || "";
    const options = parseOptions((name) => formData.get(name));
    if (typeof options === "string") return bad(options);

    if (text.length > MAX_TEXT_LENGTH) return bad(`Text content is too large (max ${MAX_TEXT_LENGTH / 1000}KB)`);

    const files = (formData.getAll("files") as File[]).filter((f) => f.name && f.size > 0);
    if (!text.trim() && files.length === 0) return bad("Please add some text or files to upload.");
    if (files.length > MAX_FILES) return bad(`Too many files (max ${MAX_FILES})`);

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) return bad(`Limit exceeded (max ${MAX_TOTAL_SIZE / (1024 * 1024)}MB)`);
    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      return bad(`"${oversized.name}" exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB per-file limit.`);
    }

    const savedFiles: SavedFile[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const resourceType = getResourceType(file.name);
      // Raw assets (PDFs, archives, docs…) must keep the extension in the
      // public_id so the delivery URL has a format; media assets must not.
      const publicId = buildPublicId(file.name, Date.now(), resourceType);

      let result;
      try {
        result = await uploadToCloudinary(buffer, {
          resource_type: resourceType,
          folder: UPLOAD_FOLDER,
          public_id: publicId,
        });
      } catch (uploadErr) {
        console.warn(`Upload with resource_type ${resourceType} failed, trying raw fallback:`, uploadErr);
        result = await uploadToCloudinary(buffer, {
          resource_type: "raw",
          folder: UPLOAD_FOLDER,
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

    return NextResponse.json(await saveClip(text, savedFiles, totalSize, options), { status: 201 });
  } catch (error: unknown) {
    console.error("Upload Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

async function saveClip(text: string, files: SavedFile[], totalSize: number, options: ClipOptions) {
  const code = await generateUniqueCode();
  const ownerToken = generateOwnerToken();
  const expiresAt = new Date(Date.now() + options.expiryMinutes * 60 * 1000);

  await Clip.create({
    code: hashCode(code),
    text: encryptText(text),
    files,
    totalSize,
    expiresAt,
    ownerTokenHash: hashToken(ownerToken),
    passwordHash: options.password ? hashPassword(options.password) : undefined,
    burnAfterRead: options.burnAfterRead,
  });

  return { code, ownerToken, expiresAt };
}

/**
 * Only 9,000 four-digit codes exist, so a code still held by an expired
 * clip the cron hasn't swept yet is reclaimed (its files deleted) rather
 * than counted as taken.
 */
async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = generateCode();
    const codeHash = hashCode(code);
    const existing = await Clip.findOne({ code: codeHash }, { expiresAt: 1 }).lean<{ expiresAt: Date }>();
    if (!existing) return code;
    if (new Date(existing.expiresAt) < new Date()) {
      const stale = await Clip.findOneAndDelete({ code: codeHash, expiresAt: { $lt: new Date() } });
      for (const f of stale?.files ?? []) {
        if (f.key) await deleteFromCloudinary(f.key, f.resourceType || "raw");
      }
      return code;
    }
  }
  throw new Error("All clip codes are busy right now. Please try again in a moment.");
}
