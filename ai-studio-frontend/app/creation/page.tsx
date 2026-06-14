"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { motion, useReducedMotion, type Variants, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, Sparkles, Wand2, Film, Star, Image as ImageIcon } from "lucide-react";

type Mode = "video" | "image" | "miniapp" | "saved";
type ViewMode = "grid" | "list";

type GalleryItem = {
  id: number;
  title: string;
  type: "video" | "image";
  model: string;
  createdAt: number;
  source: "created" | "uploaded";
  thumb: string;
  videoUrl?: string;
  prompt?: string;
};

const galleryItems: GalleryItem[] = [
  {
    id: 1,
    title: "Cinematic racing intro",
    type: "video",
    model: "Cinematic XL",
    createdAt: Date.now() - 2 * 60 * 60 * 1000,
    source: "created",
    thumb:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "Lo-fi night study loop",
    type: "video",
    model: "Lo-fi Vibes",
    createdAt: Date.now() - 6 * 60 * 60 * 1000,
    source: "uploaded",
    thumb:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: 3,
    title: "Anime city skyline shot",
    type: "image",
    model: "Anime Fusion",
    createdAt: Date.now() - 24 * 60 * 60 * 1000,
    source: "created",
    thumb:
      "https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: 4,
    title: "Fantasy realm establishing shot",
    type: "video",
    model: "Fantasy Pro",
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    source: "created",
    thumb:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: 5,
    title: "Product hero spin",
    type: "video",
    model: "Product Studio",
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    source: "uploaded",
    thumb:
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: 6,
    title: "Cyberpunk alley still",
    type: "image",
    model: "Cinematic XL",
    createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
    source: "created",
    thumb:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200&auto=format&fit=crop",
  },
];

const generationTabs = ["Image", "Video", "Template", "Transition", "Extend", "Modify"] as const;

type GenerationTab = (typeof generationTabs)[number];

type GenerationStage =
  | "idle"
  | "initializing"
  | "generating"
  | "rendering"
  | "finalizing"
  | "completed"
  | "error";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://sailorai.app";

function getTimeAgoLabel(createdAt: number): string {
  const diffMs = Date.now() - createdAt;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diffSec < 90) return "Just now";
  if (diffSec < hour) return `${Math.floor(diffSec / minute)}m ago`;
  if (diffSec < day) return `${Math.floor(diffSec / hour)}h ago`;
  if (diffSec < 2 * day) return "Yesterday";
  if (diffSec < week) return `${Math.floor(diffSec / day)}d ago`;
  if (diffSec < 2 * week) return "Last week";
  if (diffSec < month) return `${Math.floor(diffSec / week)}w ago`;
  return `${Math.floor(diffSec / month)}mo ago`;
}

function isNew(createdAt: number): boolean {
  // Treat anything created in the last 10 minutes as "New" for timeline emphasis.
  const tenMinutesMs = 10 * 60 * 1000;
  return Date.now() - createdAt < tenMinutesMs;
}

function normalizeErrorMessage(message: string | null | undefined): string {
  if (!message) return "Video generation failed. Please try again.";
  if (message.includes("Not enough credits")) {
    return "You don't have enough credits to generate this video.";
  }
  if (message.toLowerCase().includes("timeout")) {
    return "The video model took too long to respond. Try again in a moment.";
  }
  return message;
}

function VideoHoverPreview({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      className={className}
      onMouseEnter={() => {
        const v = videoRef.current;
        if (v) {
          v.currentTime = 0;
          void v.play();
        }
      }}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
    />
  );
}

