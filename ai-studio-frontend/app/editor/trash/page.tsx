"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

type AssetType = "video" | "image" | "audio";

type MediaAsset = {
  id: string;
  userId: number;
  type: AssetType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  publicUrl: string;
  status: "active" | "trashed" | "deleted";
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  deletedAt: string | null;
};

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5.5 6h13L18 19.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5L5.5 6Z" />
    </svg>
  );
}

export default function TrashPage() {
  const router = useRouter();
  // Base URL for the Flask backend. Match the editor page behavior so
  // both screens talk to the same API and fall back to the Sailor AI
  // production API if NEXT_PUBLIC_API_BASE is not set or is an empty string.
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://sailorai.app";

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrashedVideos() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/assets?type=video&includeTrash=true`, {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setError(data?.error || "Failed to load trash.");
          setAssets([]);
          return;
        }
        const files: MediaAsset[] = Array.isArray(data.files) ? data.files : [];
        setAssets(files.filter((a) => a.status === "trashed" && a.type === "video"));
      } catch (err) {
        console.error(err);
        setError("Failed to load trash.");
        setAssets([]);
      } finally {
        setLoading(false);
      }
    }

    void loadTrashedVideos();
  }, [API_BASE]);

  async function handleRestoreAsset(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/assets/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Could not restore video.");
        return;
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
      setError("Could not restore video.");
    }
  }

  async function handleDeleteAsset(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/assets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Could not delete video.");
        return;
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
      setError("Could not delete video.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col text-white bg-gradient-to-b from-black via-slate-950 to-black">
      {/* HEADER */}
      <header className="border-b border-white/10 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-1">Studio</div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Trash</h1>
          <p className="mt-1 text-[12px] md:text-sm text-white/60 max-w-xl">
            These are videos you&apos;ve deleted. You can restore them or permanently remove them.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] relative">
          <button
            type="button"
            onClick={() => router.push("/editor")}
            className="glow-focus px-3 py-1.5 rounded-full border border-white/20 text-white/80 bg-black/40 hover:bg-black/60 text-xs"
          >
            ← Back to Editor
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 px-4 py-6 flex flex-col items-start gap-6">
        <div className="w-full lg:flex-1 flex flex-col items-center">
          <div className="w-full max-w-5xl space-y-4 text-[13px] md:text-sm text-white/70">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrashIcon className="h-4 w-4 text-red-300" />
                <span className="uppercase tracking-[0.18em] text-white/60">Trash</span>
                <span className="text-[11px] text-white/50">
                  {assets.length} video{assets.length === 1 ? "" : "s"}
                </span>
              </div>
              <span className="text-[11px] text-white/40">Items auto-delete after 30 days</span>
            </div>

            {error && <div className="text-[11px] text-red-400">{error}</div>}

            {loading ? (
              <div className="text-[12px] text-white/50">Loading trash…</div>
            ) : assets.length === 0 ? (
              <div className="text-[11px] text-white/40 border border-dashed border-white/15 rounded-xl px-3 py-6 text-center">
                No videos in trash.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-xl border border-white/15 bg-black/70 overflow-hidden flex flex-col"
                  >
                    <div className="relative w-full aspect-video bg-black">
                      <video
                        src={asset.publicUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        onMouseEnter={(e) => {
                          try {
                            (e.currentTarget as HTMLVideoElement).play();
                          } catch {
                            // ignore autoplay errors
                          }
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLVideoElement;
                          el.pause();
                          el.currentTime = 0;
                        }}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-white/70">{asset.originalName}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void handleRestoreAsset(asset.id)}
                          className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/30"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAsset(asset.id)}
                          className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-200 hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
