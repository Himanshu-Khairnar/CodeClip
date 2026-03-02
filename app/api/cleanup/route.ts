import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { deleteFromCloudinary } from "@/lib/cloudinary";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  const expiredClips = await Clip.find({
    createdAt: { $lt: twoMinutesAgo },
  }).lean();

  if (expiredClips.length === 0) {
    return NextResponse.json({ message: "No expired clips found", deleted: 0 });
  }

  let deletedDocs = 0;
  let deletedFiles = 0;
  const errors: string[] = [];

  for (const clip of expiredClips) {
    // Delete files from Cloudinary
    const filesToDelete = clip.files?.filter((f: any) => f.key) ?? [];
    for (const f of filesToDelete) {
      try {
        await deleteFromCloudinary(f.key, f.resourceType || "raw");
        deletedFiles++;
      } catch (err: any) {
        errors.push(`Failed to delete file ${f.key} for clip ${clip.code}: ${err.message}`);
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
