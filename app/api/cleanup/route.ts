import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { deleteAssets, deleteFromCloudinary, listFolderAssets } from "@/lib/cloudinary";
import { MAX_CLIP_AGE_MS } from "@/lib/limits";

/** Uploads younger than this may still be on their way into a clip. */
const ORPHAN_MIN_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Delete Cloudinary assets that no clip references — uploads abandoned
 * mid-create, or made with a signature that was never used for a clip.
 */
async function sweepOrphans(): Promise<{ removed: number; error?: string }> {
  try {
    const referenced = new Set<string>(await Clip.distinct("files.key"));
    const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
    const orphans = (await listFolderAssets()).filter(
      (a) => !referenced.has(a.publicId) && a.createdAt.getTime() < cutoff
    );
    for (const type of ["image", "video", "raw"] as const) {
      const ids = orphans.filter((o) => o.resourceType === type).map((o) => o.publicId);
      if (ids.length) await deleteAssets(ids, type);
    }
    return { removed: orphans.length };
  } catch (err) {
    console.error("Orphan sweep failed:", err);
    return { removed: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function dropLegacyTtlIndex() {
  // Older deployments have a TTL index on expiresAt that orphans Cloudinary
  // files (the doc vanishes before the cron can clean up the assets). Drop it
  // once so the cron becomes the single cleanup path.
  try {
    const conn = await dbConnect();
    const clips = conn.connection.collection("clips");
    const indexes = await clips.indexes();
    for (const index of indexes) {
      if (index.expireAfterSeconds !== undefined && index.name && index.name !== "_id_") {
        await clips.dropIndex(index.name);
        console.log(`Dropped legacy TTL index: ${index.name}`);
      }
    }
  } catch (err) {
    console.warn("Failed to drop legacy TTL index:", err);
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; cleanup is disabled" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  await dropLegacyTtlIndex();

  const now = new Date();
  const maxAge = new Date(now.getTime() - MAX_CLIP_AGE_MS);

  const expiredClips = await Clip.find({
    $or: [
      { expiresAt: { $lt: now } },
      { createdAt: { $lt: maxAge } },
    ],
  }).lean();

  let deletedDocs = 0;
  let deletedFiles = 0;
  const errors: string[] = [];

  for (const clip of expiredClips) {
    // Delete files from Cloudinary
    const filesToDelete = clip.files?.filter((f: { key?: string }) => f.key) ?? [];
    for (const f of filesToDelete) {
      if (!f.key) continue;
      try {
        await deleteFromCloudinary(f.key, f.resourceType || "raw");
        deletedFiles++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Failed to delete file ${f.key} for clip ${clip.code}: ${message}`);
      }
    }

    // Delete the document from MongoDB
    try {
      await Clip.deleteOne({ _id: clip._id });
      deletedDocs++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Failed to delete clip ${clip.code}: ${message}`);
    }
  }

  // Runs after expired clips are gone so their keys no longer count as referenced.
  const orphans = await sweepOrphans();
  if (orphans.error) errors.push(`Orphan sweep: ${orphans.error}`);

  return NextResponse.json({
    message: "Cleanup completed",
    deleted: deletedDocs,
    filesRemoved: deletedFiles,
    orphansRemoved: orphans.removed,
    ...(errors.length > 0 && { errors }),
  });
}