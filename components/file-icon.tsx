import {
  File,
  FileArchive,
  FileCode,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
} from "lucide-react";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "flac", "aac"]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]);
const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "html", "css", "json", "py", "java", "cpp", "c",
  "cs", "php", "rb", "go", "rs", "sh", "sql", "xml", "yaml", "yml",
]);
const DOC_EXTS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md",
]);

interface FileIconProps {
  filename: string;
  resourceType?: string;
  className?: string;
}

/**
 * Single canonical file-type icon — previously copy-pasted in
 * `app/page.tsx` and `app/clip/[code]/page.tsx` with drifting extension lists.
 */
export function FileIcon({ filename, resourceType, className = "w-4 h-4 text-primary shrink-0" }: FileIconProps) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTS.has(ext) || resourceType === "image") {
    return <ImageIcon className={className} />;
  }
  if (VIDEO_EXTS.has(ext) || resourceType === "video") {
    return <Video className={className} />;
  }
  if (AUDIO_EXTS.has(ext)) {
    return <Music className={className} />;
  }
  if (ARCHIVE_EXTS.has(ext)) {
    return <FileArchive className={className} />;
  }
  if (CODE_EXTS.has(ext)) {
    return <FileCode className={className} />;
  }
  if (DOC_EXTS.has(ext)) {
    return <FileText className={className} />;
  }
  return <File className={className.replace("text-primary", "text-muted-foreground")} />;
}
