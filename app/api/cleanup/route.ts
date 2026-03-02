import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";

export async function GET(req: NextRequest) {
  // Validate cron secret to prevent unauthorized calls
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  // Find all documents created more than 2 minutes ago
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  const expiredClips = await Clip.find({
    createdAt: { $lt: twoMinutesAgo },
  }).lean();

  if (expiredClips.length === 0) {
    return NextResponse.json({
      message: "No expired clips found",
      deleted: 0,
    });
  }

  let deletedDocs = 0;
  let deletedFiles = 0;
  const errors: string[] = [];

  for (const clip of expiredClips) {
    // Delete each physical file associated with this clip
    for (const file of clip.files ?? []) {
      try {
        const filePath = path.join(process.cwd(), "public", file.path);
        await fs.unlink(filePath);
        deletedFiles++;
      } catch (err: any) {
        // File may already be gone — log but don't abort
        if (err.code !== "ENOENT") {
          errors.push(`Failed to delete file ${file.path}: ${err.message}`);
        }
      }
    }

    // Delete the document from MongoDB
    try {
      await Clip.deleteOne({ _id: clip._id });
      deletedDocs++;
    } catch (err: any) {
      errors.push(`Failed to delete clip ${clip.code}: ${err.message}`);
    }
  }

  return NextResponse.json({
    message: "Cleanup completed",
    deleted: deletedDocs,
    filesRemoved: deletedFiles,
    ...(errors.length > 0 && { errors }),
  });
}
