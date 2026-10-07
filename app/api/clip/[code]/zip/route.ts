import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { ZipFile } from "yazl";
import dbConnect from "@/lib/db";
import Clip from "@/models/Clip";
import { hashCode } from "@/lib/encryption";
import { authorizeRead } from "@/lib/clip-auth";
import { isValidCodeFormat } from "@/lib/codes";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = getClientIp(req);
    const rate = await checkRateLimit(`zip:${ip}`, 10, 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter);

    const { code } = await params;
    if (!isValidCodeFormat(code)) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }
    await dbConnect();

    const clip = await Clip.findOne({ code: hashCode(code) });

    if (!clip) {
      return NextResponse.json({ message: "Clip not found" }, { status: 404 });
    }

    // Burned clips stay zippable during the short grace window after the first view.
    const auth = await authorizeRead(req, clip, { allowBurnGrace: true });
    if (auth instanceof Response) return auth;

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