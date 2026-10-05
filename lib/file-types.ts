/**
 * Canonical file-type rules for the whole app.
 *
 * Keeping this in one dependency-free module means the upload signer, the
 * server fallback uploader, and the clip viewer can never disagree about how a
 * filename maps to a Cloudinary resource type or to a public_id.
 */

export type CloudinaryResourceType = "image" | "video" | "raw";

/** Uploaded as Cloudinary `image` assets (Cloudinary appends the format). */
export const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "ico", "bmp",
]);

/** Uploaded as Cloudinary `video` assets — audio uses the video asset type. */
export const VIDEO_AUDIO_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "ogg", "m4a", "flac", "aac",
]);

/** Extensions the clip viewer can render inline. */
export const PREVIEW_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg",
  "mp4", "webm", "mp3", "wav", "ogg", "m4a", "flac",
  "pdf",
  "txt", "md", "csv", "json", "log", "js", "ts", "py", "html", "css", "xml", "yaml", "yml",
]);

/** Extensions rendered as plain text in the viewer. */
export const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "log", "js", "ts", "jsx", "tsx", "py", "html", "css", "xml", "yaml", "yml",
]);

/** Lowercased, sanitized extension without the dot, or "" when absent. */
export function getFileExtension(filename: string): string {
  if (!filename) return "";
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getResourceType(filename: string): CloudinaryResourceType {
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_AUDIO_EXTENSIONS.has(ext)) return "video";
  return "raw";
}

export function isPdf(filename: string): boolean {
  return getFileExtension(filename) === "pdf";
}

export function isPreviewable(filename: string, resourceType?: string): boolean {
  return (
    PREVIEW_EXTENSIONS.has(getFileExtension(filename)) ||
    resourceType === "image" ||
    resourceType === "video"
  );
}

export function isTextPreview(filename: string): boolean {
  return TEXT_PREVIEW_EXTENSIONS.has(getFileExtension(filename));
}

/**
 * Cloudinary requires the file extension to be part of the public_id for
 * `raw` assets **only**. Media public_ids must *not* include it, otherwise the
 * delivered URL doubles up (e.g. `name.jpg.jpg`).
 *
 * Without the extension a raw delivery URL loses its format, so browsers
 * download an untyped file (and PDFs won't render) instead of serving it with
 * the right Content-Type.
 */
export function buildPublicId(
  filename: string,
  now: number = Date.now(),
  resourceType: CloudinaryResourceType = getResourceType(filename)
): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const baseName = base.split(/[/\\]/).pop() || base;
  const sanitized = baseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "file";
  const id = `${now}-${sanitized}`;
  const ext = getFileExtension(filename);
  return resourceType === "raw" && ext ? `${id}.${ext}` : id;
}
