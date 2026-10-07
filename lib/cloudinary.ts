import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export const UPLOAD_FOLDER = "online-clipboard";

/** Delivery URL prefix for *our* cloud — anything else is rejected. */
export function ownDeliveryPrefix(): string {
  return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME || ""}/`;
}

export function isOwnCloudinaryUrl(url: string): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      parsed.pathname.startsWith(`/${cloudName}/`)
    );
  } catch {
    return false;
  }
}

export function uploadToCloudinary(
  buffer: Buffer,
  options: object
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) reject(error || new Error("Cloudinary upload failed"));
      else resolve(result);
    });
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: string = "raw"
): Promise<void> {
  const type = (resourceType as "image" | "video" | "raw") || "raw";
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: type,
      invalidate: true,
    });
  } catch (error) {
    console.error(`Failed to delete asset ${publicId} with resource_type ${type}:`, error);
    // Attempt fallback with raw if original attempt was image/video or vice versa
    if (type !== "raw") {
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: "raw",
          invalidate: true,
        });
      } catch {
        // ignore secondary error
      }
    }
  }
}

export interface FolderAsset {
  publicId: string;
  resourceType: "image" | "video" | "raw";
  createdAt: Date;
}

/** Every asset in the upload folder, across all resource types. */
export async function listFolderAssets(): Promise<FolderAsset[]> {
  const out: FolderAsset[] = [];
  for (const resourceType of ["image", "video", "raw"] as const) {
    let cursor: string | undefined;
    do {
      const page = await cloudinary.api.resources({
        type: "upload",
        prefix: `${UPLOAD_FOLDER}/`,
        resource_type: resourceType,
        max_results: 500,
        next_cursor: cursor,
      });
      for (const r of page.resources as { public_id: string; created_at: string }[]) {
        out.push({ publicId: r.public_id, resourceType, createdAt: new Date(r.created_at) });
      }
      cursor = page.next_cursor;
    } while (cursor);
  }
  return out;
}

/** Bulk delete (Cloudinary caps a single call at 100 ids). */
export async function deleteAssets(publicIds: string[], resourceType: "image" | "video" | "raw") {
  for (let i = 0; i < publicIds.length; i += 100) {
    await cloudinary.api.delete_resources(publicIds.slice(i, i + 100), {
      resource_type: resourceType,
      invalidate: true,
    });
  }
}
