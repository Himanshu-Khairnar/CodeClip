/** App-level cap on the combined size of all files in a single clip. */
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

/** Per-file cap — matches Cloudinary's free-plan ceiling (10MB for image/raw). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Images larger than this are compressed before upload (Cloudinary per-file cap). */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export const MAX_FILES = 20;
export const MAX_TEXT_LENGTH = 500_000;
export const MAX_PASSWORD_LENGTH = 128;

/** Allowed clip lifetimes, in minutes. */
export const EXPIRY_OPTIONS = [
  { minutes: 10, label: "10 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "7 days" },
] as const;
export const DEFAULT_EXPIRY_MINUTES = 1440;

/** Hard ceiling enforced by the cleanup cron regardless of expiresAt. */
export const MAX_CLIP_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** How long a burn-after-read clip's files stay downloadable after the first view. */
export const BURN_GRACE_MS = 10 * 60 * 1000;
