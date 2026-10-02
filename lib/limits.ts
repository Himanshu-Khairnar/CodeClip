/** App-level cap on the combined size of all files in a single clip. */
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

/** Per-file cap — matches Cloudinary's free-plan ceiling (10MB for image/raw). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Images larger than this are compressed before upload (Cloudinary per-file cap). */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
