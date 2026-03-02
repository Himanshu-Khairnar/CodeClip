import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { decryptText } from "@/lib/encryption";
import fs from "fs/promises";
import path from "path";

export async function GET(req: Request, { params }: { params: { code: string } }) {
  try {
    await dbConnect();
    const { code } = await params;

    const clip = await Clip.findOne({ code: code.toUpperCase() });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    if (new Date() > new Date(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    // If it's password protected, don't return text/files yet
    if (clip.password) {
      return NextResponse.json({
        code: clip.code,
        isPasswordProtected: true,
        isOneTimeView: clip.isOneTimeView,
        createdAt: clip.createdAt,
      });
    }

    // Decrypt text
    const text = decryptText(clip.text || "");

    const responseData = {
      code: clip.code,
      text,
      files: clip.files,
      isOneTimeView: clip.isOneTimeView,
      createdAt: clip.createdAt,
    };

    // Auto delete if one time view
    if (clip.isOneTimeView) {
      // Physical file deletion
      if (clip.files && clip.files.length > 0) {
        for (const file of clip.files) {
          try {
            const filepath = path.join(process.cwd(), "public", file.path);
            await fs.unlink(filepath);
          } catch (err) {
            console.error(`Failed to delete file ${file.path}:`, err);
          }
        }
      }
      await Clip.deleteOne({ _id: clip._id });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Access Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { code: string } }) {
  try {
    await dbConnect();
    const { code } = await params;

    const clip = await Clip.findOneAndDelete({ code: code.toUpperCase() });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    // Physical file deletion
    if (clip.files && clip.files.length > 0) {
      for (const file of clip.files) {
        try {
          const filepath = path.join(process.cwd(), "public", file.path);
          await fs.unlink(filepath);
        } catch (err) {
           console.error(`Failed to delete file ${file.path}:`, err);
        }
      }
    }

    return NextResponse.json({ message: "Clip deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
