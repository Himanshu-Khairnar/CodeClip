import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { Readable } from "stream";
import { ZipFile } from "yazl";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { hashCode } from "@/lib/encryption";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PASSWORD_PEPPER = process.env.ENCRYPTION_KEY || "";

function hashPassword(password: string, salt: string): string {
  return createHash("sha256")
    .update(password + salt + PASSWORD_PEPPER)
    .digest("hex");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, 30, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { message: `Too many requests. Try again in ${rate.retryAfter}s.` },
        { status: 429 }
      );
    }

    await dbConnect();
    const { code } = await params;

    const clip = await Clip.findOne({ code: hashCode(code) });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    if (new Date() > new Date(clip.expiresAt)) {
      return NextResponse.json({ message: "Clip has expired" }, { status: 410 });
    }

    if (clip.passwordHash && clip.salt) {
      const provided = req.headers.get("x-clip-password") || "";
      if (hashPassword(provided, clip.salt) !== clip.passwordHash) {
        return NextResponse.json({ message: "This clip is password protected" }, { status: 401 });
      }
    }

    if (!clip.files || clip.files.length === 0) {
      return NextResponse.json({ message: "This clip has no files" }, { status: 400 });
    }

    const zip = new ZipFile();
    let added = 0;

    for (const file of clip.files) {
      try {
        const res = await fetch(file.path);
        if (!res.ok || !res.body) {
          continue;
        }
        const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
        zip.addReadStream(nodeStream, file.filename);
        added++;
      } catch {
        // skip unreadable files
      }
    }

    if (added === 0) {
      return NextResponse.json({ message: "No files could be bundled" }, { status: 502 });
    }

    zip.end();

    const webStream = Readable.toWeb(zip.outputStream as unknown as Readable) as unknown as ReadableStream;

    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      `attachment; filename="clip-${code}.zip"; filename*=UTF-8''clip-${encodeURIComponent(code)}.zip`
    );
    headers.set("Cache-Control", "no-store");

    return new Response(webStream, { status: 200, headers });
  } catch (error: unknown) {
    console.error("Zip Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}