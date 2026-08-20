import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { deleteFromCloudinary } from "@/lib/cloudinary";

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

  const expiredClips = await Clip.find({
    expiresAt: { $lt: now },
  }).lean();

  if (expiredClips.length === 0) {
    return NextResponse.json({ message: "No expired clips found", deleted: 0 });
  }

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

  return NextResponse.json({
    message: "Cleanup completed",
    deleted: deletedDocs,
    filesRemoved: deletedFiles,
    ...(errors.length > 0 && { errors }),
  });
}