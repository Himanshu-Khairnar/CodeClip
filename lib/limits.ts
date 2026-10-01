/** App-level cap on the combined size of all files in a single clip. */
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

/** Images larger than this are compressed before upload (Cloudinary per-file cap). */
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
