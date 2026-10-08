import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicId,
  getFileExtension,
  getResourceType,
  isPdf,
  isPreviewable,
  isTextPreview,
  summarizeFiles,
  thumbnailUrl,
} from "./file-types.ts";

// Every emoji-free representative of the file families the app claims to
// support. Used to assert the full extension -> resource_type mapping.
const IMAGE_FILES = ["photo.jpg", "photo.JPEG", "logo.png", "anim.gif", "pic.webp", "favicon.ico", "scan.bmp"];
const VIDEO_FILES = ["clip.mp4", "clip.webm", "clip.mov", "clip.avi", "clip.mkv"];
const AUDIO_FILES = ["song.mp3", "song.wav", "song.ogg", "song.m4a", "song.flac", "song.aac"];
const RAW_FILES = [
  "document.pdf", "notes.txt", "readme.md", "data.csv", "payload.json",
  "server.log", "app.js", "types.ts", "script.py", "index.html", "style.css",
  "feed.xml", "config.yaml", "config.yml", "archive.zip", "backup.tar.gz",
  "report.docx", "sheet.xlsx", "slides.pptx", "vector.svg",
];

describe("getFileExtension", () => {
  test("lowercases the extension", () => {
    assert.equal(getFileExtension("PHOTO.JPG"), "jpg");
  });

  test("returns empty for a name without a dot", () => {
    assert.equal(getFileExtension("README"), "");
  });

  test("treats dotfiles as having no extension", () => {
    assert.equal(getFileExtension(".env"), "");
  });

  test("only uses the final segment for multi-dot names", () => {
    assert.equal(getFileExtension("backup.tar.gz"), "gz");
  });

  test("strips path separators", () => {
    assert.equal(getFileExtension("folder/sub/report.pdf"), "pdf");
  });

  test("returns empty for empty / trailing-dot input", () => {
    assert.equal(getFileExtension(""), "");
    assert.equal(getFileExtension("file."), "");
  });
});

describe("getResourceType", () => {
  for (const file of IMAGE_FILES) {
    test(`${file} -> image`, () => assert.equal(getResourceType(file), "image"));
  }
  for (const file of VIDEO_FILES) {
    test(`${file} -> video`, () => assert.equal(getResourceType(file), "video"));
  }
  for (const file of AUDIO_FILES) {
    test(`${file} -> video (Cloudinary audio asset type)`, () => assert.equal(getResourceType(file), "video"));
  }
  for (const file of RAW_FILES) {
    test(`${file} -> raw`, () => assert.equal(getResourceType(file), "raw"));
  }

  test("pdf is raw (not image) in this app's strategy", () => {
    assert.equal(getResourceType("document.pdf"), "raw");
  });

  test("unknown binary -> raw", () => {
    assert.equal(getResourceType("installer.exe"), "raw");
  });
});

describe("buildPublicId", () => {
  const NOW = 1_700_000_000_000;

  test("raw assets KEEP the extension (Cloudinary requirement)", () => {
    assert.equal(buildPublicId("document.pdf", NOW), `${NOW}-document.pdf`);
    assert.equal(buildPublicId("archive.zip", NOW), `${NOW}-archive.zip`);
  });

  test("media assets DROP the extension (avoid name.jpg.jpg)", () => {
    assert.equal(buildPublicId("photo.jpg", NOW), `${NOW}-photo`);
    assert.equal(buildPublicId("clip.mp4", NOW), `${NOW}-clip`);
  });

  test("respects an explicit resource_type override", () => {
    // A raw fallback for a file we'd normally call an image must gain the ext.
    assert.equal(buildPublicId("photo.jpg", NOW, "raw"), `${NOW}-photo.jpg`);
    // Force a raw-looking file to media and the extension disappears.
    assert.equal(buildPublicId("document.pdf", NOW, "image"), `${NOW}-document`);
  });

  test("sanitizes unsafe characters and spaces", () => {
    assert.equal(buildPublicId("my report (final).pdf", NOW), `${NOW}-my_report__final_.pdf`);
  });

  test("strips directory prefixes, keeping only the basename", () => {
    assert.equal(buildPublicId("folder/sub/report.pdf", NOW), `${NOW}-report.pdf`);
  });

  test("lowercases the extension for raw assets", () => {
    assert.equal(buildPublicId("DOCUMENT.PDF", NOW), `${NOW}-DOCUMENT.pdf`);
  });

  test("handles files with no extension", () => {
    assert.equal(buildPublicId("README", NOW), `${NOW}-README`);
  });

  test("truncates the base to 100 characters", () => {
    const id = buildPublicId(`${"a".repeat(250)}.pdf`, NOW);
    assert.equal(id, `${NOW}-${"a".repeat(100)}.pdf`);
  });

  test("replaces unsafe-only base characters with underscores", () => {
    assert.equal(buildPublicId("???.pdf", NOW), `${NOW}-___.pdf`);
  });

  test("falls back to 'file' for an empty name", () => {
    assert.equal(buildPublicId("", NOW), `${NOW}-file`);
  });
});

describe("viewer preview predicates", () => {
  test("isPdf matches case-insensitively", () => {
    assert.equal(isPdf("report.pdf"), true);
    assert.equal(isPdf("report.PDF"), true);
    assert.equal(isPdf("report.docx"), false);
  });

  test("previewable extensions render inline", () => {
    for (const f of ["a.png", "a.mp4", "a.mp3", "a.pdf", "a.txt", "a.md", "a.json", "a.yaml"]) {
      assert.equal(isPreviewable(f), true, `${f} should preview`);
    }
  });

  test("resource_type flips previewability for media", () => {
    assert.equal(isPreviewable("mystery", "image"), true);
    assert.equal(isPreviewable("mystery", "video"), true);
    assert.equal(isPreviewable("mystery"), false);
  });

  test("unknown binary is not previewable", () => {
    assert.equal(isPreviewable("installer.exe"), false);
  });

  test("isTextPreview only matches text-ish files", () => {
    for (const f of ["a.txt", "a.md", "a.json", "a.js", "a.ts", "a.py", "a.yaml"]) {
      assert.equal(isTextPreview(f), true, `${f} should be text-previewed`);
    }
    assert.equal(isTextPreview("a.pdf"), false);
    assert.equal(isTextPreview("a.png"), false);
  });
});

describe("summarizeFiles", () => {
  test("groups by kind in a fixed order with plurals", () => {
    assert.equal(
      summarizeFiles(["b.pdf", "a.png", "c.jpg", "song.mp3", "x.zip", "y.docx", "clip.mp4"]),
      "2 images, 1 video, 1 audio file, 1 PDF, 2 files"
    );
  });

  test("handles singles and empty lists", () => {
    assert.equal(summarizeFiles(["notes.txt"]), "1 file");
    assert.equal(summarizeFiles([]), "");
  });
});

describe("thumbnailUrl", () => {
  test("injects a crop transform into image delivery URLs", () => {
    assert.equal(
      thumbnailUrl("https://res.cloudinary.com/demo/image/upload/v1/online-clipboard/a.jpg", 80),
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_80,h_80,q_auto,f_auto/v1/online-clipboard/a.jpg"
    );
  });

  test("ignores non-image assets", () => {
    assert.equal(thumbnailUrl("https://res.cloudinary.com/demo/raw/upload/v1/online-clipboard/a.pdf"), undefined);
  });
});