export default function CreationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

  const [mode, setMode] = useState<Mode>("video");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeGenTab, setActiveGenTab] = useState<GenerationTab>("Video");
  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);

  const [resolution, setResolution] = useState("1080p");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState("10s");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [multiShot, setMultiShot] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [quality, setQuality] = useState<"standard" | "high" | "max">("high");
  const [lockReference, setLockReference] = useState(true);
  const [model, setModel] = useState<"MiniMax" | "Kling" | "Veo 3 Lite" | "Runway">("MiniMax");
  // Separate UI selection key so we can show more "brand" models while preserving
  // the existing backend model mapping and generation logic.
  const [modelKey, setModelKey] = useState<string>("MiniMax");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const [user, setUser] = useState<{
    id: number;
    email: string;
    credits: number;
    plan?: string | null;
    subscription_status?: string | null;
    unlimited_generations?: boolean;
    stripe_customer_id?: string | null;
  } | null>(null);

  const [timeFilter, setTimeFilter] = useState<"all" | "7d" | "30d">("all");
  const [createdScope, setCreatedScope] = useState<"created" | "uploaded">("created");
  const [modelFilter, setModelFilter] = useState<
    | "all"
    | "MiniMax"
    | "Kling"
    | "Veo 3 Lite"
    | "Runway"
  >("all");
  const [groupBy, setGroupBy] = useState<"time" | "model">("time");
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [activeVideoView, setActiveVideoView] = useState<"preview" | "edit">("preview");
  const [editTitle, setEditTitle] = useState<string>("");

  const [items, setItems] = useState<GalleryItem[]>(galleryItems);
  const [generationStage, setGenerationStage] = useState<GenerationStage>("idle");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [lastGeneratedItem, setLastGeneratedItem] = useState<GalleryItem | null>(null);

  // Treat Pro and Studio plans (and unlimited) as "pro" for duration gating.
  const hasProPlan = !!user && (user.plan === "pro" || user.plan === "studio" || user.unlimited_generations);

  const nav = [
    { label: "Home", href: "/" },
    { label: "Video Editor", href: "/creation" },
    { label: "Posted", href: "/posted" },
    { label: "Subscribe", href: "/pricing" },
    { label: "Mini Apps", href: "/mini-apps" },
    { label: "Agent", href: "/agent" },
  ];

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  async function refreshMe() {
    try {
      const r = await fetch(`${API_BASE}/me`, {
        method: "GET",
        credentials: "include",
      });
      const data = await r.json();
      setUser(data?.user ?? null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("creationPromptFromEditor");
      if (stored) {
        const trimmed = stored.trim();
        if (!trimmed) {
          window.localStorage.removeItem("creationPromptFromEditor");
          return;
        }
        setPrompt(trimmed);
        setActiveGenTab("Video");
        window.localStorage.removeItem("creationPromptFromEditor");
        // Auto-start generation using the current resolution/aspect/duration/model
        // but with the preset prompt text.
        void handleCreate(trimmed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function handleReferenceChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setReferenceName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReferencePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function clearReference() {
    setReferencePreview(null);
    setReferenceName(null);
  }

  async function handleCreate() {
    if (!prompt.trim()) {
      setPromptError("Describe what you want to generate.");
      setCreateStatus(null);
      return;
    }

    setCreateStatus(null);
    setPromptError(null);
    setCreating(true);
    setGenerationStage("initializing");
    setGenerationProgress(4);
    setGeneratedVideoUrl(null);
    setGeneratedPrompt(null);
    setLastGeneratedItem(null);

    try {
      // Special path for Runway veo3.1 text-to-video using Next.js API route
      if (model === "Veo 3.1") {
        const ratio = aspect === "16:9" ? "1280:720" : aspect === "9:16" ? "720:1280" : "1024:1024";
        const runwayResponse = await fetch("/api/runway/text-to-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            promptText: prompt,
            ratio,
            duration: duration === "5s" ? 5 : duration === "10s" ? 10 : 20,
          }),
        });

        const runwayData = await runwayResponse.json();

        if (!runwayResponse.ok) {
          setGenerationStage("error");
          const rawMessage = (runwayData && (runwayData as any).error) || "Runway veo3.1 generation failed.";
          setCreateStatus(normalizeErrorMessage(rawMessage));
          return;
        }

        // Heuristic to extract a video URL from the Runway task output
        const task = (runwayData as any).task;
        let videoUrl: string | null = null;
        const output = task?.output;

        if (typeof output === "string") {
          videoUrl = output;
        } else if (Array.isArray(output) && output.length > 0) {
          const first = output[0];
          if (typeof first === "string") {
            videoUrl = first;
          } else if (first && typeof first === "object") {
            videoUrl = (first as any).uri || (first as any).url || null;
          }
        } else if (output && typeof output === "object") {
          videoUrl =
            (output as any).video ||
            (output as any).videoUrl ||
            (output as any).uri ||
            (output as any).url ||
            null;
        }

        if (!videoUrl) {
          setGenerationStage("error");
          setCreateStatus("Runway veo3.1 succeeded but no video URL was returned.");
          return;
        }

        const newItem: GalleryItem = {
          id: Date.now(),
          title: prompt || "Cinematic AI video (Veo 3.1)",
          type: "video",
          model,
          createdAt: Date.now(),
          source: "created",
          thumb: videoUrl,
          videoUrl,
          prompt,
        };

        setItems((prev) => [newItem, ...prev]);
        setGeneratedVideoUrl(videoUrl);
        setLastGeneratedItem(newItem);
        setGenerationStage("completed");
        setGenerationProgress(100);
        setCreateStatus("Veo 3.1 cinematic video ready in My Videos.");
        return;
      }

      // Default path: existing Minimax / Replicate flow via Flask API
      const payload: Record<string, unknown> = {
        prompt,
        resolution,
        aspect,
        duration,
        mode: activeGenTab.toLowerCase(),
        model,
        generate_audio: audioEnabled,
        motion_enabled: motionEnabled,
        speech_enabled: speechEnabled,
        quality,
        lock_reference: lockReference,
      };

      if (referencePreview) {
        payload.image_url = referencePreview;
      }

      const response = await fetch(`${API_BASE}/api/generate-video`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data?.jobId) {
        setGenerationStage("error");
        const rawMessage = (data && (data as any).error) || "Video generation failed.";
        setCreateStatus(normalizeErrorMessage(rawMessage));
        setCreating(false);
        return;
      }

      const { jobId } = data as { jobId: string };
      setGeneratedPrompt(prompt);

      let done = false;

      while (!done) {
        try {
          const statusResponse = await fetch(`${API_BASE}/api/video-status/${jobId}`, {
            method: "GET",
            credentials: "include",
          });
          const statusData = await statusResponse.json();

          if (!statusResponse.ok || statusData?.error) {
            setGenerationStage("error");
            const rawMessage = statusData?.error || "Video generation failed.";
            setCreateStatus(normalizeErrorMessage(rawMessage));
            break;
          }

          const status = statusData.status as string | null | undefined;
          const videoUrl = statusData.videoUrl as string | null | undefined;

          if (status === "starting") {
            setGenerationStage((prev) =>
              prev === "initializing" ? "generating" : prev,
            );
            setGenerationProgress((prev) => {
              const base = prev < 15 ? 15 : prev;
              return Math.min(base + 8, 55);
            });
          } else if (status === "processing") {
            // While the model is processing, gradually advance progress toward 99%
            // so it doesn't appear stuck at ~90% for long-running jobs.
            setGenerationStage("rendering");
            setGenerationProgress((prev) => {
              const current = prev < 55 ? 55 : prev;
              const next = current + 3; // small step per poll
              return Math.min(next, 99);
            });
          } else if (status === "succeeded") {
            if (videoUrl) {
              setGenerationStage("finalizing");
              setGenerationProgress(95);

              const newItem: GalleryItem = {
                id: Date.now(),
                title: prompt || "Cinematic AI video",
                type: "video",
                model,
                createdAt: Date.now(),
                source: "created",
                thumb: videoUrl,
                videoUrl,
                prompt,
              };

              setItems((prev) => [newItem, ...prev]);
              setGeneratedVideoUrl(videoUrl);
              setLastGeneratedItem(newItem);
              setGenerationStage("completed");
              setGenerationProgress(100);
              setCreateStatus("Cinematic video ready in My Videos.");
            } else {
              setGenerationStage("error");
              setCreateStatus("Generation succeeded but no video URL was returned.");
            }
            done = true;
            break;
          } else if (status === "failed" || status === "canceled") {
            setGenerationStage("error");
            setCreateStatus(
              status === "failed"
                ? "Video generation failed. Please try again."
                : "Video generation was canceled.",
            );
            done = true;
            break;
          }

          // Avoid a tight loop; poll every 2.5 seconds while rendering
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } catch (statusErr) {
          // eslint-disable-next-line no-console
          console.error(statusErr);
          setGenerationStage("error");
          setCreateStatus("Error while checking generation status.");
          break;
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setGenerationStage("error");
      setCreateStatus("Could not start video generation. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (selectedItem) {
      setEditTitle(selectedItem.title || "");
      setActiveVideoView("preview");
    }
  }, [selectedItem]);

  const filteredItems = items.filter((item) => {
    if (mode === "video" && item.type !== "video") return false;
    if (mode === "image" && item.type !== "image") return false;

    if (createdScope === "created" && item.source !== "created") return false;
    if (createdScope === "uploaded" && item.source !== "uploaded") return false;

    if (modelFilter !== "all" && item.model !== modelFilter) return false;

    if (timeFilter !== "all") {
      const ageMs = Date.now() - item.createdAt;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (timeFilter === "7d" && ageDays > 7) return false;
      if (timeFilter === "30d" && ageDays > 30) return false;
    }

    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (groupBy === "model") {
      return a.model.localeCompare(b.model);
    }
    return b.createdAt - a.createdAt;
  });

  function selectModelFromGalleryItem(item: GalleryItem): { backend: "MiniMax" | "Kling" | "Veo 3 Lite" | "Runway"; key: string } {
    const name = item.model.toLowerCase();

    if (name.includes("fantasy") || name.includes("kling")) {
      return { backend: "Kling", key: "Kling-3.0" };
    }

    if (name.includes("product") || name.includes("studio")) {
      return { backend: "Runway", key: "Runway" };
    }

    if (name.includes("veo")) {
      return { backend: "Veo 3 Lite", key: "Veo-3.1-Lite" };
    }

    // Default to MiniMax for cinematic / generic clips
    return { backend: "MiniMax", key: "MiniMax" };
  }

  return (
    <div className="min-h-screen text-white flex cinematic-bg">
      {/* LEFT SIDEBAR (now provided globally by StudioChrome) */}
      <motion.aside
        initial={false}
        animate={false}
        className="hidden"
      >
        <div>
          <div className="p-6 flex items-center justify-center">
            <div className="h-20 w-20 rounded-3xl border border-white/20 bg-gradient-to-br from-sky-500 via-black to-purple-700 flex items-center justify-center text-5xl">
              ⛵
            </div>
          </div>

          <nav className="px-3 space-y-2">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <motion.button
                  key={item.label}
                  whileHover={
                    shouldReduceMotion
                      ? undefined
                      : {
                          x: 2,
                        }
                  }
                  whileTap={
                    shouldReduceMotion
                      ? undefined
                      : {
                          scale: 0.985,
                        }
                  }
                  onClick={() => router.push(item.href)}
                  className={`glow-focus w-full text-left px-4 py-3.5 rounded-2xl text-sm font-medium transition ${
                    active
                      ? "bg-gradient-to-r from-cyan-200 via-white to-pink-200 text-black shadow-[0_18px_70px_rgba(255,255,255,0.12)]"
                      : "glow-pill text-white/80"
                  }`}
                >
                  {item.label}
                </motion.button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 text-xs text-white/60">
          <div className="rounded-3xl bg-black/50 border border-white/10 p-4">
            <div className="font-semibold mb-1">Cinematic creation</div>
            <div>
              Design multi-shot AI generations with motion, templates, and references from one
              place.
            </div>
          </div>
        </div>
      </motion.aside>

      {/* MAIN COLUMN */}
      <main className="flex-1 flex flex-col relative">

        {/* TOP FILTER BAR */}
        <div className="border-b border-white/10 glass-panel/20 px-6 md:px-8 py-2 flex flex-wrap items-center gap-2 md:gap-3">
          {/* Mode tabs */}
          <div className="flex items-center gap-2 bg-black/30 rounded-2xl px-1 py-1 border border-white/10 text-xs">
            {[
              { id: "video" as Mode, label: "Video" },
              { id: "image" as Mode, label: "Image" },
              { id: "miniapp" as Mode, label: "MiniApp" },
              { id: "saved" as Mode, label: "Saved" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`glow-focus px-3 md:px-4 py-1.5 rounded-2xl text-[11px] md:text-xs whitespace-nowrap ${
                  mode === item.id
                    ? "bg-white text-black font-semibold shadow-[0_14px_40px_rgba(255,255,255,0.12)]"
                    : "glow-pill text-white/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Time filter (All dropdown) */}
          <button
            type="button"
            onClick={() =>
              setTimeFilter((prev) => (prev === "all" ? "7d" : prev === "7d" ? "30d" : "all"))
            }
            className="glow-focus glow-pill px-3 py-1.5 rounded-2xl text-[11px] flex items-center gap-2 text-white/70 bg-black/40 border border-white/10"
          >
            <span>
              {timeFilter === "all"
                ? "All time"
                : timeFilter === "7d"
                  ? "Last 7 days"
                  : "Last 30 days"}
            </span>
            <span className="text-xs">▾</span>
          </button>

          {/* Created / Uploaded tabs */}
          <div className="flex items-center gap-1 bg-black/30 rounded-2xl px-1 py-1 border border-white/10 text-[11px]">
            <button
              type="button"
              onClick={() => setCreatedScope("created")}
              className={`glow-focus px-3 py-1 rounded-2xl ${
                createdScope === "created"
                  ? "bg-white text-black font-semibold"
                  : "glow-pill text-white/70"
              }`}
            >
              Created
            </button>
            <button
              type="button"
              onClick={() => setCreatedScope("uploaded")}
              className={`glow-focus px-3 py-1 rounded-2xl ${
                createdScope === "uploaded"
                  ? "bg-white text-black font-semibold"
                  : "glow-pill text-white/70"
              }`}
            >
              Uploaded
            </button>
          </div>

          {/* Model filter */}
          <button
            type="button"
            onClick={() =>
              setModelFilter((prev) => {
                if (prev === "all") return "MiniMax";
                if (prev === "MiniMax") return "Kling";
                if (prev === "Kling") return "Veo 3 Lite";
                if (prev === "Veo 3 Lite") return "Runway";
                if (prev === "Runway") return "all";
                return "all";
              })
            }
            className="glow-focus glow-pill px-3 py-1.5 rounded-2xl text-[11px] flex items-center gap-2 text-white/70"
          >
            <span>Model: {modelFilter === "all" ? "All" : modelFilter}</span>
            <span className="text-xs">▾</span>
          </button>

          <div className="ml-auto flex items-center gap-2 text-[11px] text-white/60">
            {/* Grid/List view */}
            <div className="flex items-center gap-1 bg-black/30 rounded-2xl px-1 py-1 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`glow-focus px-2.5 py-1 rounded-2xl ${
                  viewMode === "grid"
                    ? "bg-white text-black font-semibold"
                    : "glow-pill text-white/70"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`glow-focus px-2.5 py-1 rounded-2xl ${
                  viewMode === "list"
                    ? "bg-white text-black font-semibold"
                    : "glow-pill text-white/70"
                }`}
              >
                List
              </button>
            </div>

            {/* Group by dropdown */}
            <button
              type="button"
              onClick={() => setGroupBy((prev) => (prev === "time" ? "model" : "time"))}
              className="glow-focus glow-pill px-3 py-1.5 rounded-2xl flex items-center gap-2"
            >
              <span>Group by: {groupBy === "time" ? "Time" : "Model"}</span>
              <span className="text-xs">▾</span>
            </button>
          </div>
        </div>

        {/* CONTENT GRID */}
        <div className="px-6 md:px-8 py-3">
          <div className="max-w-6xl mx-auto space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-white/50">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-[0.18em] text-white/40">My Videos</span>
                <span className="h-px w-20 bg-gradient-to-r from-white/40 to-transparent" />
              </div>
              <div className="text-white/40">Most recent first</div>
            </div>

            {sortedItems.length === 0 ? (
              <div className="rounded-3xl glass-panel border border-dashed border-white/15 px-5 py-6 text-[12px] text-white/60 flex flex-col items-start gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Timeline empty
                </div>
                <div>
                  Your cinematic videos will appear here after you generate them. Start with
                  <span className="font-semibold text-white/80"> Step 1 </span>
                  below, then press <span className="font-semibold text-white/80">Generate</span>.
                </div>
                <div className="text-[11px] text-white/45">
                  If you changed filters above, try switching back to <span className="font-semibold">All time</span>
                  and <span className="font-semibold">Created</span>.
                </div>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {sortedItems.map((item) => (
                  <motion.div
                    key={item.id}
                    variants={cardVariants}
                    initial="hidden"
                    animate="show"
                    whileHover={
                      shouldReduceMotion
                        ? undefined
                        : {
                            y: -8,
                            scale: 1.02,
                          }
                    }
                    className="relative overflow-hidden rounded-3xl glass-panel border border-white/10 shadow-[0_26px_90px_rgba(0,0,0,0.7)] group"
                  >
                    {/* Timestamp label */}
                    <div className="absolute top-3 left-3 z-10 text-[11px] px-2 py-1 rounded-full bg-black/70 border border-white/15 text-white/80 flex items-center gap-1">
                      <span>{getTimeAgoLabel(item.createdAt)}</span>
                      {isNew(item.createdAt) && (
                        <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/60 text-[10px] leading-none">
                          New
                        </span>
                      )}
                    </div>

                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{
                        background:
                          "radial-gradient(600px circle at 15% 10%, rgba(34,211,238,0.26), transparent 55%), radial-gradient(600px circle at 85% 20%, rgba(236,72,153,0.24), transparent 55%)",
                      }}
                    />

                    {/* Thumbnail (much smaller so more fits on screen) */}
                    <div className="relative h-24 md:h-28 overflow-hidden">
                      {item.type === "video" && item.videoUrl ? (
                        <VideoHoverPreview
                          src={item.videoUrl}
                          className="w-full h-full object-cover transition duration-700 ease-out group-hover:scale-[1.06] group-hover:brightness-110"
                        />
                      ) : (
                        <img
                          src={item.thumb}
                          alt={item.title}
                          className="w-full h-full object-cover transition duration-700 ease-out group-hover:scale-[1.06] group-hover:brightness-110"
                        />
                      )}

                      {/* Dark gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

                      {/* Play / image badge */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-full bg-black/70 border border-white/20 text-white/85">
                          {item.type === "video" ? "Video" : "Image"}
                        </span>
                        <span className="px-2 py-1 rounded-full bg-black/60 border border-white/15 text-white/70">
                          {item.model}
                        </span>
                      </div>

                      {item.type === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-10 w-10 rounded-full bg-black/60 flex items-center justify-center border border-white/40 group-hover:scale-110 transition-transform">
                            <div className="ml-0.5 w-0 h-0 border-t-[7px] border-b-[7px] border-l-[11px] border-t-transparent border-b-transparent border-l-white" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold truncate max-w-[220px]">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-white/50 mt-1">
                          Studio • Cinematic layout
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/80 whitespace-nowrap"
                      >
                        Open
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {sortedItems.map((item) => (
                  <motion.div
                    key={item.id}
                    variants={cardVariants}
                    initial="hidden"
                    animate="show"
                    whileHover={
                      shouldReduceMotion
                        ? undefined
                        : {
                            y: -4,
                            scale: 1.01,
                          }
                    }
                    className="rounded-3xl glass-panel border border-white/10 px-4 py-3 flex items-center gap-4"
                  >
                    <div className="relative h-12 w-20 overflow-hidden rounded-2xl">
                      {item.type === "video" && item.videoUrl ? (
                        <VideoHoverPreview
                          src={item.videoUrl}
                          className="w-full h-full object-cover transition duration-500 ease-out hover:scale-[1.06] hover:brightness-110"
                        />
                      ) : (
                        <img
                          src={item.thumb}
                          alt={item.title}
                          className="w-full h-full object-cover transition duration-500 ease-out hover:scale-[1.06] hover:brightness-110"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{item.title}</div>
                          <div className="text-[11px] text-white/55 mt-1 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <span>{getTimeAgoLabel(item.createdAt)}</span>
                              {isNew(item.createdAt) && (
                                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/60 text-[9px] leading-none">
                                  New
                                </span>
                              )}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-white/40" />
                            <span>{item.model}</span>
                            <span className="h-1 w-1 rounded-full bg-white/40" />
                            <span>{item.type === "video" ? "Video" : "Image"}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/80 whitespace-nowrap"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM GENERATION PANEL (now sits below the grid instead of overlapping) */}
        <div className="w-[92%] max-w-6xl mx-auto mt-1.5 mb-4 rounded-[1.5rem] glass-panel p-4 md:p-5 shadow-[0_24px_100px_rgba(0,0,0,0.9)] border border-white/10 bg-black/70">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {generationTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveGenTab(tab)}
                className={`glow-focus px-3 md:px-4 py-1.5 rounded-2xl text-xs md:text-sm ${
                  activeGenTab === tab
                    ? "bg-white text-black font-semibold shadow-[0_18px_70px_rgba(255,255,255,0.14)]"
                    : "glow-pill text-white/75"
                }`}
              >
                {tab}
              </button>
            ))}

            <div className="ml-auto text-[11px] text-white/50 flex items-center gap-2">
              <span className="uppercase tracking-[0.18em] text-white/40">Mode</span>
              <span className="px-2 py-1 rounded-full bg-black/60 border border-white/15 text-white/75">
                {activeGenTab}
              </span>
            </div>
          </div>

          {/* Prompt + inline reference icon */}
          <div className="flex flex-col gap-3 md:gap-4">
            <div className="flex-1 min-w-0">
              <div className="mb-1 text-[11px] font-semibold text-white/55 uppercase tracking-[0.18em]">
                Step 1
                <span className="normal-case tracking-normal font-normal text-white/60 ml-1">
                  Describe your shot
                </span>
              </div>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (promptError) setPromptError(null);
                  }}
                  placeholder="Describe your cinematic AI video: subject, motion, camera moves, and mood..."
                  className={`glow-focus w-full h-24 md:h-28 bg-black/40 rounded-2xl pl-20 pr-4 md:pl-24 md:pr-5 py-4 md:py-5 outline-none resize-none text-sm md:text-base placeholder:text-white/35 border ${promptError ? "border-red-500/70 focus:border-red-400/80" : "border-white/15 focus:border-cyan-400/40"}`}
                />

                {/* PixVerse-style reference image card inside prompt box (left side) */}
                <input
                  id="creation-reference"
                  type="file"
                  accept="image/*"
                  onChange={handleReferenceChange}
                  className="hidden"
                />
                <label
                  htmlFor="creation-reference"
                  className="group cursor-pointer absolute left-3 top-1/2 -translate-y-1/2"
                >
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg border border-white/15 bg-black/70 flex items-center justify-center shadow-[0_10px_24px_rgba(0,0,0,0.8)] transition hover:border-cyan-400/80 hover:shadow-[0_0_20px_rgba(34,211,238,0.7)]">
                    {referencePreview ? (
                      <img
                        src={referencePreview}
                        alt={referenceName ?? "Reference"}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-white/70 group-hover:text-white" />
                    )}
                  </div>
                </label>
              </div>

              {promptError && (
                <div className="mt-1 text-[11px] text-red-400">
                  {promptError}
                </div>
              )}

              <div className="mt-1.5 text-[11px] text-white/50 flex items-center gap-2 flex-wrap">
                <span>
                  Tip: mention camera moves, pacing, transitions, and subject details for best
                  results.
                </span>
              </div>

              {referencePreview && (
                <div className="mt-1.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <img
                      src={referencePreview}
                      alt={referenceName ?? "Reference"}
                      className="h-8 w-8 rounded-lg object-cover border border-white/15"
                    />
                    <div className="text-[11px] text-white/60 max-w-[180px] truncate">
                      {referenceName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearReference}
                    className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/75"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM SETTINGS */}
          <div className="mt-4 md:mt-5 flex flex-col gap-3 md:gap-4">
            <div className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.18em]">
              Step 3
              <span className="normal-case tracking-normal font-normal text-white/60 ml-1">
                Fine-tune settings
              </span>
            </div>
            <div className="flex flex-wrap gap-3 items-center text-[11px]">
              {/* Resolution */}
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-[0.18em] text-white/40">Resolution</span>
                <div className="flex items-center gap-1 bg-black/40 rounded-2xl px-1 py-1 border border-white/10">
                  {["720p", "1080p", "4K"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`glow-focus px-3 py-1 rounded-2xl ${
                        resolution === r
                          ? "bg-white text-black font-semibold"
                          : "glow-pill text-white/70"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect ratio */}
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-[0.18em] text-white/40">Aspect</span>
                <div className="flex items-center gap-1 bg-black/40 rounded-2xl px-1 py-1 border border-white/10">
                  {["16:9", "9:16", "1:1"].map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAspect(a)}
                      className={`glow-focus px-3 py-1 rounded-2xl ${
                        aspect === a ? "bg-white text-black font-semibold" : "glow-pill text-white/70"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-[0.18em] text-white/40">Duration</span>
                  <div className="relative flex items-center gap-1 bg-gradient-to-r from-cyan-500/20 via-white/5 to-pink-500/20 rounded-2xl px-3 py-1.5 border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
                    <select
                      value={duration}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!hasProPlan && val !== "5s") {
                          setCreateStatus(
                            "Durations 6s and above require a Pro or Studio subscription.",
                          );
                          return;
                        }
                        setDuration(val);
                      }}
                      className="bg-transparent appearance-none text-[11px] md:text-xs text-white/90 outline-none pr-6"
                    >
                      {(["5s", "6s", "8s", "10s", "20s", "30s"] as const).map((d) => (
                        <option
                          key={d}
                          value={d}
                          className="bg-black text-white"
                        >
                          {d} {!hasProPlan && d !== "5s" ? "(Pro)" : ""}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/70">
                      ▾
                    </span>
                  </div>
                </div>
                {!hasProPlan && (
                  <div className="text-[10px] text-white/50 ml-[0.15rem]">
                    Durations 6s and above are part of Pro plans. Upgrade on the Pricing page to
                    unlock longer shots.
                  </div>
                )}
              </div>

              {/* Quality */}
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-[0.18em] text-white/40">Quality</span>
                <div className="flex items-center gap-1 bg-black/40 rounded-2xl px-1 py-1 border border-white/10">
                  {[
                    { id: "standard", label: "Standard" },
                    { id: "high", label: "High" },
                    { id: "max", label: "Ultra" },
                  ].map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setQuality(q.id as "standard" | "high" | "max")}
                      className={`glow-focus px-3 py-1 rounded-2xl ${
                        quality === q.id
                          ? "bg-white text-black font-semibold"
                          : "glow-pill text-white/70"
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <div className="flex flex-wrap items-center gap-3">
                {/* Audio toggle */}
                <button
                  type="button"
                  onClick={() => setAudioEnabled((v) => !v)}
                  className={`glow-focus px-3 py-1.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                    audioEnabled
                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                      : "border-white/15 bg-black/40 text-white/70"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>Audio {audioEnabled ? "on" : "off"}</span>
                </button>

                {/* Motion toggle */}
                <button
                  type="button"
                  onClick={() => setMotionEnabled((v) => !v)}
                  className={`glow-focus px-3 py-1.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                    motionEnabled
                      ? "border-sky-400/60 bg-sky-500/10 text-sky-200"
                      : "border-white/15 bg-black/40 text-white/70"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>Motion {motionEnabled ? "dynamic" : "subtle"}</span>
                </button>

                {/* Speech toggle */}
                <button
                  type="button"
                  onClick={() => setSpeechEnabled((v) => !v)}
                  className={`glow-focus px-3 py-1.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                    speechEnabled
                      ? "border-purple-400/60 bg-purple-500/10 text-purple-200"
                      : "border-white/15 bg-black/40 text-white/70"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>Speech {speechEnabled ? "on" : "off"}</span>
                </button>

                {/* Multi-shot toggle */}
                <button
                  type="button"
                  onClick={() => setMultiShot((v) => !v)}
                  className={`glow-focus px-3 py-1.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                    multiShot
                      ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200"
                      : "border-white/15 bg-black/40 text-white/70"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>Multi-shot {multiShot ? "enabled" : "single"}</span>
                </button>

                {/* Model selector */}
                <div className="relative">
                  {(() => {
                    const modelOptions = [
                      {
                        id: "MiniMax",
                        backendModel: "MiniMax" as const,
                        label: "MiniMax",
                        subtitle: "Fast cinematic base model",
                        badge: "DEFAULT",
                        icon: <Sparkles className="h-4 w-4 text-cyan-300" />,
                      },
                      {
                        id: "Kling-3.0",
                        backendModel: "Kling" as const,
                        label: "Kling 3.0",
                        subtitle: "High-fidelity motion for scenes",
                        badge: "PRO+",
                        icon: <Clapperboard className="h-4 w-4 text-violet-300" />,
                      },
                      {
                        id: "Kling-O3",
                        backendModel: "Kling" as const,
                        label: "Kling O3",
                        subtitle: "Experimental cinematic engine",
                        badge: "NEW",
                        icon: <Film className="h-4 w-4 text-fuchsia-300" />,
                      },
                      {
                        id: "Veo-3.1-Lite",
                        backendModel: "Veo 3 Lite" as const,
                        label: "Veo 3.1 Lite",
                        subtitle: "Google Veo 3 text-to-video",
                        badge: "BETA",
                        icon: <Wand2 className="h-4 w-4 text-emerald-300" />,
                      },
                      {
                        id: "Runway",
                        backendModel: "Runway" as const,
                        label: "Runway",
                        subtitle: "Studio-grade editing pipeline",
                        badge: "PRO",
                        icon: <Star className="h-4 w-4 text-amber-300" />,
                      },
                      {
                        id: "PixVerse-V6",
                        backendModel: "MiniMax" as const,
                        label: "PixVerse V6",
                        subtitle: "PixVerse-style storytelling",
                        badge: "CINEMATIC",
                        icon: <Sparkles className="h-4 w-4 text-pink-300" />,
                      },
                      {
                        id: "Sora-2",
                        backendModel: "MiniMax" as const,
                        label: "Sora 2",
                        subtitle: "Long-form concept previews",
                        badge: "LABS",
                        icon: <Film className="h-4 w-4 text-sky-300" />,
                      },
                    ];

                    const selected =
                      modelOptions.find((option) => option.id === modelKey) ?? modelOptions[0];

                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setModelMenuOpen((open) => !open)}
                          className="glow-focus glow-pill px-3 py-1.5 rounded-2xl flex items-center gap-3 border border-white/15 text-white/80 min-w-[200px] justify-between bg-black/50 hover:border-cyan-400/60 hover:bg-white/5 transition"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 border border-white/15">
                              {selected.icon}
                            </span>
                            <span className="flex flex-col text-left">
                              <span className="text-xs font-semibold truncate">{selected.label}</span>
                              <span className="text-[10px] text-white/50 truncate">
                                {selected.subtitle}
                              </span>
                            </span>
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-white/60">
                            {selected.badge && (
                              <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/15 text-[9px] uppercase tracking-[0.16em] text-white/70">
                                {selected.badge}
                              </span>
                            )}
                            <span className="text-xs">▾</span>
                          </span>
                        </button>

                        <AnimatePresence>
                          {modelMenuOpen && (
                            <motion.div
                              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                              exit={shouldReduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                              transition={{
                                duration: shouldReduceMotion ? 0 : 0.2,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="absolute right-0 bottom-full mb-2 w-72 max-h-72 overflow-y-auto rounded-3xl border border-white/15 bg-black/90 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] z-20 p-1.5"
                            >
                              {modelOptions.map((option) => {
                                const isSelected = option.id === modelKey;
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                      setModelKey(option.id);
                                      setModel(option.backendModel);
                                      setModelMenuOpen(false);
                                    }}
                                    className={`group w-full text-left rounded-2xl px-3 py-2 flex items-center gap-3 text-[11px] transition-colors ${
                                      isSelected
                                        ? "bg-white/10 border border-white/20"
                                        : "border border-transparent hover:border-white/10 hover:bg-white/5"
                                    }`}
                                  >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/5 border border-white/10 group-hover:border-cyan-400/60 group-hover:bg-cyan-500/10 transition-colors">
                                      {option.icon}
                                    </span>
                                    <span className="flex-1 min-w-0 flex flex-col">
                                      <span
                                        className={`text-[11px] font-semibold truncate ${
                                          isSelected ? "text-white" : "text-white/85"
                                        }`}
                                      >
                                        {option.label}
                                      </span>
                                      <span className="text-[10px] text-white/55 truncate">
                                        {option.subtitle}
                                      </span>
                                    </span>
                                    {option.badge && (
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.16em] border ${
                                          option.badge === "NEW"
                                            ? "border-emerald-400/70 text-emerald-200 bg-emerald-500/10"
                                            : option.badge === "PRO+"
                                              ? "border-violet-400/70 text-violet-200 bg-violet-500/10"
                                              : option.badge === "PRO"
                                                ? "border-amber-400/70 text-amber-200 bg-amber-500/10"
                                                : option.badge === "CINEMATIC"
                                                  ? "border-pink-400/70 text-pink-200 bg-pink-500/10"
                                                  : option.badge === "LABS"
                                                    ? "border-sky-400/70 text-sky-200 bg-sky-500/10"
                                                    : "border-white/20 text-white/70 bg-white/5"
                                        }`}
                                      >
                                        {option.badge}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    );
                  })()}
                </div>
              </div>

              <motion.button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                whileHover={
                  shouldReduceMotion
                    ? undefined
                    : {
                        y: -1,
                        scale: 1.02,
                      }
                }
                whileTap={
                  shouldReduceMotion
                    ? undefined
                    : {
                        scale: 0.97,
                      }
                }
                className="relative overflow-hidden glow-focus glow-primary px-6 md:px-8 py-3 md:py-3.5 rounded-2xl font-black text-sm md:text-base tracking-tight flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-white/20 via-transparent to-white/10" />
                <span className="relative z-[1] flex items-center gap-2">
                  <span>
                    {creating
                      ? generationStage === "initializing"
                        ? "Initializing AI..."
                        : generationStage === "generating"
                          ? "Generating frames..."
                          : generationStage === "rendering"
                            ? "Rendering scene..."
                            : generationStage === "finalizing"
                              ? "Finalizing video..."
                              : "Creating..."
                      : "Generate"}
                  </span>
                  <span className="hidden md:inline text-xs font-normal text-white/80" />
                </span>
              </motion.button>
            </div>
          </div>

          <div className="mt-2.5 space-y-2.5">
            <AnimatePresence>
              {generationStage !== "idle" && (
                <motion.div
                  initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.45,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-pink-500/10 px-3.5 py-2.5 md:px-4 md:py-3 flex items-center gap-3"
                >
                  <div className="relative h-8 w-8 flex-shrink-0">
                    {!shouldReduceMotion && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-cyan-400/40 blur-md"
                        animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.1, 0.9] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    <div className="relative h-8 w-8 rounded-full border border-cyan-300/70 bg-black/70 flex items-center justify-center text-[10px] font-semibold text-cyan-100">
                      {Math.round(generationProgress)}%
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="font-semibold text-white/80">
                        {generationStage === "initializing"
                          ? "Initializing AI"
                          : generationStage === "generating"
                            ? "Generating frames"
                            : generationStage === "rendering"
                              ? "Rendering cinematic scene"
                              : generationStage === "finalizing"
                                ? "Finalizing video"
                                : generationStage === "completed"
                                  ? "Cinematic video ready"
                                  : generationStage === "error"
                                    ? "Generation failed"
                                    : ""}
                      </span>
                      <span className="text-white/55">{Math.round(generationProgress)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-pink-400 shadow-[0_0_16px_rgba(56,189,248,0.7)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${generationProgress}%` }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.5,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {generatedVideoUrl && lastGeneratedItem && generationStage === "completed" && (
              <motion.div
                initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.5,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="rounded-2xl border border-white/15 bg-black/70 px-3.5 py-3 md:px-4 md:py-3.5 flex flex-col md:flex-row gap-3 md:gap-4"
              >
                <div className="relative w-full md:w-52 overflow-hidden rounded-xl border border-white/15">
                  <video
                    src={generatedVideoUrl}
                    loop
                    autoPlay
                    controls
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
                </div>
                <div className="flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white/85">
                      Latest cinematic video ready
                    </div>
                    <div className="text-[11px] text-white/60 mt-0.5">
                      Saved to <span className="font-semibold text-white/80">My Videos</span>. Hover
                      any video card to autoplay a preview.
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[10px] text-white/55 uppercase tracking-[0.18em]">
                        Export formats
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={generatedVideoUrl}
                          download
                          className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/90 border border-white/25 bg-white/5"
                        >
                          MP4 video
                        </a>
                        <button
                          type="button"
                          disabled
                          className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/60 border border-white/20 bg-black/40 opacity-60 cursor-not-allowed"
                        >
                          MP3 audio (soon)
                        </button>
                        <button
                          type="button"
                          disabled
                          className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/60 border border-white/20 bg-black/40 opacity-60 cursor-not-allowed"
                        >
                          JPEG frame (soon)
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {generatedPrompt && (
                      <button
                        type="button"
                        onClick={() => {
                          setPrompt(generatedPrompt);
                          setActiveGenTab("Video");
                        }}
                        className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/85 border border-cyan-400/50 bg-cyan-500/10"
                      >
                        Remix
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItem(lastGeneratedItem);
                      }}
                      className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/80 border border-white/20 bg-white/5"
                    >
                      Open in My Videos
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {createStatus && (
              <div className="text-[11px] text-white/60">
                {createStatus}
              </div>
            )}
          </div>
        </div>
      </main>

      {selectedItem && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="absolute inset-0" onClick={() => setSelectedItem(null)} />
          <div className="relative z-10 w-[92%] max-w-3xl rounded-3xl glass-panel border border-white/20 overflow-hidden">
            <div className="relative h-64 md:h-80">
              {selectedItem.type === "video" && selectedItem.videoUrl ? (
                <video
                  src={selectedItem.videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={selectedItem.thumb}
                  alt={selectedItem.title}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
              <div className="absolute top-4 left-4 text-[11px] px-2 py-1 rounded-full bg-black/70 border border-white/20 text-white/80 flex items-center gap-1">
                <span>{getTimeAgoLabel(selectedItem.createdAt)}</span>
                {isNew(selectedItem.createdAt) && (
                  <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/30 text-cyan-100 border border-cyan-400/70 text-[10px] leading-none">
                    New
                  </span>
                )}
              </div>
              <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-full bg-black/75 border border-white/25 text-white/85">
                  {selectedItem.type === "video" ? "Video" : "Image"}
                </span>
                <span className="px-2 py-1 rounded-full bg-black/70 border border-white/20 text-white/75">
                  {selectedItem.model}
                </span>
              </div>
            </div>
            <div className="p-4 border-t border-white/15">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setActiveVideoView("preview")}
                    className={`glow-focus px-3 py-1 rounded-full border text-xs ${
                      activeVideoView === "preview"
                        ? "bg-white text-black font-semibold border-white/80"
                        : "bg-black/40 text-white/70 border-white/20"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveVideoView("edit")}
                    className={`glow-focus px-3 py-1 rounded-full border text-xs ${
                      activeVideoView === "edit"
                        ? "bg-white text-black font-semibold border-white/80"
                        : "bg-black/40 text-white/70 border-white/20"
                    }`}
                  >
                    Edit
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedItem.type === "video" && selectedItem.videoUrl && (
                    <>
                      <a
                        href={selectedItem.videoUrl}
                        download
                        className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/90 border border-white/25 bg-white/5"
                      >
                        Download
                      </a>
                      {selectedItem.prompt && (
                        <button
                          type="button"
                          onClick={() => {
                            setPrompt(selectedItem.prompt ?? "");
                            setActiveGenTab("Video");
                            setSelectedItem(null);
                          }}
                          className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/85 border border-cyan-400/50 bg-cyan-500/10"
                        >
                          Remix
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white/80"
                  >
                    Close
                  </button>
                </div>
              </div>

              {activeVideoView === "preview" ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm md:text-base font-semibold">
                      {selectedItem.title}
                    </div>
                    <div className="text-[11px] text-white/60 mt-1">
                      {getTimeAgoLabel(selectedItem.createdAt)} • {selectedItem.model} •{" "}
                      {selectedItem.type === "video" ? "Video" : "Image"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-[11px]">
                  <div>
                    <div className="text-white/70 mb-1">Title</div>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-xl bg-black/60 border border-white/20 px-3 py-1.5 text-[11px] text-white outline-none focus:border-cyan-400/70"
                      placeholder="Enter a title for this video"
                    />
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedItem) return;
                          const newTitle = editTitle.trim() || selectedItem.title;
                          setItems((prev) =>
                            prev.map((it) =>
                              it.id === selectedItem.id ? { ...it, title: newTitle } : it,
                            ),
                          );
                          setSelectedItem({ ...selectedItem, title: newTitle });
                        }}
                        className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white bg-cyan-500/20 border border-cyan-400/70"
                      >
                        Save title
                      </button>
              </div>
                  </div>

                  {selectedItem.prompt && (
                    <div>
                      <div className="text-white/70 mb-1">Original prompt</div>
                      <div className="rounded-xl bg-black/60 border border-white/20 px-3 py-2 max-h-28 overflow-y-auto text-white/80 whitespace-pre-wrap">
                        {selectedItem.prompt}
                      </div>
                      <div className="mt-1 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPrompt(selectedItem.prompt ?? "");
                            setActiveGenTab("Video");
                            setSelectedItem(null);
                          }}
                          className="glow-focus glow-pill px-3 py-1.5 rounded-xl text-[11px] text-white border border-cyan-400/60 bg-cyan-500/15"
                        >
                          Use in editor
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
