"use client";

import { Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { motion, useReducedMotion, type Variants, AnimatePresence } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "../lib/apiBase";
import { useUserContext } from "./StudioChrome";
import ErrorBoundary from "../components/ErrorBoundary";

export default function Home() {
  return (
    <ErrorBoundary>
      <Suspense>
        <HomeContent />
      </Suspense>
    </ErrorBoundary>
  );
}

function HomeContent() {

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  const [authStatus, setAuthStatus] = useState("");

  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState("");
  const [referenceImageName, setReferenceImageName] = useState("");
  const [dockCollapsed, setDockCollapsed] = useState(true);

  const TEMPLATE_PROMPTS: Record<string, string> = {
    "shorts-talking-head":
      "Ultra-sharp portrait of a confident [HOST_DESCRIPTION], speaking directly to camera in a [MOOD] tone, giving a quick tip about [TOPIC]. Background is a softly blurred [LOCATION] with cinematic lighting, 9:16 vertical frame, subtle camera sway, 1080p, high contrast, shallow depth of field, studio-quality lighting.",
    "product-spotlight":
      "Cinematic close-ups of [PRODUCT_NAME] being used in a real-world [CONTEXT]. Smooth camera moves around the product, macro detail shots, soft reflections, subtle particles in the air, 9:16 vertical frame, 1080p. High-end commercial look, shallow depth of field, warm highlights, clean background with brand colors [BRAND_COLORS].",
    "before-after":
      "Side-by-side before/after sequence showing a [SUBJECT] transforming from [BEFORE_STATE] to [AFTER_STATE]. Camera slowly pushes in, split-screen effect, smooth crossfade, cinematic color grading. 16:9, 1080p, high contrast, clear text labels ‘Before’ and ‘After’ in modern sans-serif font.",
    "screen-tutorial":
      "Over-the-shoulder view of a person using a laptop to demonstrate [APP_TASK] inside [APP_NAME]. Soft-focus hands on keyboard, screen in focus showing a clean UI. Minimal floating callout labels appear next to key UI elements. Neutral modern office background, 16:9, 1080p, calm and professional lighting.",
    "lofi-study":
      "Loopable cozy lo-fi scene of [CHARACTER_DESCRIPTION] working at a desk in [ROOM_DESCRIPTION], gentle camera sway, warm lamp light, city lights outside the window, subtle particles floating, soft depth of field. 16:9, 1080p, muted pastel color palette, calm and relaxing vibe.",
    "anime-action":
      "High-energy anime-style scene of [CHARACTER_DESCRIPTION] in [LOCATION], performing a dynamic [ACTION]. Bold line art, vibrant colors, motion lines, dramatic lighting, 9:16 vertical frame, camera whip pans and slow-motion moments. Inspired by modern anime openings, crisp 1080p.",
  };

  type Mode = "image" | "video" | "template" | "speech" | "motion";
  const [mode, setMode] = useState<Mode>("video");

  const modeMeta: Record<Mode, { placeholder: string; helper: string }> = {
    image: {
      placeholder: "Describe the image or key frame you want SailorAI to create...",
      helper: "Image mode will focus on generating or enhancing a single frame or reference visual.",
    },
    video: {
      placeholder: "Describe your AI video...",
      helper: "Video mode generates full clips based on your prompt and optional reference image.",
    },
    template: {
      placeholder: "Describe the template or structure you want to reuse across videos...",
      helper: "Template mode will let you build reusable setups for repeatable content (coming soon).",
    },
    speech: {
      placeholder: "Write the script or voiceover you want SailorAI to narrate...",
      helper: "Speech mode will generate voiceover and sync it to visuals (coming soon).",
    },
    motion: {
      placeholder: "Describe the motion or camera movement you want to apply...",
      helper: "Motion mode will control movement, camera, and transitions for your clips (coming soon).",
    },
  };

  type Category =
    | "All"
    | "Cinematic"
    | "Anime"
    | "3D Cartoon"
    | "Fantasy"
    | "Adventure"
    | "Movie"
    | "F1";

  type VideoCardItem = {
    title: string;
    image: string;
    preview?: string;
    category: Category;
    prompt: string;
  };

  type MyVideo = {
    id: string;
    url: string;
    prompt: string;
    createdAt: string;
  };

  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [selectedVideo, setSelectedVideo] = useState<VideoCardItem | null>(null);

  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [myVideos, setMyVideos] = useState<MyVideo[]>([]);
  const progressTimerRef = useRef<number | null>(null);
  const progressHideTimerRef = useRef<number | null>(null);

  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const shouldReduceMotion = useReducedMotion();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { refreshUser } = useUserContext();
  const cinematicEase = [0.16, 1, 0.3, 1] as const;


  const sidebarVariants: Variants = {
    hidden: {
      opacity: 0,
      x: -24,
    },
    show: {
      opacity: 1,
      x: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.65,
        ease: cinematicEase,
      },
    },
  };

  const navVariants: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.05,
        delayChildren: shouldReduceMotion ? 0 : 0.12,
      },
    },
  };

  const navItemVariants: Variants = {
    hidden: {
      opacity: 0,
      x: -12,
    },
    show: {
      opacity: 1,
      x: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.45,
        ease: cinematicEase,
      },
    },
  };

  const gridVariants: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.06,
      },
    },
  };

  const cardVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 16,
    },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.6,
        ease: cinematicEase,
      },
    },
  };

  function startProgress() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (progressHideTimerRef.current) {
      window.clearTimeout(progressHideTimerRef.current);
      progressHideTimerRef.current = null;
    }

    setShowProgress(true);
    setProgress(0);

    if (shouldReduceMotion) {
      // Minimal motion: show a sensible static mid-progress state.
      setProgress(55);
      return;
    }

    progressTimerRef.current = window.setInterval(() => {
      setProgress((p) => {
        // Ease out as it approaches completion. (Real progress comes from the server response.)
        const ceiling = 92;
        if (p >= ceiling) return p;

        const step = p < 70 ? 4 : p < 85 ? 2 : 1;
        const jitter = Math.random() < 0.35 ? 1 : 0;
        return Math.min(ceiling, p + step + jitter);
      });
    }, 140);
  }

  function finishProgress() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (progressHideTimerRef.current) {
      window.clearTimeout(progressHideTimerRef.current);
      progressHideTimerRef.current = null;
    }

    setProgress(100);

    // Let the user see the completed bar briefly, then hide.
    progressHideTimerRef.current = window.setTimeout(() => {
      setShowProgress(false);
      setProgress(0);
      progressHideTimerRef.current = null;
    }, 700);
  }

  function handleReferenceImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return;
    }

    setReferenceImageName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setReferenceImageDataUrl(result);
      }
    };
    reader.readAsDataURL(file);
  }

  function clearReferenceImage() {
    setReferenceImageDataUrl("");
    setReferenceImageName("");
  }

  function handleRemix() {
    setPrompt((p) => (p ? `${p}, remix` : "Remix this video"));
    setVideoUrl("");

    window.setTimeout(() => {
      promptRef.current?.focus();
    }, 0);
  }

  function handleSampleRemix(video: VideoCardItem) {
    setDockCollapsed(false);
    setMode("video");
    setVideoUrl("");

    const remixLine = `Remix this ${video.category.toLowerCase()} shot: ${video.title}`;

    setPrompt((p) => {
      if (!p || p === "Remix this video") {
        return remixLine;
      }
      return `${p}\n\n${remixLine}`;
    });

    window.setTimeout(() => {
      promptRef.current?.focus();
    }, 0);
  }

  // Apply template prompt from query param (once, if prompt is empty)
  useEffect(() => {
    const tmplId = searchParams.get("template");
    if (tmplId && !prompt) {
      const tmpl = TEMPLATE_PROMPTS[tmplId];
      if (tmpl) {
        setPrompt(tmpl);
      }
    }
  }, [searchParams, prompt]);

  useEffect(() => {
    if (!selectedVideo) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedVideo(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo]);

  async function generateVideo() {

    if (mode !== "video") {
      const pretty = mode.charAt(0).toUpperCase() + mode.slice(1);
      setAuthStatus(`${pretty} mode is coming soon. For now, use Video to generate.`);
      return;
    }

    const promptText = prompt;

    try {
      setVideoUrl("");
      setLoading(true);
      startProgress();

      const payload: Record<string, unknown> = {
        prompt: promptText,
      };

      if (referenceImageDataUrl) {
        payload.image_url = referenceImageDataUrl;
      }

      // 1) Start a Replicate job via the Flask API
      const response = await fetch(`${API_BASE}/api/generate-video`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setAuthStatus("Please sign in to generate.");
        } else if (response.status === 402) {
          setAuthStatus(
            `Not enough credits. You have ${data?.credits ?? 0}, need ${data?.required ?? "?"}.`,
          );
        } else {
          setAuthStatus(data?.error || "Generation failed");
        }
        return;
      }

      const jobId = data?.jobId as string | undefined;
      if (!jobId) {
        setAuthStatus("Generation started, but no job ID was returned.");
        return;
      }

      // 2) Poll for status until the video is ready (or fails/times out)
      const maxPolls = 40; // ~200s at 5s interval
      for (let i = 0; i < maxPolls; i += 1) {
        const statusRes = await fetch(`${API_BASE}/api/video-status/${jobId}`, {
          method: "GET",
        });
        const statusData = await statusRes.json();

        const status = statusData?.status as string | undefined;
        const videoUrl = statusData?.videoUrl as string | undefined;

        if (status === "succeeded" && videoUrl) {
          setVideoUrl(videoUrl);
          setMyVideos((prev) => [
            {
              id: jobId,
              url: videoUrl,
              prompt: promptText,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]);
          refreshUser();
          return;
        }

        if (status === "failed" || status === "canceled") {
          setAuthStatus("Video generation failed.");
          return;
        }

        // still starting/processing, wait and try again
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      setAuthStatus("Video took too long to generate. Please try again.");

    } catch (err) {
      console.error(err);
      setAuthStatus("Something went wrong while generating the video.");
    } finally {
      finishProgress();
      setLoading(false);
    }
  }

  type StudioSectionItem = {
    title: string;
    label: string;
    image: string;
    accent: string;
    description: string;
  };

  const studioSections: StudioSectionItem[] = [
    {
      title: "Cinematic AI Video",
      label: "Video",
      image:
        "https://images.unsplash.com/photo-1518895949257-7621c3c786d4?q=80&w=1200&auto=format&fit=crop",
      accent: "from-cyan-400 to-blue-500",
      description: "Full AI-powered clips with motion, depth, and camera control.",
    },
    {
      title: "AI Images & Keyframes",
      label: "Image",
      image:
        "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop",
      accent: "from-pink-400 to-rose-500",
      description: "High-detail stills and keyframes to drive your videos.",
    },
    {
      title: "Reusable Templates",
      label: "Template",
      image:
        "https://images.unsplash.com/photo-1526498460520-4c246339dccb?q=80&w=1200&auto=format&fit=crop",
      accent: "from-emerald-400 to-teal-500",
      description: "Preset structures for Shorts, tutorials, ads, and more.",
    },
    {
      title: "Motion & Voice",
      label: "Motion / Speech",
      image:
        "https://images.unsplash.com/photo-1510798831971-661eb04b3739?q=80&w=1200&auto=format&fit=crop",
      accent: "from-amber-400 to-orange-500",
      description: "Camera moves, transitions, and AI voice working together.",
    },
  ];

  const videos: VideoCardItem[] = [
    {
      title: "Stadium Soccer Match",
      image:
        "https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Cinematic",
      prompt:
        "Epic wide shot of a packed soccer stadium at night, bright floodlights over a green pitch, players lining up for kickoff, slow cinematic camera orbit, 16:9, high contrast broadcast look.",
    },
    {
      title: "Street Soccer at Sunset",
      image:
        "https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Cinematic",
      prompt:
        "Slow‑motion street soccer game on a rooftop court at sunset, warm orange sky, silhouettes of players juggling the ball, camera gliding low across the concrete, 9:16 vertical sports highlight style.",
    },
    {
      title: "Urban Basketball Night Game",
      image:
        "https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Cinematic",
      prompt:
        "Cinematic night game on an outdoor basketball court under harsh floodlights, players driving to the hoop, breath visible in the cold air, camera orbiting around the rim as the ball swishes through the net, 16:9, high contrast, gritty sports film look.",
    },
    {
      title: "Slam Dunk Slow Motion",
      image:
        "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Cinematic",
      prompt:
        "Ultra slow‑motion slam dunk from behind the backboard, player hanging on the rim while the crowd explodes in the background, sweat and chalk dust in the air, 9:16 vertical, dramatic backlight and lens flares, stylized highlight clip.",
    },
    {
      title: "Anime City Rooftop Battle",
      image:
        "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Anime",
      prompt:
        "High‑energy anime scene on a neon city rooftop at night, two characters clashing swords in mid‑air, motion lines, glowing attacks, camera whip pans and slow‑motion impact, 9:16 vertical, vibrant magenta and cyan palette inspired by modern anime openings.",
    },
    {
      title: "Anime Training Ground",
      image:
        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Anime",
      prompt:
        "Warm afternoon anime‑style training ground scene, young hero practicing sword forms under a cherry blossom tree, petals drifting through the frame, gentle handheld camera sway, 16:9, soft pastel color grading.",
    },
    {
      title: "Dragon Over Mountain Peaks",
      image:
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Fantasy",
      prompt:
        "Cinematic shot of a massive dragon gliding over snow‑capped mountain peaks at sunrise, golden light hitting its wings, camera tracking alongside as clouds roll beneath, 16:9, high contrast fantasy movie trailer vibe.",
    },
    {
      title: "Neon Dragon Above Future City",
      image:
        "https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?q=80&w=1200&auto=format&fit=crop",
      preview: "",
      category: "Fantasy",
      prompt:
        "Dynamic tracking shot of a glowing neon dragon spiraling above a futuristic city at night, cyan fire breath reflecting off glass skyscrapers, magenta storm clouds in the sky, 16:9, saturated cyber‑fantasy color grade.",
    },
  ];

  function PreviewCard({
    video,
    onWatch,
    onRemix,
  }: {
    video: VideoCardItem;
    onWatch: (video: VideoCardItem) => void;
    onRemix: (video: VideoCardItem) => void;
  }) {

    const previewRef = useRef<HTMLVideoElement | null>(null);
    const [videoError, setVideoError] = useState(false);
    const hasPreview = !!video.preview && !videoError;

    async function handleEnter() {
      const el = previewRef.current;
      if (!el) return;

      try {
        // Start from the beginning for a crisp hover preview.
        el.currentTime = 0;
        await el.play();
      } catch {
        // Autoplay can be blocked in some cases.
      }
    }

    function handleLeave() {
      const el = previewRef.current;
      if (!el) return;

      el.pause();
      el.currentTime = 0;
    }

    const orientationClass =
      video.category === "Cinematic" || video.category === "Movie"
        ? "aspect-[16/9]"
        : video.category === "Anime" || video.category === "3D Cartoon"
          ? "aspect-[9/16]"
          : "aspect-square";

    async function handleCopyPrompt() {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        // Clipboard API not available (older browser or non-DOM env)
        return;
      }
      try {
        await navigator.clipboard.writeText(video.prompt);
      } catch {
        // ignore clipboard errors
      }
    }

    function handleGoToCreate() {
      setDockCollapsed(false);
      setMode("video");
      setVideoUrl("");
      setPrompt(video.prompt);
      window.setTimeout(() => {
        promptRef.current?.focus();
      }, 0);
    }

    return (

      <motion.div
        key={video.title}
        variants={cardVariants}
        whileHover={
          shouldReduceMotion
            ? undefined
            : {
                y: -4,
                scale: 1.03,
              }
        }
        whileTap={
          shouldReduceMotion
            ? undefined
            : {
                scale: 0.99,
              }
        }
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={`group relative overflow-hidden rounded-none border border-white/5 bg-transparent shadow-[0_22px_80px_rgba(0,0,0,0.95)] break-inside-avoid ${orientationClass}`}
      >

        <img
          src={video.image}
          alt={video.title}
          className={`w-full h-full object-cover brightness-105 transition duration-700 ease-out ${
            hasPreview
              ? "opacity-100 group-hover:opacity-0 group-hover:scale-[1.07] group-hover:brightness-110"
              : "group-hover:scale-[1.07] group-hover:brightness-110"
          }`}
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement & { dataset: { fallbackApplied?: string } };
            if (target.dataset.fallbackApplied === "1") return;
            target.dataset.fallbackApplied = "1";
            target.src = "https://via.placeholder.com/1200x800/4C1D95/FFFFFF?text=AI+Fantasy+Clip";
          }}
        />

        {hasPreview && (
          <video
            ref={previewRef}
            src={video.preview}
            poster={video.image}
            muted
            playsInline
            loop
            preload="metadata"
            onError={() => setVideoError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-[1.07] transition duration-700 ease-out"
          />
        )}

        {/* Cinematic overlay (only on hover to keep images bright) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-80 transition duration-500" />

        {/* Extra glow wash (hover neon accent) */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500"
          style={{
            background:
              "radial-gradient(600px circle at 0% 0%, rgba(147,51,234,0.25), transparent 55%), radial-gradient(600px circle at 100% 100%, rgba(249,115,22,0.22), transparent 55%)",
          }}
        />

        <div className="absolute inset-x-0 bottom-0 p-3 md:p-4 flex flex-col gap-1">

          <div className="text-xs md:text-sm font-semibold drop-shadow-[0_12px_30px_rgba(0,0,0,0.9)]">
            {video.title}
          </div>

          {/* Actions: only show on hover so imagery stays clean */}
          <div className="mt-1 flex items-center gap-2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">

            <button
              type="button"
              onClick={handleGoToCreate}
              className="glow-focus px-3 py-1.5 rounded-full font-semibold text-[11px] border border-white/40 bg-black/40 text-white hover:border-purple-400/80 hover:bg-white/5 hover:shadow-[0_0_22px_rgba(168,85,247,0.85)] transition"
            >
              Go to create
            </button>

            <button
              type="button"
              onClick={handleCopyPrompt}
              className="glow-focus px-3 py-1.5 rounded-full text-[11px] font-medium border border-white/30 bg-black/40 text-white/90 hover:border-cyan-400/80 hover:bg-white/5 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.8)] transition"
            >
              Copy prompt
            </button>

          </div>

        </div>

      </motion.div>

    );
  }

  const totalFrames = 240;
  const framesRendered = Math.max(
    0,
    Math.min(totalFrames, Math.round((progress / 100) * totalFrames))
  );

  const stageLabel = (() => {
    if (!loading) return "Finalizing video";
    if (progress < 25) return "Initializing AI";
    if (progress < 55) return "Generating frames";
    if (progress < 85) return "Rendering cinematic scene";
    return "Finalizing video";
  })();

  function GlowSpinner({ size = 18 }: { size?: number }) {
    return (
      <motion.div
        aria-hidden="true"
        className="relative"
        style={{
          width: size,
          height: size,
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                rotate: 360,
              }
        }
        transition={
          shouldReduceMotion
            ? undefined
            : {
                duration: 1.05,
                repeat: Infinity,
                ease: "linear",
              }
        }
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 90deg, rgba(34,211,238,1), rgba(236,72,153,1), rgba(249,115,22,1), rgba(34,211,238,1))",
            filter: "blur(0px)",
            opacity: 0.95,
          }}
        />
        <div
          className="absolute inset-[2px] rounded-full bg-black/70"
          style={{
            boxShadow: "0 0 22px rgba(34,211,238,0.18)",
          }}
        />
      </motion.div>
    );
  }

  function ThinkingDots() {
    if (shouldReduceMotion) {
      return <span className="ml-1">...</span>;
    }

    return (
      <span className="ml-1 inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="text-white/70"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
          >
            .
          </motion.span>
        ))}
      </span>
    );
  }

  return (

    <div className="min-h-screen text-white flex bg-black cinematic-bg">

      {/* MAIN CONTENT (sidebar + header now provided by StudioChrome) */}

      <main className="flex-1 flex flex-col relative overflow-hidden">


        {authStatus && (
          <div className="px-4 md:px-8 py-2">
            <div className="text-sm text-white/70">
              {authStatus}
            </div>
          </div>
        )}

        {/* CATEGORY FILTERS */}

        {!authStatus && (
          <div className="flex gap-3 overflow-x-auto px-2 md:px-6 pb-2 pt-1">

          {(
            [
              "All",
              "Cinematic",
              "Anime",
              "3D Cartoon",
              "Fantasy",
              "Adventure",
              "Movie",
              "F1",
            ] as Category[]
          ).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`glow-focus px-3.5 md:px-4 py-1.5 rounded-full whitespace-nowrap text-xs md:text-sm border transition ${
                activeCategory === cat
                  ? "border-cyan-400/80 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.8)]"
                  : "border-transparent text-white/60 hover:text-white hover:border-white/30 hover:shadow-[0_0_16px_rgba(255,255,255,0.35)]"
              }`}
            >
              {cat}
            </button>
          ))}

        </div>
        )}

        {/* ATTENTION GRABBING AI STUDIO SECTIONS + VIDEO GRID */}

        <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-2 pb-64">

          {/** Filter videos by active category */}
          {/** All -> show all, otherwise match category */}
          {/** This filtered list is used below in the gallery grid. */}
          {(() => {
            return null;
          })()}

          {/* Existing video gallery (masonry-style, no gaps) */}
          <motion.div
            variants={gridVariants}
            initial="hidden"
            animate="show"
            className="columns-1 sm:columns-2 xl:columns-3 [column-gap:0]"
          >
            {videos
              .filter((video) =>
                activeCategory === "All" ? true : video.category === activeCategory,
              )
              .map((video) => (
                <PreviewCard
                  key={video.title}
                  video={video}
                  onWatch={setSelectedVideo}
                  onRemix={handleSampleRemix}
                />
              ))}
          </motion.div>

        </div>

        {/* FLOATING AI DOCK */}

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl rounded-[2rem] glass-panel p-4 md:p-5 shadow-[0_30px_120px_rgba(0,0,0,0.72)]">

          {/* Header + minimize/expand */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              AI Creation
            </div>
            <button
              type="button"
              onClick={() => setDockCollapsed((v) => !v)}
              className="glow-focus px-3 py-1 rounded-xl text-[11px] text-white/70 flex items-center gap-1 border border-white/20 bg-black/40 hover:border-purple-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(168,85,247,0.9)] transition"
            >
              <span>{dockCollapsed ? "Expand" : "Minimize"}</span>
              <span className="text-xs">{dockCollapsed ? "▴" : "▾"}</span>
              </button>
          </div>

          {/* Mode tabs (always visible) */}
          <div className="flex gap-3 flex-wrap mb-3">
            {[
              { label: "Image", id: "image" as Mode },
              { label: "Video", id: "video" as Mode },
              { label: "Template", id: "template" as Mode },
              { label: "Speech", id: "speech" as Mode },
              { label: "Motion", id: "motion" as Mode },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`glow-focus px-4 py-2 rounded-xl text-xs md:text-sm border transition ${
                  mode === item.id
                    ? "border-purple-400/80 text-white font-semibold shadow-[0_0_20px_rgba(168,85,247,0.9)] bg-black/40"
                    : "border-white/15 text-white/70 hover:border-white/40 hover:text-white hover:shadow-[0_0_16px_rgba(255,255,255,0.4)] bg-transparent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Collapsible body */}
          {!dockCollapsed && (
            <>

              <div className="text-xs text-white/60 mb-2">
                {modeMeta[mode].helper}
            </div>

              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) =>
                  setPrompt(e.target.value)
                }
                placeholder={modeMeta[mode].placeholder}
                className="glow-focus w-full h-36 bg-black/20 border border-white/10 rounded-2xl p-5 outline-none resize-none text-lg placeholder:text-white/30 focus:border-cyan-400/30"
                        />

              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">

                  <input
                    id="referenceImage"
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceImageChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="referenceImage"
                    className="glow-focus px-4 py-2 rounded-xl text-xs md:text-sm cursor-pointer select-none border border-white/20 text-white/80 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.75)] transition"
                  >
                    Reference image (optional)
                  </label>

                  {
                    referenceImageDataUrl && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.35,
                          ease: cinematicEase,
                        }}
                        className="flex items-center gap-3"
                      >
                        <img
                          src={referenceImageDataUrl}
                          alt={referenceImageName || "Reference image"}
                          className="h-10 w-10 rounded-xl object-cover border border-white/10"
                        />

                        <div className="text-xs text-white/60 max-w-[260px] truncate">
                          {referenceImageName}
                        </div>

                    <button
                      type="button"
                          onClick={clearReferenceImage}
                          className="glow-focus glow-pill px-3 py-2 rounded-xl text-xs"
                        >
                          Remove
                        </button>
                      </motion.div>
                    )
                  }
                </div>

                <div className="text-xs text-white/40">
                  Improves style/subject consistency
                  </div>

                </div>

              <div className="flex items-center justify-between mt-5 flex-wrap gap-4">

                <div className="flex gap-3 flex-wrap">

                  <button className="glow-focus px-4 py-2 rounded-xl text-xs md:text-sm border border-white/15 text-white/70 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.75)] transition">
                    1080P
                  </button>

                  <button className="glow-focus px-4 py-2 rounded-xl text-xs md:text-sm border border-white/15 text-white/70 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.75)] transition">
                    16:9
                  </button>

                  <button className="glow-focus px-4 py-2 rounded-xl text-xs md:text-sm border border-white/15 text-white/70 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.75)] transition">
                    10s
                  </button>

                  <button className="glow-focus px-4 py-2 rounded-xl text-xs md:text-sm border border-white/15 text-white/70 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.75)] transition">
                    Cinematic
                  </button>
        </div>

                <button
                  onClick={generateVideo}
                  disabled={loading}
                  className={`glow-focus px-8 py-3.5 rounded-2xl font-semibold text-sm md:text-base border transition ${
                    loading
                      ? "opacity-60 cursor-not-allowed border-white/20 text-white/60"
                      : "border-purple-400/80 text-white hover:border-orange-400/80 hover:shadow-[0_0_26px_rgba(249,115,22,0.8)]"
                  }`}
                >

                  {loading
                    ? (
                        <span className="inline-flex items-center gap-3">
                          <GlowSpinner size={18} />
                          <span className="tracking-tight">
                            AI thinking
                            <ThinkingDots />
                          </span>
                          <span className="tabular-nums text-white/80 text-base">
                            {progress}%
                          </span>
                        </span>
                      )
                    : "Create AI Video"}

              </button>
    </div>

              {
                showProgress && (

                  <div className="mt-5">

                    <div className="flex items-center justify-between text-xs text-white/70 mb-2">

                      <div className="flex items-center gap-2">
                        <GlowSpinner size={14} />
                        <span className="font-semibold">
                          {stageLabel}
                        </span>
                        <span className="text-white/50">
                          AI thinking
                          <ThinkingDots />
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="tabular-nums">
                          {progress}%
                        </span>
                        <span className="text-white/40">
                          Frames
                        </span>
                        <span className="tabular-nums text-white/60">
                          {framesRendered}/{totalFrames}
                        </span>
                      </div>

                    </div>

                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">

                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.25,
                          ease: cinematicEase,
                        }}
                        className="relative h-full rounded-full bg-gradient-to-r from-cyan-400 via-pink-400 to-orange-400 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
                      >

                        {
                          !shouldReduceMotion && (
                            <motion.div
                              aria-hidden="true"
                              className="absolute inset-0 opacity-35"
                              style={{
                                backgroundImage:
                                  "linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0) 70%)",
                                backgroundSize: "200% 100%",
                              }}
                              animate={{
                                backgroundPositionX: ["0%", "200%"],
                              }}
                              transition={{
                                duration: 1.1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                          )
}

                      </motion.div>

                    </div>

                  </div>

                )
              }

              {
                (loading || showProgress || videoUrl) && (

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.4,
                      ease: cinematicEase,
                    }}
                    className="mt-6 rounded-3xl border border-white/10 overflow-hidden bg-white/5 shadow-[0_26px_90px_rgba(0,0,0,0.6)]"
                  >

                    <div className="relative h-64 md:h-72 bg-black/40">

                      {
                        videoUrl
                          ? (

                              <video
                                src={videoUrl}
                                controls
                                className="absolute inset-0 w-full h-full object-cover"
                              />

                            )
                          : (

                              <motion.div
                                aria-hidden="true"
                                className="absolute inset-0"
                                style={{
                                  backgroundImage:
                                    "linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0) 70%)",
                                  backgroundSize: "200% 100%",
                                }}
                                animate={
                                  shouldReduceMotion
                                    ? undefined
                                    : {
                                        backgroundPositionX: ["0%", "200%"],
                                      }
                                }
                                transition={
                                  shouldReduceMotion
                                    ? undefined
                                    : {
                                        duration: 1.2,
                                        repeat: Infinity,
                                        ease: "linear",
                                      }
                                }
                              />

                            )
                      }

                      {/* Cinematic overlay */}
                      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black via-black/40 to-transparent" />

                      {/* Status label */}
                      <div className="absolute left-4 top-4 px-3 py-2 rounded-2xl glass-panel">
                        <div className="text-xs text-white/70">
                          {videoUrl ? "Generated preview" : "Rendering preview"}
                          {loading ? <ThinkingDots /> : null}
                        </div>
                      </div>

                    </div>

                    <div className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap">

                      <div className="min-w-[240px]">
                        <div className="text-sm font-black">
                          Latest generation
                        </div>
                        <div className="text-xs text-white/50 mt-1 max-w-[560px] truncate">
                          {prompt || "—"}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">

                        <a
                          href={videoUrl || "#"}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className={`glow-focus px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                            videoUrl
                              ? "border-white/60 text-white hover:border-purple-400/80 hover:shadow-[0_0_22px_rgba(168,85,247,0.85)]"
                              : "border-white/10 text-white/40 pointer-events-none"
                          }`}
                        >
                          Download
                        </a>

                        <button
                          type="button"
                          onClick={handleRemix}
                          disabled={loading}
                          className={`glow-focus px-4 py-2 rounded-xl text-xs md:text-sm border transition ${
                            loading
                              ? "opacity-60 cursor-not-allowed border-white/20 text-white/50"
                              : "border-white/25 text-white/80 hover:border-cyan-400/80 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.75)]"
                          }`}
                        >
                          Remix
                        </button>

                        <button
                          type="button"
                          onClick={generateVideo}
                          disabled={loading}
                          className={`glow-focus px-4 py-2 rounded-xl text-xs md:text-sm font-semibold border transition ${
                            loading
                              ? "opacity-60 cursor-not-allowed border-white/20 text-white/60"
                              : "border-purple-400/80 text-white hover:border-orange-400/80 hover:shadow-[0_0_24px_rgba(249,115,22,0.85)]"
                          }`}
                        >
                          Regenerate
                        </button>

                </div>

                    </div>

                  </motion.div>

                )
              }

            </>
          )}

        </div>

        {/* WATCH MODAL */}
        <AnimatePresence>
          {selectedVideo && (
            <motion.div
              key="video-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedVideo(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.98 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.3,
                  ease: cinematicEase,
                }}
                className="relative w-[92%] max-w-4xl max-h-[80vh] rounded-3xl glass-panel overflow-hidden border border-white/20 shadow-[0_40px_130px_rgba(0,0,0,0.85)]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setSelectedVideo(null)}
                  className="absolute right-4 top-4 z-10 glow-focus glow-pill px-3 py-1 rounded-full text-xs text-white/70 bg-black/60 hover:bg-black/80 border border-white/20"
                >
                  Close
                </button>

                <div className="relative bg-black/60 aspect-video">
                  {selectedVideo.preview ? (
                    <video
                      src={selectedVideo.preview}
                      poster={selectedVideo.image}
                      controls
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={selectedVideo.image}
                      alt={selectedVideo.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                </div>

                <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-black">
                      {selectedVideo.title}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {selectedVideo.category}
                      <span className="mx-1">•</span>
                      Sample AI video preview
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

    </div>

  );
}

