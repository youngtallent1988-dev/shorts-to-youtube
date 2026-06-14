import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "../../../lib/apiBase";

// Base URL for the Flask backend. Match the editor page behavior so that
// both client-side and route handlers talk to the same server when
// NEXT_PUBLIC_API_BASE / NEXT_PUBLIC_API_URL are not explicitly configured.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const videoUrls: string[] = body?.videoUrls ?? [];

    if (!Array.isArray(videoUrls) || videoUrls.length === 0) {
      return NextResponse.json(
        { ok: false, message: "videoUrls (non-empty array) is required" },
        { status: 400 },
      );
    }

    const res = await fetch(`${API_BASE}/api/export-timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_urls: videoUrls }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.url) {
      return NextResponse.json(
        { ok: false, message: data?.error || "Timeline export failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      downloadUrl: data.url,
      message: "Timeline export ready.",
    });
  } catch (err) {
    console.error("/api/export-timeline error", err);
    return NextResponse.json(
      { ok: false, message: "Unexpected error handling timeline export." },
      { status: 500 },
    );
  }
}
