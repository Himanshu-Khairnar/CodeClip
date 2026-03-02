import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { decryptText } from "@/lib/encryption";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    await dbConnect();
    const { code } = await params;

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ message: "Password is required" }, { status: 400 });
    }

    const clip = await Clip.findOne({ code: code.toUpperCase() });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    if (clip.password !== password) {
      return NextResponse.json({ message: "Incorrect password" }, { status: 401 });
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
      await Clip.deleteOne({ _id: clip._id });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Verify Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
