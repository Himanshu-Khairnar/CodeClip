import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText } from "@/lib/encryption";
import { utapi } from "@/lib/uploadthing";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await dbConnect();

    const formData = await req.formData();
    const text = (formData.get("text") as string) || "";
    const password = (formData.get("password") as string) || "";
    const isOneTimeView = formData.get("isOneTimeView") === "true";

    const files: File[] = formData.getAll("files") as File[];

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
      return NextResponse.json({ message: "Limit exceeded (max 20MB)" }, { status: 400 });
    }

    const savedFiles: { filename: string; path: string; size: number; key: string }[] = [];

    const filesToUpload = files.filter((f) => f.name && f.size > 0);
    if (filesToUpload.length > 0) {
      const uploadResults = await utapi.uploadFiles(filesToUpload);

      for (let i = 0; i < filesToUpload.length; i++) {
        const result = uploadResults[i];
        if (result.data) {
          savedFiles.push({
            filename: filesToUpload[i].name,
            path: result.data.ufsUrl,
            size: filesToUpload[i].size,
            key: result.data.key,
          });
        }
      }
    }

    const code = uuidv4().slice(0, 6).toUpperCase();
    const encryptedText = encryptText(text);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const clip = await Clip.create({
      code,
      text: encryptedText,
      files: savedFiles,
      totalSize,
      password,
      isOneTimeView,
      expiresAt,
    });

    return NextResponse.json({ code: clip.code }, { status: 201 });
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
