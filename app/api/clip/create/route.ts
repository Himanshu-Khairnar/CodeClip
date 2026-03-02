import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { encryptText } from "@/lib/encryption";
import fs from "fs/promises";
import path from "path";

// Allow larger body sizes for file uploads in Next.js
export const maxDuration = 60; // 1 minute timeout

export async function POST(req: Request) {
  try {
    await dbConnect();

    const formData = await req.formData();
    const text = formData.get("text") as string || "";
    const password = formData.get("password") as string || "";
    const isOneTimeView = formData.get("isOneTimeView") === "true";
    
    // Support multiple files under "files" key
    const files: File[] = formData.getAll("files") as File[];
    
    // Check total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
      return NextResponse.json({ message: "Limit exceeded (max 20MB)" }, { status: 400 });
    }

    const savedFiles = [];
    if (files.length > 0) {
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      // Ensure the directory exists
      await fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

      for (const file of files) {
        if (!file.name || file.size === 0) continue;
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const filename = `${timestamp}-${safeName}`;
        const filepath = path.join(uploadDir, filename);
        
        await fs.writeFile(filepath, buffer);
        savedFiles.push({
          filename: file.name,
          path: `/uploads/${filename}`,
          size: file.size,
        });
      }
    }

    const code = uuidv4().slice(0, 6).toUpperCase();
    const encryptedText = encryptText(text);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

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
