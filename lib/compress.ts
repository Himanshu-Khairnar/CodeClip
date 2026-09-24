/**
 * Client-side image compression.
 *
 * Files upload straight from the browser to Cloudinary, so Vercel's
 * body limit doesn't apply. The only hard ceiling is Cloudinary's
 * per-file size cap (10MB for images on the free plan), so we leave
 * anything that already fits untouched and only re-encode oversized
 * images down to the cap.
 *
 * Runs entirely in the browser — never import this from server code.
 */

import { CLOUDINARY_MAX_IMAGE_SIZE } from "@/lib/limits";

const COMPRESSIBLE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "bmp"]);

/** Leave a little headroom below Cloudinary's exact cap. */
const COMPRESS_LIMIT = CLOUDINARY_MAX_IMAGE_SIZE - 512 * 1024;

/** Images that already fit upload as-is — no needless quality loss. */
export const COMPRESS_SKIP_UNDER = COMPRESS_LIMIT;

/** Target size for images that must be shrunk to fit the cap. */
export const COMPRESS_TARGET = COMPRESS_LIMIT;

export function isCompressibleImage(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return COMPRESSIBLE_EXTS.has(ext);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

/**
 * Downscale + re-encode an image. Tries progressively smaller
 * dimensions/qualities and returns the smallest result.
 * Never throws — returns the original file if anything fails,
 * or if compression wouldn't actually save bytes.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    if (file.size <= COMPRESS_SKIP_UNDER) return file;
    if (!isCompressibleImage(file.name)) return file;
    if (typeof createImageBitmap === "undefined") return file;

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    // WebP preserves transparency (PNG) at much smaller sizes;
    // JPEG for photos/BMP. GIF is excluded (would kill animation).
    const outMime = ext === "png" || ext === "webp" ? "image/webp" : "image/jpeg";
    const outExt = outMime === "image/webp" ? "webp" : "jpg";

    const bitmap = await createImageBitmap(file);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) {
      bitmap.close();
      return file;
    }

    const maxDims = [1920, 1280, 1024];
    const qualities = [0.82, 0.72, 0.62, 0.5];

    let best: Blob | null = null;

    outer: for (const maxDim of maxDims) {
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(bitmap, 0, 0, w, h);

      for (const q of qualities) {
        const blob = await canvasToBlob(canvas, outMime, q);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= COMPRESS_TARGET) break outer;
      }
      // No point trying smaller dims if we're already near the original size
      if (best && best.size <= file.size * 0.6 && best.size <= COMPRESS_TARGET) break;
    }

    bitmap.close();

    if (!best || best.size >= file.size) return file;

    const dot = file.name.lastIndexOf(".");
    const base = (dot !== -1 ? file.name.slice(0, dot) : file.name).replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    return new File([best], `${base}.${outExt}`, {
      type: outMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
