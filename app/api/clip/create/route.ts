import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText } from "@/lib/encryption";
import { uploadToCloudinary } from "@/lib/cloudinary";

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
    if (totalSize > 30 * 1024 * 1024) {
      return NextResponse.json({ message: "Limit exceeded (max 30MB)" }, { status: 400 });
    }

    const savedFiles: { filename: string; path: string; size: number; key: string; resourceType: string }[] = [];

    const filesToUpload = files.filter((f) => f.name && f.size > 0);
    for (const file of filesToUpload) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const result = await uploadToCloudinary(buffer, {
        resource_type: "auto",
        folder: "online-clipboard",
        public_id: `${Date.now()}-${file.name.replace(/\.[^/.]+$/, "")}`,
        use_filename: false,
      });

      savedFiles.push({
        filename: file.name,
        path: result.secure_url,
        size: file.size,
        key: result.public_id,
        resourceType: result.resource_type,
      });
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
