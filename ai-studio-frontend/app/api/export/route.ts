import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "../../../lib/apiBase";

// Export API that bridges the Next.js app to the Flask backend.
// Uses your existing Flask routes:
//  - POST /api/export-audio  (video_url -> MP3)
//  - POST /api/export-frame  (video_url -> JPEG)
// and returns a downloadUrl the frontend can use.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      exportType,
      audioFormat,
      imageFormat,
      // bitrate,
      // jpegQuality,
      // pngScale,
      // destination,
      sourceUrl,
    } = body ?? {};

    if (!sourceUrl) {
      return NextResponse.json(
        { ok: false, message: "Missing sourceUrl (video to export)." },
        { status: 400 },
      );
    }

    if (!exportType || !["video", "audio", "image"].includes(exportType)) {
      return NextResponse.json(
        { ok: false, message: "Invalid or missing exportType." },
        { status: 400 },
      );
    }

    // VIDEO: we can just return the original URL so the browser downloads/shares it.
    if (exportType === "video") {
      return NextResponse.json({
        ok: true,
        downloadUrl: sourceUrl,
        message: "Video export ready.",
      });
    }

    // AUDIO: use Flask /api/export-audio (currently always MP3)
    if (exportType === "audio") {
      if (audioFormat && audioFormat !== "mp3") {
        return NextResponse.json(
          { ok: false, message: "Right now only MP3 audio export is supported." },
          { status: 400 },
        );
      }

      const res = await fetch(`${API_BASE}/api/export-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_url: sourceUrl }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.url) {
        return NextResponse.json(
          { ok: false, message: data?.error || "Audio export failed." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        downloadUrl: data.url,
        message: "Audio export ready.",
      });
    }

    // IMAGE: use Flask /api/export-frame (currently outputs JPEG)
    if (exportType === "image") {
      if (imageFormat && imageFormat !== "jpeg") {
        // We only support JPEG via the current backend; PNG options are ignored for now.
        // Still proceed, but warn in the message.
      }

      const res = await fetch(`${API_BASE}/api/export-frame`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_url: sourceUrl }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.url) {
        return NextResponse.json(
          { ok: false, message: data?.error || "Image export failed." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        downloadUrl: data.url,
        message: "Image export ready.",
      });
    }

    // Fallback (should not hit)
    return NextResponse.json(
      { ok: false, message: "Unsupported export type." },
      { status: 400 },
    );
  } catch (err) {
    console.error("/api/export error", err);
    return NextResponse.json(
      { ok: false, message: "Unexpected error handling export request." },
      { status: 500 },
    );
  }
}
