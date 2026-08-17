import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText, hashCode } from "@/lib/encryption";
import { uploadToCloudinary } from "@/lib/cloudinary";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await dbConnect();

    const formData = await req.formData();
    const text = (formData.get("text") as string) || "";
    const isOneTimeView = formData.get("isOneTimeView") === "true";

    const files: File[] = formData.getAll("files") as File[];

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 30 * 1024 * 1024) {
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

    const code = uuidv4().slice(0, 6).toUpperCase();
    const encryptedText = encryptText(text);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await Clip.create({
      code: hashCode(code),
      text: encryptedText,
      files: savedFiles,
      totalSize,
      isOneTimeView,
      expiresAt,
    });

    return NextResponse.json({ code }, { status: 201 });
  } catch (error: unknown) {
    console.error("Upload Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
