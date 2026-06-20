"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { TrimTimeline } from "../../components/TrimTimeline";
import CanvaSidebar from "../../components/CanvaSidebar";
import { API_BASE } from "../../lib/apiBase";
import type { AssetType, MediaAsset } from "../../lib/mediaTypes";

// Reuse the same base as other API calls. In dev, API_BASE is an empty
// string so these calls go through Next.js rewrites to the local Flask
// backend. In production, API_BASE points at the live backend host.
const ASSETS_BASE_URL = API_BASE || "";

type ExportFormat = "mp4" | "mp3" | "wav" | "jpeg" | "png";

type TransitionType = "fade" | "crossfade" | "slide" | "zoom" | "circle";

type TransitionTemplate = {
  id: TransitionType;
  label: string;
  defaultDuration: number;
};

type TransitionInstance = {
  type: TransitionType;
  duration: number;
};

// Simple text overlay box on the canvas
 type TextBox = {
   id: string;
   xPercent: number;
   yPercent: number;
   text: string;
   fontSize?: number;
   fontWeight?: "normal" | "bold";
 };

 type ClipAdjustments = {
   brightness: number; // percentage, 100 = neutral
   contrast: number;   // percentage, 100 = neutral
   saturation: number; // percentage, 100 = neutral
   exposure: number;   // percentage, 100 = neutral
   highlights: number; // percentage, 100 = neutral
   warmth: number;     // -50 to 50, 0 = neutral
   vignette: number;   // 0–100, 0 = none
 };

 type AudioClip = {
   id: string;
   publicUrl: string;
   originalDuration: number;
   sourceStart: number;
   sourceEnd: number;
   timelineStart: number;
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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const AUDIO_PIXELS_PER_SECOND = 25;

export default function EditorPage() {
  const router = useRouter();
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);

  // --- Export state ---
  const [exportType, setExportType] = useState<"video" | "audio" | "image">("video");
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav" | "aac">("mp3");
  const [imageFormat, setImageFormat] = useState<"jpeg" | "png">("jpeg");
  const [bitrate, setBitrate] = useState<"128" | "192" | "320">("192");
  const [jpegQuality, setJpegQuality] = useState<number>(80);
  const [pngScale, setPngScale] = useState<25 | 50 | 75 | 100>(100);
  const [destination] = useState<"download" | "clipboard" | "share">("download");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [downloadAllClips, setDownloadAllClips] = useState(false);
  const [activeView, setActiveView] = useState<"editor" | "trash">("editor");

  // Download/export menu state
  const [downloadFormat, setDownloadFormat] = useState<"mp4" | "mp3" | "wav" | "png" | "jpeg">("mp4");
  const [downloadScope, setDownloadScope] = useState<"single" | "all">("single");

  const [assetType, setAssetType] = useState<AssetType>("video");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetFilterQuery, setAssetFilterQuery] = useState<string>("");
  // Secondary audio track for the timeline (separate from canvas video)
  const [audioTrack, setAudioTrack] = useState<MediaAsset | null>(null);
  const [beatMarkers, setBeatMarkers] = useState<number[]>([]);
  // Multi-track audio clips placed along the global timeline
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [selectedAudioClipId, setSelectedAudioClipId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [audioTrackDuration, setAudioTrackDuration] = useState<number | null>(null);
  // Per-audio-clip fade durations in seconds
  const [audioFadeByClip, setAudioFadeByClip] = useState<
    Record<string, { fadeIn: number; fadeOut: number }>
  >({});
  const [isBeatSyncLoading, setIsBeatSyncLoading] = useState(false);
  const [fadeMenuOpen, setFadeMenuOpen] = useState(false);
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [audioContextMenu, setAudioContextMenu] = useState<
    { clipId: string; x: number; y: number } | null
  >(null);
  const [clipMutes, setClipMutes] = useState<Record<string, boolean>>({});
  // Simple in-memory timeline: ordered list of video clips used on the canvas
  const [clips, setClips] = useState<MediaAsset[]>([]);
  // Global timeline zoom: 1 = normal, up to 5 = zoomed in
  // Timeline zoom factor: 1 = base scale, <1 = compress track,
  // >1 = expand. Start slightly compressed so a 10s clip feels
  // visually closer to ~7s of width while staying in sync with
  // real time.
  const [zoomLevel, setZoomLevel] = useState(1);
  // Per-clip playback speed multipliers (1.0 = normal)
  const [clipSpeeds, setClipSpeeds] = useState<Record<string, number>>({});
  // Which clip in the timeline is currently selected for trimming/adjustment (asset-level)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  // Which specific instance on the horizontal timeline row is selected (per-position)
  const [selectedTimelineKey, setSelectedTimelineKey] = useState<string | null>(null);
  // Selected clips in the timeline download menu
  const [selectedTimelineClipIds, setSelectedTimelineClipIds] = useState<string[]>([]);
  // Context menu for clips on the timeline
  const [timelineMenu, setTimelineMenu] = useState<
    { index: number; x: number; y: number } | null
  >(null);
  // Currently active blank segment position in the timeline (-1 = before first clip)
  const [activeBlankIndex, setActiveBlankIndex] = useState<number | null>(null);
  // Per-clip visual width multipliers for the timeline (purely visual; does not affect timing)
  const [clipVisualWidths, setClipVisualWidths] = useState<Record<string, number>>({});
  // Per-asset trim in/out points (seconds within original media)
  const [clipTrims, setClipTrims] = useState<Record<string, { start: number; end: number | null }>>({});
  // Per-timeline-instance trim overrides so dragging one instance does not affect others
  const [timelineInstanceTrims, setTimelineInstanceTrims] = useState<
    Record<string, { start: number; end: number | null }>
  >({});
  // Per-gap visual width multipliers for blank segments (index = gap between clips)
  const [blankVisualWidths, setBlankVisualWidths] = useState<Record<number, number>>({});
  // Transitions applied between clips, keyed by gap index
  const [gapTransitions, setGapTransitions] = useState<Record<number, TransitionInstance>>({});
  // Which gap between clips is currently selected for transition editing
  const [activeTransitionIndex, setActiveTransitionIndex] = useState<number | null>(null);
  // Available transition templates (durations adjustable in 0.1s steps)
  const [transitionTemplates, setTransitionTemplates] = useState<TransitionTemplate[]>([
    { id: "fade", label: "Fade", defaultDuration: 0.5 },
    { id: "crossfade", label: "Crossfade", defaultDuration: 0.5 },
    { id: "slide", label: "Slide", defaultDuration: 0.5 },
    { id: "zoom", label: "Zoom", defaultDuration: 0.5 },
    { id: "circle", label: "Circle", defaultDuration: 0.5 },
  ]);

  // Per-clip durations (in seconds), learned from video metadata
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  const [currentTimelineTime, setCurrentTimelineTime] = useState(0);

  // Canvas video playback + timeline play state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Separate HTMLAudioElement used for the timeline's audio track
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeButtonRef = useRef<HTMLButtonElement | null>(null);
  const fadeMenuRef = useRef<HTMLDivElement | null>(null);
  const audioDragRef = useRef<{
    clipId: string;
    mode: "move" | "trim-left" | "trim-right";
    startX: number;
    startTimelineStart: number;
    startSourceStart: number;
    startSourceEnd: number;
    currentTimelineStart?: number;
  } | null>(null);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [playheadIndex, setPlayheadIndex] = useState<number | null>(null);

  // Active tool in the VS Code-style sidebar
  const [activeTool, setActiveTool] = useState<
    | "select"
    | "text"
    | "adjust"
    | "transition"
    | "elements"
    | "timeline"
  >("select");
  // Active tab in the left Canva-style sidebar (Templates, Elements, Uploads, Transitions, ...)
  const [sidebarTab, setSidebarTab] = useState<string>("Elements");

  // Anchors for scrolling when tools are clicked
  const timelineSectionRef = useRef<HTMLDivElement | null>(null);

  function saveCanvasState(nextActiveId: string | null, nextClips: MediaAsset[]) {
    if (typeof window === "undefined") return;
    try {
      const payload = {
        activeAssetId: nextActiveId,
        clipIds: nextClips.map((c) => c.id),
      };
      window.localStorage.setItem("editorCanvasState", JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  // Canvas transform state (drag + scale)
  const [canvasOffset, setCanvasOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(1);
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [isResizingLayer, setIsResizingLayer] = useState(false);
  const [layerSelected, setLayerSelected] = useState(false);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState<string>("#ffffff");
  const [canvasMuted, setCanvasMuted] = useState(true);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{ mouseY: number; startScale: number } | null>(null);
  const textResizeRef = useRef<{
    id: string;
    startMouseY: number;
    startFontSize: number;
  } | null>(null);
  const lastAdvancedClipIdRef = useRef<string | null>(null);
  const advancedEarlyRef = useRef(false);
  const timelineAnimationFrameRef = useRef<number | null>(null);
  const timelineResizeRef = useRef<{
    kind: "clip" | "blank";
    id: string | number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const trimDragRef = useRef<{
    side: "start" | "end";
    clipId: string;
    startX: number;
    startStart: number;
    startEnd: number;
    duration: number;
    cardWidth: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; assetId: string | null; source: "canvas" | "asset" } | null
  >(null);

  // Canvas text overlays
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [lastAddedTextId, setLastAddedTextId] = useState<string | null>(null);
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null);
  const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);

  // Per-clip visual adjustments applied on the canvas video element
  const [clipAdjustments, setClipAdjustments] = useState<Record<string, ClipAdjustments>>({});

  const loadAssets = React.useCallback(async () => {
    setAssetsLoading(true);
    setAssetsError(null);

    try {
      const res = await fetch(
        `${ASSETS_BASE_URL}/api/assets?type=${assetType}&includeTrash=true`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      let rawBody: string | null = null;
      let data: any = null;

      try {
        rawBody = await res.text();
        if (rawBody) {
          try {
            data = JSON.parse(rawBody);
          } catch (jsonErr) {
            console.error("Failed to parse /api/assets JSON:", jsonErr);
          }
        }
      } catch (bodyErr) {
        console.error("Failed to read /api/assets response body:", bodyErr);
      }

      if (!res.ok || !data || data.ok === false) {
        console.error("loadAssets: non-OK response", {
          status: res.status,
          data,
          rawBody,
        });

        const backendError =
          (data && (data.error || data.message)) ||
          rawBody ||
          `Failed to load assets (HTTP ${res.status} ${res.statusText})`;

        setAssetsError(
          typeof backendError === "string"
            ? backendError
            : JSON.stringify(backendError),
        );
        setAssets([]);
        return;
      }

      setAssets(Array.isArray(data.files) ? data.files : []);
    } catch (err: any) {
      console.error("loadAssets failed:", err);
      const message =
        err && typeof err.message === "string"
          ? err.message
          : "Failed to load assets due to an unexpected error.";
      setAssetsError(message);
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [assetType]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  // Rehydrate canvas + timeline state when assets are loaded (e.g. after visiting Trash)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (assetType !== "video" || assets.length === 0) return;

    try {
      const raw = window.localStorage.getItem("editorCanvasState");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        activeAssetId: string | null;
        clipIds?: string[];
      };

      const idToAsset = new Map<string, MediaAsset>();
      for (const a of assets) {
        idToAsset.set(a.id, a);
      }

      const restoredClips: MediaAsset[] = [];
      if (Array.isArray(parsed.clipIds)) {
        for (const id of parsed.clipIds) {
          const a = idToAsset.get(id);
          if (a && a.type === "video" && a.status === "active") {
            restoredClips.push(a);
          }
        }
      }

      if (restoredClips.length) {
        setClips(restoredClips);
      }

      if (parsed.activeAssetId) {
        const active = idToAsset.get(parsed.activeAssetId);
        if (active && active.type === "video" && active.status === "active") {
          setUploadedVideoUrl(active.publicUrl);
          setUploadedVideoName(active.originalName);
          setActiveAssetId(active.id);
          setCanvasOffset({ x: 0, y: 0 });
          setCanvasScale(1);
          setLayerSelected(true);
        }
      }
    } catch {
      // ignore bad localStorage contents
    }
  }, [assets, assetType]);

  // When playing the timeline, update the active clip based on the playhead index
  useEffect(() => {
    if (!isTimelinePlaying) return;
    if (playheadIndex == null) return;
    if (!clips.length) return;

    const index = Math.min(playheadIndex, clips.length - 1);
    const clip = clips[index];
    if (!clip) return;

    setUploadedVideoUrl(clip.publicUrl);
    setUploadedVideoName(clip.originalName);
    setActiveAssetId(clip.id);
    setCanvasOffset({ x: 0, y: 0 });
    setCanvasScale(1);
    setLayerSelected(true);
    saveCanvasState(clip.id, clips);
    // Mark this clip as the one we can advance from during onTimeUpdate
    lastAdvancedClipIdRef.current = clip.id;
    // Reset early-advance flag for this new clip
    advancedEarlyRef.current = false;
  }, [isTimelinePlaying, playheadIndex, clips]);

  // Auto-play the current canvas video (and audio track, if any)
  // when timeline playback is active
  useEffect(() => {
    if (!isTimelinePlaying) {
      // Ensure both media elements are stopped when playback is toggled off
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {
          // ignore
        }
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {
          // ignore
        }
      }
      return;
    }

    if (!videoRef.current) return;

    const el = videoRef.current;
    try {
      // Ensure we are at the start of the current (trimmed) clip when playback begins
      let startOffset = 0;
      if (playheadIndex != null && playheadIndex >= 0 && playheadIndex < clips.length) {
        const clip = clips[playheadIndex];
        const dur = clipDurations[clip.id] ?? 0;
        const trim = clipTrims[clip.id];
        if (dur > 0 && trim) {
          startOffset = Math.max(0, Math.min(trim.start, dur));
        }
      }
      el.currentTime = startOffset;
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          // Safely swallow interrupted play attempts (e.g. rapid pause/seek)
          // so they don't surface as unhandled promise rejections.
          console.log("Play request safely interrupted/prevented:", error?.message ?? String(error));
        });
      }
    } catch {
      // ignore autoplay errors
    }

    // Start the attached audio track (if any) in sync with the
    // visual timeline playback. This uses a simple 1:1 clock so
    // audio and video advance together.
    if (audioTrack?.publicUrl && audioRef.current) {
      const audioEl = audioRef.current;
      try {
        // Let the timeline audio be heard by default, independent
        // of the canvas mute toggle. This avoids the timeline
        // "going silent" as soon as an audio track is attached.
        audioEl.muted = false;
        // src is already bound via JSX; just reset time + play.
        audioEl.currentTime = 0;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.log(
              "Audio play request safely interrupted/prevented:",
              error?.message ?? String(error),
            );
          });
        }
      } catch {
        // ignore audio autoplay issues
      }
    }
  }, [
    isTimelinePlaying,
    uploadedVideoUrl,
    playheadIndex,
    clips,
    clipDurations,
    clipTrims,
    audioTrack,
    canvasMuted,
  ]);

  // Keyboard shortcuts for deleting whole text boxes from the canvas.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedTextBoxId) return;

      const isDeleteKey = e.key === "Backspace" || e.key === "Delete";
      const isCutShortcut =
        (e.key === "x" || e.key === "X") && (e.metaKey || e.ctrlKey);

      if (!isDeleteKey && !isCutShortcut) return;

      e.preventDefault();
      e.stopPropagation();

      setTextBoxes((prev) => prev.filter((tb) => tb.id !== selectedTextBoxId));
      if (lastAddedTextId === selectedTextBoxId) {
        setLastAddedTextId(null);
      }
      // Clear selection outline when the active element is deleted
      setSelectedTextBoxId(null);
      setLayerSelected(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTextBoxId, editingTextBoxId, lastAddedTextId]);

  // Keyboard shortcuts for deleting selected audio clips on the multi-track audio lane.
  useEffect(() => {
    function handleAudioKeyDown(e: KeyboardEvent) {
      if (!selectedAudioClipId) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;

      e.preventDefault();
      e.stopPropagation();

      setAudioClips((prev) => prev.filter((clip) => clip.id !== selectedAudioClipId));
      setSelectedAudioClipId(null);
    }

    window.addEventListener("keydown", handleAudioKeyDown);
    return () => window.removeEventListener("keydown", handleAudioKeyDown);
  }, [selectedAudioClipId]);

  // Global mouse handlers for drag/resize on the canvas layer
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (isDraggingLayer && dragStartRef.current) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        setCanvasOffset({
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        });
      } else if (isResizingLayer && resizeStartRef.current) {
        const dy = e.clientY - resizeStartRef.current.mouseY;
        const nextScale = Math.min(2.5, Math.max(0.5, resizeStartRef.current.startScale + dy * 0.005));
        setCanvasScale(nextScale);
      }

      // Per-element text/element resize when dragging the handle
      const tr = textResizeRef.current;
      if (tr) {
        const dy = e.clientY - tr.startMouseY;
        let nextFont = tr.startFontSize + dy * 0.4;
        nextFont = Math.max(8, Math.min(200, nextFont));
        setTextBoxes((prev) =>
          prev.map((tb) =>
            tb.id === tr.id
              ? {
                  ...tb,
                  fontSize: nextFont,
                }
              : tb,
          ),
        );
      }
    }

    function handleMouseUp() {
      setIsDraggingLayer(false);
      setIsResizingLayer(false);
      dragStartRef.current = null;
      resizeStartRef.current = null;
      textResizeRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLayer, isResizingLayer]);

  // Global mouse handlers for dragging and trimming audio clips on the multi-track audio lane
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = audioDragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startX;
      const deltaSeconds = dx / AUDIO_PIXELS_PER_SECOND;

      setAudioClips((prev) =>
        prev.map((clip) => {
          if (clip.id !== drag.clipId) return clip;

          const minLength = 0.1;
          if (drag.mode === "move") {
            let nextTimelineStart = drag.startTimelineStart + deltaSeconds;
            if (nextTimelineStart < 0) nextTimelineStart = 0;

            // Track the most recent tentative start time so mouseup can snap
            if (audioDragRef.current && audioDragRef.current.clipId === clip.id) {
              audioDragRef.current.currentTimelineStart = nextTimelineStart;
            }

            return { ...clip, timelineStart: nextTimelineStart };
          }

          if (drag.mode === "trim-left") {
            let nextSourceStart = drag.startSourceStart + deltaSeconds;
            // Clamp so start never crosses end - minLength and never goes below 0
            const maxSourceStart = clip.sourceEnd - minLength;
            nextSourceStart = Math.max(0, Math.min(nextSourceStart, maxSourceStart));

            const appliedDelta = nextSourceStart - drag.startSourceStart;
            let nextTimelineStart = drag.startTimelineStart + appliedDelta;
            if (nextTimelineStart < 0) nextTimelineStart = 0;

            if (audioDragRef.current && audioDragRef.current.clipId === clip.id) {
              audioDragRef.current.currentTimelineStart = nextTimelineStart;
            }

            return {
              ...clip,
              sourceStart: nextSourceStart,
              timelineStart: nextTimelineStart,
            };
          }

          if (drag.mode === "trim-right") {
            let nextSourceEnd = drag.startSourceEnd + deltaSeconds;
            const minEnd = clip.sourceStart + minLength;
            const maxEnd =
              clip.originalDuration > 0
                ? clip.originalDuration
                : Math.max(clip.sourceEnd, minEnd);
            nextSourceEnd = Math.max(minEnd, Math.min(nextSourceEnd, maxEnd));

            return {
              ...clip,
              sourceEnd: nextSourceEnd,
            };
          }

          return clip;
        }),
      );
    }

    function handleMouseUp() {
      const drag = audioDragRef.current;

      // When a clip has been moved, snap its start time to the nearest
      // video clip boundary (start or end) if it was dropped over a clip.
      if (drag && drag.mode === "move") {
        const finalStart =
          typeof drag.currentTimelineStart === "number"
            ? drag.currentTimelineStart
            : drag.startTimelineStart;

        let snappedStart = finalStart;
        if (clips.length > 0) {
          let accum = 0;
          for (let i = 0; i < clips.length; i++) {
            const dur = getClipTimelineDuration(clips[i].id);
            const start = accum;
            const end = accum + dur;
            if (finalStart >= start && finalStart <= end) {
              const mid = (start + end) / 2;
              snappedStart = finalStart < mid ? start : end;
              break;
            }
            accum = end;
          }
        }

        if (snappedStart !== finalStart) {
          setAudioClips((prev) =>
            prev.map((clip) =>
              clip.id === drag.clipId
                ? { ...clip, timelineStart: snappedStart }
                : clip,
            ),
          );
        }
      }

      if (audioDragRef.current) {
        audioDragRef.current = null;
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setAudioClips, clips, getClipTimelineDuration]);

  // Global mouse handlers for resizing timeline clip/blank widths (purely visual)
  // and trimming clips (in/out handles)
  useEffect(() => {
    function handleTimelineMouseMove(e: MouseEvent) {
      const resizeInfo = timelineResizeRef.current;
      const trimInfo = trimDragRef.current;
      if (!resizeInfo && !trimInfo) return;

      if (resizeInfo) {
        const baseWidth = resizeInfo.kind === "clip" ? 120 : 80; // px per width unit
        const dx = e.clientX - resizeInfo.startX;
        const deltaUnits = dx / baseWidth;
        let nextUnits = resizeInfo.startWidth + deltaUnits;
        // Clamp so segments don't vanish or become absurdly wide
        nextUnits = Math.max(0.5, Math.min(4, nextUnits));

        if (resizeInfo.kind === "clip") {
          setClipVisualWidths((prev) => ({
            ...prev,
            [resizeInfo.id as string]: nextUnits,
          }));
        } else {
          setBlankVisualWidths((prev) => ({
            ...prev,
            [resizeInfo.id as number]: nextUnits,
          }));
        }
      }

      if (trimInfo) {
        const { side, clipId, startX, startStart, startEnd, duration, cardWidth } = trimInfo;
        if (!duration || !cardWidth) return;

        // Only allow trimming updates to affect the currently selected clip.
        if (selectedClipId && clipId !== selectedClipId) {
          return;
        }

        const dx = e.clientX - startX;
        const currentTrimmed = Math.max(0.1, startEnd - startStart);
        const secondsPerPixel =
          currentTrimmed > 0 ? currentTrimmed / cardWidth : duration / cardWidth;
        const deltaSeconds = dx * secondsPerPixel;
        // Tiny buffer so the clip never collapses completely; otherwise
        // dragging is free and continuous.
        const minLen = 1;

        let newStart = startStart;
        let newEnd = startEnd;

        if (side === "start") {
          newStart = startStart + deltaSeconds;
          newStart = Math.max(0, Math.min(newStart, newEnd - minLen));
        } else {
          newEnd = startEnd + deltaSeconds;
          newEnd = Math.min(duration, Math.max(newEnd, newStart + minLen));
        }

        const clampedStart = Math.max(0, Math.min(newStart, duration));
        const clampedEnd = Math.max(0, Math.min(newEnd, duration));

        setClipTrims((prev) => ({
          ...prev,
          [clipId]: {
            start: clampedStart,
            end: clampedEnd,
          },
        }));

        // Notify backend about the updated trim for this clip
        void sendTrimToBackend(clampedStart, clampedEnd);

        // Strict snapping: lock playhead + preview to the active trim edge
        const clipIndex = clips.findIndex((c) => c.id === clipId);
        if (clipIndex >= 0) {
          let offsetBefore = 0;
          for (let i = 0; i < clipIndex; i++) {
            const cid = clips[i]?.id;
            if (cid) {
              offsetBefore += getClipTimelineDuration(cid);
            }
          }

          const clipTimelineDuration = Math.max(0, clampedEnd - clampedStart);
          const startOnTimeline = offsetBefore;
          const endOnTimeline = offsetBefore + clipTimelineDuration;

          const targetTimelineTime = side === "start" ? startOnTimeline : endOnTimeline;
          setCurrentTimelineTime(targetTimelineTime);

          const videoEl = videoRef.current;
          if (videoEl) {
            const targetMediaTime = side === "start" ? clampedStart : clampedEnd;
            try {
              videoEl.currentTime = targetMediaTime;
            } catch {
              // ignore seek errors
            }
          }
        }
      }
    }

    function handleTimelineMouseUp() {
      if (timelineResizeRef.current) {
        timelineResizeRef.current = null;
      }
      if (trimDragRef.current) {
        trimDragRef.current = null;
      }
    }

    window.addEventListener("mousemove", handleTimelineMouseMove);
    window.addEventListener("mouseup", handleTimelineMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleTimelineMouseMove);
      window.removeEventListener("mouseup", handleTimelineMouseUp);
    };
  }, [selectedClipId, clips, setCurrentTimelineTime, videoRef, getClipTimelineDuration, clipDurations, clipTrims]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;

    function handleClickAway() {
      setContextMenu(null);
    }

    window.addEventListener("click", handleClickAway);

    return () => {
      window.removeEventListener("click", handleClickAway);
    };
  }, [contextMenu]);

  // Close timeline context menu when clicking elsewhere
  useEffect(() => {
    if (!timelineMenu) return;

    function handleClickAway() {
      setTimelineMenu(null);
    }

    window.addEventListener("click", handleClickAway);

    return () => {
      window.removeEventListener("click", handleClickAway);
    };
  }, [timelineMenu]);

  // Close fade menu when clicking away
  useEffect(() => {
    if (!fadeMenuOpen) return;

    function handleClickAway(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        fadeMenuRef.current &&
        !fadeMenuRef.current.contains(target) &&
        !(fadeButtonRef.current && fadeButtonRef.current.contains(target))
      ) {
        setFadeMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickAway);

    return () => {
      window.removeEventListener("mousedown", handleClickAway);
    };
  }, [fadeMenuOpen]);

  // Close audio context menu when clicking elsewhere
  useEffect(() => {
    if (!audioContextMenu) return;

    function handleClickAway() {
      setAudioContextMenu(null);
    }

    window.addEventListener("click", handleClickAway);

    return () => {
      window.removeEventListener("click", handleClickAway);
    };
  }, [audioContextMenu]);

  // Ensure fade menu closes when no audio clip is selected
  useEffect(() => {
    if (!selectedAudioClipId) {
      setFadeMenuOpen(false);
    }
  }, [selectedAudioClipId]);

  async function handleAssetUpload(file: File) {
    try {
      setAssetsError(null);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", assetType);

      // Show video on canvas immediately
      if (assetType === "video") {
        const localUrl = URL.createObjectURL(file);
        setUploadedVideoUrl(localUrl);
        setUploadedVideoName(file.name);
        setCanvasOffset({ x: 0, y: 0 });
        setCanvasScale(1);
        setLayerSelected(false);
      }

      const res = await fetch(`${ASSETS_BASE_URL}/api/assets/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      let rawBody: string | null = null;
      let data: any = null;
      try {
        rawBody = await res.text();
        if (rawBody) {
          try {
            data = JSON.parse(rawBody);
          } catch (jsonErr) {
            console.error("Failed to parse /api/assets/upload JSON:", jsonErr);
          }
        }
      } catch (bodyErr) {
        console.error("Failed to read /api/assets/upload response body:", bodyErr);
      }

      if (!res.ok || !data?.ok) {
        console.error("handleAssetUpload: non-OK response", {
          status: res.status,
          data,
          rawBody,
        });

        const backendError =
          (data && (data.error || data.message)) ||
          rawBody ||
          `Upload failed (HTTP ${res.status} ${res.statusText})`;

        setAssetsError(
          typeof backendError === "string"
            ? backendError
            : JSON.stringify(backendError),
        );
        return;
      }

      const asset: MediaAsset = data.file;
      setAssets((prev) => [asset, ...prev]);

      // Once upload completes, bind the stored asset appropriately
      if (asset.type === "video") {
        setUploadedVideoUrl(asset.publicUrl);
        setUploadedVideoName(asset.originalName);
        setActiveAssetId(asset.id);
        setCanvasOffset({ x: 0, y: 0 });
        setCanvasScale(1);
        setLayerSelected(true);
      } else if (asset.type === "audio") {
        // Automatically attach uploaded audio to the timeline's audio track
        setAudioTrack(asset);
        setBeatMarkers([]);
        const baseDuration = asset.durationSeconds ?? 0;
        const duration = baseDuration > 0 ? baseDuration : 0;
        const clipId = `audio-clip-${asset.id}-${Date.now()}`;
        const initialClip: AudioClip = {
          id: clipId,
          publicUrl: asset.publicUrl,
          originalDuration: duration,
          sourceStart: 0,
          sourceEnd: duration,
          timelineStart: 0,
        };
        setAudioClips([initialClip]);
        setSelectedAudioClipId(clipId);
        setAudioTrackDuration(duration || null);
      }
    } catch (err: any) {
      console.error(err);
      const message =
        err && typeof err.message === "string"
          ? err.message
          : "Upload failed due to an unexpected error.";
      setAssetsError(message);
    }
  }

  async function handleTrashAsset(id: string) {
    try {
      const res = await fetch(`${ASSETS_BASE_URL}/api/assets/${id}/trash`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setAssetsError(data?.error || "Could not move to trash.");
        return;
      }
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "trashed", trashedAt: new Date().toISOString() } : a)),
      );

      // If this asset is the active audio track, clear it
      if (audioTrack && audioTrack.id === id) {
        setAudioTrack(null);
        setBeatMarkers([]);
        setAudioClips([]);
        setSelectedAudioClipId(null);
        setAudioTrackDuration(null);
      }

      // Remove this clip from the timeline and update saved state
      setClips((prev) => {
        const next = prev.filter((clip) => clip.id !== id);
        const nextActiveId = activeAssetId === id ? null : activeAssetId;
        saveCanvasState(nextActiveId, next);
        return next;
      });

      // If the trashed asset is currently on the canvas, clear it
      if (activeAssetId === id) {
        setUploadedVideoUrl(null);
        setUploadedVideoName(null);
        setActiveAssetId(null);
        setCanvasOffset({ x: 0, y: 0 });
        setCanvasScale(1);
        setLayerSelected(false);
      }
    } catch (err) {
      console.error(err);
      setAssetsError("Could not move to trash.");
    }
  }

  async function handleRestoreAsset(id: string) {
    try {
      const res = await fetch(`${ASSETS_BASE_URL}/api/assets/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setAssetsError(data?.error || "Could not restore file.");
        return;
      }
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "active", trashedAt: null } : a)),
      );
    } catch (err) {
      console.error(err);
      setAssetsError("Could not restore file.");
    }
  }

  async function handleDeleteAsset(id: string) {
    try {
      const res = await fetch(`${ASSETS_BASE_URL}/api/assets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setAssetsError(data?.error || "Could not delete file.");
        return;
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));

      // If this asset is the active audio track, clear it
      if (audioTrack && audioTrack.id === id) {
        setAudioTrack(null);
        setBeatMarkers([]);
        setAudioClips([]);
        setSelectedAudioClipId(null);
        setAudioTrackDuration(null);
      }

      // Remove this clip from the timeline and update saved state
      setClips((prev) => {
        const next = prev.filter((clip) => clip.id !== id);
        const nextActiveId = activeAssetId === id ? null : activeAssetId;
        saveCanvasState(nextActiveId, next);
        return next;
      });

      // If the deleted asset was on the canvas, clear it
      if (activeAssetId === id) {
        setUploadedVideoUrl(null);
        setUploadedVideoName(null);
        setActiveAssetId(null);
        setCanvasOffset({ x: 0, y: 0 });
        setCanvasScale(1);
        setLayerSelected(false);
      }
    } catch (err) {
      console.error(err);
      setAssetsError("Could not delete file.");
    }
  }

  function advanceToNextClip() {
    if (!isTimelinePlaying) return;
    if (!clips.length) return;

    setPlayheadIndex((prev) => {
      const currentIndex =
        prev != null
          ? prev
          : activeAssetId
          ? clips.findIndex((c) => c.id === activeAssetId)
          : 0;

      if (currentIndex == null || currentIndex < 0) return null;

      const next = currentIndex + 1;
      if (next >= clips.length) {
        // We just finished the final clip; snap the global
        // timeline time to the very end so the white playhead
        // visually reaches the edge of the last block.
        const finalDuration = clips.reduce(
          (acc, clip) => acc + getClipTimelineDuration(clip.id),
          0,
        );
        setCurrentTimelineTime(finalDuration);
        setIsTimelinePlaying(false);
        return null;
      }

      return next;
    });
  }

  function handlePlayTimelineToggle() {
    if (!clips.length) return;

    if (isTimelinePlaying) {
      setIsTimelinePlaying(false);
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch (error) {
          console.log(
            "Pause during timeline toggle encountered an error:",
            (error as Error)?.message ?? String(error),
          );
        }
      }
      return;
    }

    // Start playback from wherever the playhead currently is.
    // This respects any snapping (handles, clicks on clips, ruler).
    let startIndex = 0;
    let localTimeInClip = 0;

    if (totalTimelineDuration > 0 && clips.length > 0) {
      const clampedTime = Math.max(0, Math.min(currentTimelineTime, totalTimelineDuration));

      let accum = 0;
      for (let i = 0; i < clips.length; i++) {
        const dur = getClipTimelineDuration(clips[i].id);
        if (clampedTime < accum + dur || i === clips.length - 1) {
          startIndex = i;
          localTimeInClip = Math.max(0, clampedTime - accum);
          break;
        }
        accum += dur;
      }
    }

    setPlayheadIndex(startIndex);
    // Reset advancement marker for the first clip
    lastAdvancedClipIdRef.current = null;
    advancedEarlyRef.current = false;
    setIsTimelinePlaying(true);
  }

  function handleInsertBlank(index: number) {
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setActiveAssetId(null);
    setCanvasOffset({ x: 0, y: 0 });
    setCanvasScale(1);
    setLayerSelected(false);
    setActiveBlankIndex(index);
    saveCanvasState(null, clips);
  }

  function handleAppendBlankClip() {
    const blankId = `blank-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const blankAsset: MediaAsset = {
      id: blankId,
      userId: 0,
      type: "video",
      originalName: "Blank 5s",
      mimeType: "video/mp4",
      sizeBytes: 0,
      storageKey: "",
      publicUrl: "",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      trashedAt: null,
      deletedAt: null,
    };

    setClips((prev) => {
      const next = [...prev, blankAsset];
      saveCanvasState(activeAssetId, next);
      return next;
    });

    setClipDurations((prev) => ({
      ...prev,
      [blankId]: 5,
    }));

    setClipTrims((prev) => ({
      ...prev,
      [blankId]: { start: 0, end: 5 },
    }));
  }

  function handleInsertBlankAtGap(gapIndex: number) {
    const blankId = `blank-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const blankAsset: MediaAsset = {
      id: blankId,
      userId: 0,
      type: "video",
      originalName: "Blank 5s",
      mimeType: "video/mp4",
      sizeBytes: 0,
      storageKey: "",
      publicUrl: "",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      trashedAt: null,
      deletedAt: null,
    };

    setClips((prev) => {
      const next = [...prev];
      const insertIndex = Math.min(Math.max(gapIndex + 1, 0), next.length);
      next.splice(insertIndex, 0, blankAsset);
      saveCanvasState(activeAssetId, next);
      return next;
    });

    setClipDurations((prev) => ({
      ...prev,
      [blankId]: 5,
    }));

    setClipTrims((prev) => ({
      ...prev,
      [blankId]: { start: 0, end: 5 },
    }));
  }

  function addCenteredTextBox() {
    const id = `text-${Date.now()}`;
    setLastAddedTextId(id);
    setTextBoxes((prev) => [
      ...prev,
      {
        id,
        xPercent: 50,
        yPercent: 50,
        text: "Your text",
        fontSize: 24,
        fontWeight: "bold",
      },
    ]);
  }

  function handleAddElementStickerFromSidebar(emoji: string) {
    const id = `text-${Date.now()}`;
    const newSticker: TextBox = {
      id,
      xPercent: 50,
      yPercent: 50,
      text: emoji,
      fontSize: 40,
      fontWeight: "normal",
    };
    console.log("Sticker Added:", newSticker);
    setLastAddedTextId(id);
    setTextBoxes((prev) => [...prev, newSticker]);
  }

  function handleAddTextLayerFromSidebar(
    tier: "heading" | "subheading" | "body",
  ) {
    const id = `text-${Date.now()}`;
    setLastAddedTextId(id);

    const config =
      tier === "heading"
        ? { text: "Add heading text", fontSize: 36, fontWeight: "bold" as const }
        : tier === "subheading"
        ? { text: "Add subheading", fontSize: 24, fontWeight: "bold" as const }
        : { text: "Add body text", fontSize: 14, fontWeight: "normal" as const };

    setTextBoxes((prev) => [
      ...prev,
      {
        id,
        xPercent: 50,
        yPercent: 50,
        text: config.text,
        fontSize: config.fontSize,
        fontWeight: config.fontWeight,
      },
    ]);
  }

  function handleApplyTemplateFromSidebar(templateId: string) {
    const nowIso = new Date().toISOString();

    const makeBlank = (index: number): MediaAsset => ({
      id: `tmpl-${templateId}-blank-${Date.now()}-${index}`,
      userId: 0,
      type: "video",
      originalName: `Template ${templateId} Segment ${index + 1}`,
      mimeType: "video/mp4",
      sizeBytes: 0,
      storageKey: "",
      publicUrl: "",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      trashedAt: null,
      deletedAt: null,
    });

    const newClips = [makeBlank(0), makeBlank(1), makeBlank(2)];

    setClips(newClips);

    setClipDurations((prev) => {
      const next = { ...prev };
      for (const clip of newClips) {
        next[clip.id] = 5;
      }
      return next;
    });

    setClipTrims((prev) => {
      const next = { ...prev };
      for (const clip of newClips) {
        next[clip.id] = { start: 0, end: 5 };
      }
      return next;
    });

    saveCanvasState(activeAssetId, newClips);
  }

  function handleOpenProjectFromSidebar(projectId: string) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("editorCanvasState");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        activeAssetId: string | null;
        clipIds?: string[];
      };

      const idToAsset = new Map<string, MediaAsset>();
      for (const a of assets) {
        if (a.type === "video" && a.status === "active") {
          idToAsset.set(a.id, a);
        }
      }

      const restoredClips: MediaAsset[] = [];
      if (Array.isArray(parsed.clipIds)) {
        for (const id of parsed.clipIds) {
          const a = idToAsset.get(id);
          if (a) restoredClips.push(a);
        }
      }

      if (restoredClips.length) {
        setClips(restoredClips);
        saveCanvasState(parsed.activeAssetId, restoredClips);
      }
    } catch {
      // ignore
    }
  }

  function handleAssetSelect(asset: MediaAsset) {
    if (asset.type === "video") {
      // Show video on the canvas
      setUploadedVideoUrl(asset.publicUrl);
      setUploadedVideoName(asset.originalName);
      setActiveAssetId(asset.id);
      setSelectedClipId(asset.id);
      setCanvasOffset({ x: 0, y: 0 });
      setCanvasScale(1);
      setLayerSelected(true);
      setActiveBlankIndex(null);

      // Also add this clip to the simple timeline view and persist state
      setClips((prev) => {
        const next = [...prev, asset];
        saveCanvasState(asset.id, next);
        return next;
      });

      // Auto-close the left sidebar drawer after placing a clip
      // so the user sees more of the canvas/timeline.
      setSidebarTab("");
    } else if (asset.type === "audio") {
      // Use this asset as the active audio track for the timeline
      setAudioTrack(asset);
      setBeatMarkers([]);

      const baseDuration = asset.durationSeconds ?? 0;
      const duration = baseDuration > 0 ? baseDuration : 0;
      const clipId = `audio-clip-${asset.id}-${Date.now()}`;
      const initialClip: AudioClip = {
        id: clipId,
        publicUrl: asset.publicUrl,
        originalDuration: duration,
        sourceStart: 0,
        sourceEnd: duration,
        timelineStart: 0,
      };
      setAudioClips([initialClip]);
      setSelectedAudioClipId(clipId);
      setAudioTrackDuration(duration || null);

      // Auto-close the drawer after selecting an audio track.
      setSidebarTab("");
    }
  }

  function handleFilterAssetsFromSidebar(query: string, category?: AssetType) {
    console.log("Filter assets from sidebar:", { query, category });
    if (category) {
      setAssetType(category);
    }
    setAssetFilterQuery(query);
    setSidebarTab("Uploads");
  }

  function handleSelectPromptPresetFromSidebar(promptText: string) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("creationPromptFromEditor", promptText);
      } catch {
        // ignore storage errors
      }
    }
    router.push("/creation");
  }

  function makeSafeBaseName(raw: string | null | undefined, fallback: string): string {
    const base = (raw || fallback).trim();
    return (
      base
        .replace(/\.[^/.]+$/, "") // remove extension
        .replace(/[^A-Za-z0-9_-]+/g, "_") // replace unsafe chars
        .replace(/_+/g, "_") // collapse multiple underscores
        .replace(/^_+|_+$/g, "") // trim underscores
      || fallback
    );
  }

  async function handleExport() {
    if (!uploadedVideoUrl) {
      setExportStatus("Upload a video before exporting.");
      return;
    }

    if (uploadedVideoUrl.startsWith("blob:")) {
      setExportStatus(
        "This video is only loaded locally. Please wait for the upload to finish or use a stored video from Assets before exporting.",
      );
      return;
    }

    setExportMenuOpen(false);

    let targetExportType: "video" | "audio" | "image" = "video";
    let targetAudioFormat: "mp3" | "wav" | "aac" = audioFormat;
    let targetImageFormat: "jpeg" | "png" = imageFormat;

    if (exportFormat === "mp4") {
      targetExportType = "video";
    } else if (exportFormat === "mp3") {
      targetExportType = "audio";
      targetAudioFormat = "mp3";
    } else if (exportFormat === "wav") {
      targetExportType = "audio";
      targetAudioFormat = "wav";
    } else if (exportFormat === "jpeg") {
      targetExportType = "image";
      targetImageFormat = "jpeg";
    } else if (exportFormat === "png") {
      targetExportType = "image";
      targetImageFormat = "png";
    }

    setExportStatus("Preparing export...");

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportType: targetExportType,
          audioFormat: targetAudioFormat,
          imageFormat: targetImageFormat,
          bitrate,
          jpegQuality,
          pngScale,
          destination,
          sourceUrl: uploadedVideoUrl,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("The server returned a plain text error:", errorText);
        throw new Error(errorText);
      }

      const data = await res.json();

      if (!data?.ok) {
        setExportStatus(data?.message || "Export failed. Please try again.");
        return;
      }

      const downloadUrl: string | null = data.downloadUrl ?? null;

      if (!downloadUrl) {
        setExportStatus(data.message || "Export request received. Waiting for processing.");
        return;
      }

      if (destination === "download") {
        try {
          const fileRes = await fetch(downloadUrl);
          if (!fileRes.ok) {
            setExportStatus("Download failed.");
            return;
          }

          const blob = await fileRes.blob();
          const objectUrl = URL.createObjectURL(blob);

          const link = document.createElement("a");
          link.href = objectUrl;
          const baseName = makeSafeBaseName(uploadedVideoName, "export");
          link.download =
            targetExportType === "audio"
              ? `${baseName}_audio.${targetAudioFormat}`
              : targetExportType === "image"
              ? `${baseName}_frame.${targetImageFormat}`
              : `${baseName}_video.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);

          setExportStatus("Download started.");
        } catch (err) {
          console.error(err);
          setExportStatus("Download failed.");
        }
      } else {
        setExportStatus("Export completed.");
      }
    } catch (err) {
      console.error(err);
      setExportStatus("Export failed. Please try again.");
    }
  }

  async function sendTrimToBackend(start: number, end: number): Promise<void> {
    try {
      await fetch(`${API_BASE}/trim-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_time: start,
          end_time: end,
        }),
      });
    } catch (err) {
      // For now, just log; trimming should still work even if this fails
      console.error("Failed to send trim to backend", err);
    }
  }

  const [allTimelineChecked, setAllTimelineChecked] = useState(false);

  function toggleSelectAllTimelineClips(checked: boolean) {
    setAllTimelineChecked(checked);
    if (checked) {
      // Select every clip currently in the timeline
      setSelectedTimelineClipIds(clips.map((c) => c.id));
    } else {
      // Clear all selections
      setSelectedTimelineClipIds([]);
    }
  }

  function toggleSelectSingleTimelineClip(id: string) {
    // Multi-select behavior: clicking a clip toggles just that clip.
    // Also clear the "All" checkbox so it only reflects explicit user clicks.
    setSelectedTimelineClipIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // Any manual change to individual clips turns off the "All" visual state
      setAllTimelineChecked(false);
      return next;
    });
  }

  async function downloadAssetFile(asset: MediaAsset) {
    if (!asset.publicUrl) return;
    try {
      const res = await fetch(asset.publicUrl, { credentials: "include" });
      if (!res.ok) return;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      const baseName = makeSafeBaseName(asset.originalName, "clip");
      link.download = `${baseName}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore
    }
  }

  async function handleDownloadAllTimelineClips() {
    // For the "All + MP4" path, always export the full ordered timeline.
    const clipsToUse = clips.filter((clip) => !!clip.publicUrl);

    if (!clipsToUse.length) {
      setExportStatus("No downloadable clips found on the timeline.");
      return;
    }

    try {
      setExportStatus("Preparing timeline export...");

      const res = await fetch("/api/export-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrls: clipsToUse.map((c) => c.publicUrl),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data.downloadUrl) {
        console.error("Timeline export failed", { status: res.status, data });
        setExportStatus(data?.message || "Timeline export failed.");
        return;
      }

      const baseName = makeSafeBaseName(clipsToUse[0]?.originalName, "timeline");

      try {
        const fileRes = await fetch(data.downloadUrl);
        if (!fileRes.ok) {
          setExportStatus("Timeline download failed.");
          return;
        }

        const blob = await fileRes.blob();
        const objectUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${baseName}_timeline.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);

        setExportStatus("Timeline download started.");
        // Once the download has been triggered successfully, close the menu.
        setExportMenuOpen(false);
      } catch (err) {
        console.error(err);
        setExportStatus("Timeline download failed.");
      }
    } catch (err) {
      console.error(err);
      setExportStatus("Timeline export failed.");
    }
  }

  async function handleDownloadFromMenu() {
    if (!clips.length) return;

    // Helper to resolve the single target clip from selection state
    const resolveSingleTarget = (): MediaAsset | undefined => {
      let target: MediaAsset | undefined;

      if (selectedTimelineClipIds.length === 1) {
        const id = selectedTimelineClipIds[0];
        target = clips.find((c) => c.id === id);
      }

      if (!target && selectedClipId) {
        target = clips.find((c) => c.id === selectedClipId);
      }

      return target;
    };

    // Condition A/B/C: Single clip
    if (downloadScope === "single") {
      const target = resolveSingleTarget();
      if (!target) {
        setExportStatus("Select a clip on the timeline to download.");
        return;
      }

      if (downloadFormat === "mp4") {
        // Condition A: Single + MP4 – download original asset
        await downloadAssetFile(target);
        return;
      }

      if (downloadFormat === "mp3" || downloadFormat === "wav") {
        // Single + MP3/WAV – use the generic export endpoint
        try {
          setExportStatus("Exporting audio...");
          const res = await fetch("/api/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exportType: "audio",
              audioFormat: downloadFormat,
              imageFormat: imageFormat,
              bitrate,
              jpegQuality,
              pngScale,
              destination: "download",
              sourceUrl: target.publicUrl,
            }),
          });

          const data = await res.json().catch(() => null);

          if (!res.ok || !data?.downloadUrl) {
            setExportStatus("Audio export failed.");
            return;
          }

          const fileRes = await fetch(data.downloadUrl);
          if (!fileRes.ok) {
            setExportStatus("Audio download failed.");
            return;
          }

          const blob = await fileRes.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const baseName = makeSafeBaseName(target.originalName, "audio");
          link.href = objectUrl;
          link.download = `${baseName}.${downloadFormat}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);

          setExportStatus("Audio download started.");
        } catch (err) {
          console.error(err);
          setExportStatus("Audio export failed.");
        }

        return;
      }

      // Condition C: Single + PNG/JPEG – call /api/export-frame on Flask backend
      const full = clipDurations[target.id] ?? target.durationSeconds ?? 0;
      const trim = clipTrims[target.id];
      let start = 0;
      let end = full;

      if (trim && full > 0) {
        start = Math.max(0, Math.min(trim.start, full));
        end = Math.max(start, Math.min(trim.end ?? full, full));
      }

      const length = Math.max(0, end - start);
      const midTime = start + (length > 0 ? length / 2 : 0);

      try {
        setExportStatus("Exporting frame...");
        const res = await fetch(`${API_BASE}/api/export-frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_url: target.publicUrl,
            time: midTime,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.url) {
          setExportStatus("Frame export failed.");
          return;
        }

        const fileRes = await fetch(data.url);
        if (!fileRes.ok) {
          setExportStatus("Frame download failed.");
          return;
        }

        const blob = await fileRes.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const baseName = makeSafeBaseName(target.originalName, "frame");
        link.href = objectUrl;
        // Backend currently returns PNG; we map to the requested
        // extension for convenience.
        const ext = downloadFormat === "jpeg" ? "jpeg" : "png";
        link.download = `${baseName}_frame.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);

        setExportStatus("Frame download started.");
      } catch (err) {
        console.error(err);
        setExportStatus("Frame export failed.");
      }

      return;
    }

    // Condition D/E: All clips
    if (downloadFormat === "mp4") {
      // Condition D: All + MP4 – use existing stitched timeline export
      await handleDownloadAllTimelineClips();
      return;
    }

    // Any non-MP4 "All" export is not supported yet.
    setExportStatus("All clips is only supported for MP4 video exports right now.");
  }

  const hasVideo = !!uploadedVideoUrl;
  const activeSpeedClip = React.useMemo(() => {
    if (!clips.length) return null;

    if (selectedTimelineClipIds.length === 1) {
      const id = selectedTimelineClipIds[0];
      return clips.find((c) => c.id === id) || null;
    }

    if (activeAssetId) {
      return clips.find((c) => c.id === activeAssetId) || clips[0] || null;
    }

    return clips[0] || null;
  }, [clips, selectedTimelineClipIds, activeAssetId]);

  const activeSpeed =
    activeSpeedClip
      ? clipSpeeds[activeSpeedClip.id] ??
        (typeof activeSpeedClip.speed === "number" ? activeSpeedClip.speed : 1)
      : 1;

  const activeAssets = assets.filter((a) => a.type === assetType && a.status === "active");
  const trashedAssets = assets.filter((a) => a.status === "trashed");
  const trashedVideoAssets = trashedAssets.filter((a) => a.type === "video");

  const defaultAdjustments: ClipAdjustments = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    exposure: 100,
    highlights: 100,
    warmth: 0,
    vignette: 0,
  };
  const currentClipIdForAdjust = selectedClipId || activeAssetId || null;
  const currentAdjustments: ClipAdjustments =
    (currentClipIdForAdjust && clipAdjustments[currentClipIdForAdjust]) ||
    defaultAdjustments;

  function getClipTimelineDuration(id: string): number {
    const full = clipDurations[id] ?? 0;
    if (!full) return 0;

    const trim = clipTrims[id];
    let effective = full;

    if (trim) {
      const start = Math.max(0, Math.min(trim.start, full));
      const end = trim.end != null ? Math.max(start, Math.min(trim.end, full)) : full;
      effective = Math.max(0, end - start);
    }

    // Apply per-clip speed so that faster clips visually compress
    // and slower clips expand on the timeline. A 2.0x clip occupies
    // half the horizontal space of a 1.0x clip with the same trimmed
    // duration.
    const speed = clipSpeeds[id] ?? 1;
    const safeSpeed = speed > 0 ? speed : 1;

    return effective / safeSpeed;
  }

  const totalTimelineDuration = clips.reduce(
    (acc, clip) => acc + getClipTimelineDuration(clip.id),
    0,
  );
  const anyMissingDurations = clips.some((clip) => !(clipDurations[clip.id] > 0));
  const layoutZoomScale = Math.max(1, Math.min(zoomLevel, 5));

  const audioTimelineDuration = React.useMemo(() => {
    if (!audioClips.length && totalTimelineDuration > 0) {
      return totalTimelineDuration;
    }
    let max = totalTimelineDuration;
    for (const clip of audioClips) {
      const length = Math.max(0, clip.sourceEnd - clip.sourceStart);
      const end = clip.timelineStart + length;
      if (end > max) max = end;
    }
    return max > 0 ? max : 0;
  }, [audioClips, totalTimelineDuration]);

  const pixelsPerSecond = AUDIO_PIXELS_PER_SECOND;

  // Compute where the currently active clip sits on the global timeline, in
  // 0–1 ratios, so we can render a purple highlight track that exactly
  // matches its trimmed duration.
  let activeHighlightStartRatio = 0;
  let activeHighlightWidthRatio = 0;
  if (totalTimelineDuration > 0 && activeAssetId) {
    let accumulated = 0;
    for (const clip of clips) {
      const dur = getClipTimelineDuration(clip.id);
      if (clip.id === activeAssetId) {
        activeHighlightStartRatio = accumulated / totalTimelineDuration;
        activeHighlightWidthRatio = dur / totalTimelineDuration;
        break;
      }
      accumulated += dur;
    }
  }

  let timelineProgress = 0;
  if (!clips.length) {
    timelineProgress = 0;
  } else if (totalTimelineDuration > 0 && !anyMissingDurations) {
    // Ideal case: we know the duration of every clip, so we can
    // compute global progress from the accumulated timeline time.
    timelineProgress = Math.min(
      1,
      Math.max(0, currentTimelineTime / totalTimelineDuration),
    );
  } else {
    // Fallback: before we know all clip durations, approximate based
    // on clip index and the local time of the current video. This
    // keeps the white playhead moving at a steady pace and avoids it
    // "racing" to the end of the bar.
    let currentIndex = 0;
    if (isTimelinePlaying && playheadIndex != null) {
      currentIndex = Math.min(
        Math.max(playheadIndex, 0),
        clips.length - 1,
      );
    } else if (activeAssetId) {
      const idx = clips.findIndex((c) => c.id === activeAssetId);
      if (idx >= 0) currentIndex = idx;
    }

    const currentClip = clips[currentIndex];
    const currentDur = currentClip ? clipDurations[currentClip.id] ?? 0 : 0;
    const currentVideoTime = videoRef.current?.currentTime ?? 0;
    const localFraction =
      currentDur > 0
        ? Math.min(1, Math.max(0, currentVideoTime / currentDur))
        : 0;

    timelineProgress =
      (currentIndex + localFraction) / Math.max(clips.length, 1);
  }

  // Sync the HTML5 video playbackRate with the current clip's speed as
  // a safety net; the animation loop also enforces this each frame.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let currentId: string | null = null;
    if (playheadIndex != null && playheadIndex >= 0 && playheadIndex < clips.length) {
      currentId = clips[playheadIndex]?.id ?? null;
    } else if (activeAssetId) {
      currentId = activeAssetId;
    }

    const activeClip = currentId ? clips.find((c) => c.id === currentId) : undefined;
    const speedRaw =
      (activeClip && typeof activeClip.speed === "number" ? activeClip.speed : undefined) ??
      (currentId ? clipSpeeds[currentId] ?? 1 : 1);
    const speed = speedRaw > 0 ? speedRaw : 1;
    el.playbackRate = speed;
  }, [activeAssetId, playheadIndex, clips, clipSpeeds]);

  // Keep the global timeline clock in sync with the logical timeline
  // (clips + speeds + transitions) using requestAnimationFrame. We
  // advance based on system clock time (performance.now) and enforce
  // strict clip boundaries so the canvas video hands over exactly at
  // segment seams.
  useEffect(() => {
    if (!isTimelinePlaying || !clips.length) {
      if (timelineAnimationFrameRef.current != null) {
        cancelAnimationFrame(timelineAnimationFrameRef.current);
        timelineAnimationFrameRef.current = null;
      }
      return;
    }

    let localTimelineTime = currentTimelineTime;
    let lastNow: number | null = null;

    const tick = () => {
      if (!isTimelinePlaying || !clips.length) {
        if (timelineAnimationFrameRef.current != null) {
          cancelAnimationFrame(timelineAnimationFrameRef.current);
          timelineAnimationFrameRef.current = null;
        }
        return;
      }

      const now = performance.now();
      if (lastNow == null) {
        lastNow = now;
        timelineAnimationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Advance the logical playhead at true wall-clock speed:
      // 1 real second = 1 timeline second.
      const deltaSeconds = (now - lastNow) / 1000;
      lastNow = now;

      // Precompute per-clip effective durations on the timeline.
      const segmentDurations = clips.map((clip) => getClipTimelineDuration(clip.id));
      const totalDuration = totalTimelineDuration;
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        setCurrentTimelineTime(0);
        if (timelineAnimationFrameRef.current != null) {
          cancelAnimationFrame(timelineAnimationFrameRef.current);
          timelineAnimationFrameRef.current = null;
        }
        return;
      }

      // Clamp our local time in case external seeks pushed it out of range.
      if (localTimelineTime < 0) localTimelineTime = 0;
      if (localTimelineTime > totalDuration) localTimelineTime = totalDuration;

      // Compute fixed global start/end offsets for each clip so
      // active‑clip detection and handovers live in the same
      // coordinate system as the visual card widths.
      const clipBoundaries: { start: number; end: number; index: number }[] = [];
      for (let i = 0, acc = 0; i < segmentDurations.length; i++) {
        const dur = segmentDurations[i];
        const start = acc;
        const end = acc + dur;
        clipBoundaries.push({ start, end, index: i });
        acc = end;
      }

      // Find the currently active clip for this point on the timeline.
      let activeIndex = 0;
      let activeStart = 0;
      let activeEnd = totalDuration;
      if (clipBoundaries.length > 0) {
        const found =
          clipBoundaries.find(
            (b) => localTimelineTime >= b.start && localTimelineTime < b.end,
          ) || clipBoundaries[clipBoundaries.length - 1];
        activeIndex = found.index;
        activeStart = found.start;
        activeEnd = found.end;
      }

      const activeClip = clips[activeIndex];
      const activeClipId = activeClip?.id;
      const speedRaw =
        (activeClip && typeof activeClip.speed === "number" ? activeClip.speed : undefined) ??
        (activeClipId ? clipSpeeds[activeClipId] ?? 1 : 1);
      // Use the per-clip speed as the playbackRate so that a 2.0x
      // clip advances twice as fast in both the video element and
      // the logical timeline clock.
      const speedFactor = speedRaw > 0 ? speedRaw : 1;

      const videoEl = videoRef.current;

      // Keep the HTML5 video element's playbackRate in lockstep with
      // the active clip's chosen speed modifier, but avoid fighting
      // the element's own playback/seek so we don't introduce
      // stutter or constant pause/resume.
      let isBuffering = false;
      if (videoEl) {
        videoEl.playbackRate = speedFactor;
        // Treat the player as buffering only while it's actively seeking
        // or before it has current frame data. Using readyState < 2 keeps
        // the freeze window tight so clips don't feel artificially long.
        // (0 = HAVE_NOTHING, 1 = HAVE_METADATA, 2 = HAVE_CURRENT_DATA)
        isBuffering = videoEl.seeking || videoEl.readyState < 2;
      }

      // Advance the logical playhead in real seconds, but prefer the
      // actual media time from the current HTMLVideoElement so the
      // white playhead never drifts ahead of or behind the visible
      // clip.
      let nextTimelineTime = localTimelineTime + deltaSeconds;

      if (videoEl) {
        let globalFromVideo: number | null = null;

        // Use the playheadIndex (current timeline segment) as the
        // source of truth for which clip is on screen.
        let indexForVideo = playheadIndex;
        if (indexForVideo == null || indexForVideo < 0 || indexForVideo >= clips.length) {
          // Fallback: infer from the active asset on the canvas.
          if (activeAssetId) {
            const idx = clips.findIndex((c) => c.id === activeAssetId);
            if (idx >= 0) indexForVideo = idx;
          }
        }

        if (indexForVideo != null && indexForVideo >= 0 && indexForVideo < clips.length) {
          const clip = clips[indexForVideo];
          const full = clipDurations[clip.id] ?? 0;
          const trim = clipTrims[clip.id];

          const trimStart =
            trim && full > 0 ? Math.max(0, Math.min(trim.start, full)) : 0;
          const trimEnd =
            trim && full > 0
              ? Math.max(trimStart, Math.min(trim.end ?? full, full))
              : full;
          const clipLength = Math.max(0, trimEnd - trimStart);

          // Local playback time within this trimmed clip.
          const rawLocal = videoEl.currentTime - trimStart;
          const localInClip = clipLength > 0
            ? Math.min(Math.max(rawLocal, 0), clipLength)
            : 0;

          // Global offset before this clip on the logical timeline.
          let offsetBefore = 0;
          for (let i = 0; i < indexForVideo; i++) {
            const cid = clips[i]?.id;
            if (!cid) continue;
            offsetBefore += getClipTimelineDuration(cid);
          }

          globalFromVideo = offsetBefore + localInClip;
        }

        if (globalFromVideo != null && Number.isFinite(globalFromVideo)) {
          nextTimelineTime = globalFromVideo;
        }
      }

      // Guard against numerical drift below zero.
      if (nextTimelineTime < 0) nextTimelineTime = 0;

      // Hard-stop at the exact end of the timeline. The moment we hit or
      // cross the final seam, clamp the time, pause playback, and stop the loop.
      if (nextTimelineTime >= totalDuration) {
        const finalTime = totalDuration;
        localTimelineTime = finalTime;
        setCurrentTimelineTime(finalTime);

        if (videoEl) {
          try {
            videoEl.pause();
          } catch {
            // ignore pause errors
          }
        }
        setIsTimelinePlaying(false);
        if (timelineAnimationFrameRef.current != null) {
          cancelAnimationFrame(timelineAnimationFrameRef.current);
          timelineAnimationFrameRef.current = null;
        }
        return;
      }


      // Determine which clip we land in after this step.
      let newIndex = 0;
      let newStart = 0;
      for (let i = 0, acc = 0; i < segmentDurations.length; i++) {
        const segDur = segmentDurations[i];
        const segEnd = acc + segDur;
        if (nextTimelineTime < segEnd || i === segmentDurations.length - 1) {
          newIndex = i;
          newStart = acc;
          break;
        }
        acc = segEnd;
      }

      // Compute playhead and clip boundaries in the same normalized
      // space the UI uses for card widths so visual and time math
      // cannot drift apart.
      const playheadPercent = totalDuration > 0 ? nextTimelineTime / totalDuration : 0;
      const previousPlayheadPercent = totalDuration > 0 ? localTimelineTime / totalDuration : 0;
      const activeRightPercent = totalDuration > 0 ? activeEnd / totalDuration : 0;

      const passedActiveEnd =
        playheadPercent >= activeRightPercent &&
        previousPlayheadPercent < activeRightPercent;
      const shouldHandover = passedActiveEnd;

      // Inject a simple crossfade-style opacity blend on the canvas
      // wrapper when approaching a gap that has a crossfade.
      const gapIndex = activeIndex;
      const gapTransition = gapTransitions[gapIndex];
      let targetOpacity = 1;
      let wrapperTransform = "none";
      let wrapperClipPath = "none";

      if (
        gapTransition &&
        typeof gapTransition.duration === "number" &&
        gapTransition.duration > 0
      ) {
        const boundaryTime = activeEnd;
        const zoneHalfWidth = gapTransition.duration;
        const distance = nextTimelineTime - boundaryTime;
        const absDistance = Math.abs(distance);

        if (absDistance <= zoneHalfWidth) {
          // tEdge: 1 at the edges of the transition zone, 0 at
          // the seam where the effect is strongest.
          const tEdge = absDistance / zoneHalfWidth;
          const strength = 1 - tEdge; // 0 at edge, 1 at seam

          if (
            gapTransition.type === "crossfade" ||
            gapTransition.type === "fade"
          ) {
            // Fade down toward 0.4 opacity at the seam, back to 1.0
            // as we leave the transition zone.
            targetOpacity = 0.4 + 0.6 * tEdge;
          } else if (gapTransition.type === "slide") {
            const maxOffset = 24; // px
            const dir = distance >= 0 ? 1 : -1;
            const offset = dir * maxOffset * strength;
            wrapperTransform = `translateX(${offset}px)`;
          } else if (gapTransition.type === "zoom") {
            const maxScale = 1.12;
            const scale = 1 + (maxScale - 1) * strength;
            wrapperTransform = `scale(${scale})`;
          } else if (gapTransition.type === "circle") {
            // Simple circular reveal: shrink a circular window at
            // the seam and grow it back out at the edges.
            const minRadius = 40; // percent
            const maxRadius = 100; // percent
            const radius = maxRadius - (maxRadius - minRadius) * strength;
            wrapperClipPath = `circle(${radius}% at 50% 50%)`;
          }
        }
      }

      const wrapperEl = videoEl?.parentElement?.parentElement ?? null;
      if (wrapperEl) {
        wrapperEl.style.transition = "opacity 100ms linear, transform 100ms linear, clip-path 120ms linear";
        wrapperEl.style.opacity = String(targetOpacity);
        wrapperEl.style.transform = wrapperTransform;
        wrapperEl.style.clipPath = wrapperClipPath === "none" ? "none" : wrapperClipPath;
      }

      // If we crossed from one clip segment into the next (or past the
      // active segment's end boundary), force the preview video source
      // to switch immediately and seek to the new clip's trimmed start.
      if (shouldHandover && videoEl) {
        const nextClip = clips[Math.min(newIndex, clips.length - 1)];
        if (nextClip) {
          const nextUrl = nextClip.publicUrl;

          // Compute the source start offset for the next clip based on
          // its trim in/out points.
          const fullNext = clipDurations[nextClip.id] ?? 0;
          const trimNext = clipTrims[nextClip.id];
          let nextStartOffset = 0;
          if (fullNext > 0 && trimNext) {
            nextStartOffset = Math.max(0, Math.min(trimNext.start, fullNext));
          }

          try {
            if (nextUrl && videoEl.src !== nextUrl) {
              // Stop the old clip and prepare the next source exactly
              // once at the boundary crossing.
              try {
                videoEl.pause();
              } catch {
                // ignore pause errors
              }

              videoEl.src = nextUrl;
              videoEl.preload = "auto";
              videoEl.load();

              // Adjust for any handle trims using our computed
              // start offset in seconds.
              const trimStartAdjustment = nextStartOffset;
              try {
                videoEl.currentTime = trimStartAdjustment;
              } catch {
                // ignore seek errors; oncanplay will still fire when ready
              }

              // Play ONLY when the browser confirms the source has
              // buffered enough to render a frame.
              videoEl.oncanplay = () => {
                if (isTimelinePlaying) {
                  videoEl
                    .play()
                    .catch((err) => {
                      console.log("Clean promise catch during clip handover:", err?.message ?? String(err));
                    });
                }
                videoEl.oncanplay = null; // Clear listener
              };
            } else {
              // If we're reusing the same src (e.g. seeking within a
              // single asset), just jump to the appropriate trim
              // start and continue playback.
              try {
                videoEl.currentTime = nextStartOffset;
              } catch {
                // ignore seek errors
              }

              if (isTimelinePlaying) {
                videoEl
                  .play()
                  .catch((err) => {
                    console.log("Clean promise catch during intra-clip seek:", err?.message ?? String(err));
                  });
              }
            }
          } catch {
            // Ignore play/seek errors; UI will still advance.
          }
        }

        // Prevent the onTimeUpdate/onEnded handlers from double-advancing
        // this same clip; we handle handover here.
        lastAdvancedClipIdRef.current = null;
        advancedEarlyRef.current = true;

        setPlayheadIndex(newIndex);
      }

      localTimelineTime = nextTimelineTime;
      setCurrentTimelineTime(nextTimelineTime);

      timelineAnimationFrameRef.current = requestAnimationFrame(tick);
    };

    timelineAnimationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (timelineAnimationFrameRef.current != null) {
        cancelAnimationFrame(timelineAnimationFrameRef.current);
        timelineAnimationFrameRef.current = null;
      }
    };
  }, [
    isTimelinePlaying,
    clips,
    clipSpeeds,
    clipDurations,
    clipTrims,
    gapTransitions,
    currentTimelineTime,
    totalTimelineDuration,
    getClipTimelineDuration,
    videoRef,
  ]);

  async function handleExtractAudio(assetId: string) {
    try {
      setAssetsError(null);
      setIsExtractingAudio(true);
      const res = await fetch(`${ASSETS_BASE_URL}/api/extract-audio`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.file) {
        setAssetsError(data?.error || "Audio extraction failed.");
        return;
      }
      const newAsset: MediaAsset = data.file;
      const audioUrl: string = data.audio_url || newAsset.publicUrl;
      const hydratedAsset: MediaAsset = { ...newAsset, publicUrl: audioUrl };
      setAssets((prev) => [hydratedAsset, ...prev]);
      setAudioTrack(hydratedAsset);
      setBeatMarkers([]);
      const baseDuration = hydratedAsset.durationSeconds ?? 0;
      const duration = baseDuration > 0 ? baseDuration : 0;
      const clipId = `audio-clip-${hydratedAsset.id}-${Date.now()}`;
      const initialClip: AudioClip = {
        id: clipId,
        publicUrl: hydratedAsset.publicUrl,
        originalDuration: duration,
        sourceStart: 0,
        sourceEnd: duration,
        timelineStart: 0,
      };
      setAudioClips([initialClip]);
      setSelectedAudioClipId(clipId);
      setAudioTrackDuration(duration || null);
    } catch (err) {
      console.error(err);
      setAssetsError("Audio extraction failed.");
    } finally {
      setIsExtractingAudio(false);
    }
  }

  async function handleBeatSync() {
    if (!audioTrack) return;
    try {
      setAssetsError(null);
      setIsBeatSyncLoading(true);
      const res = await fetch(`${ASSETS_BASE_URL}/api/beat-sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioAssetId: audioTrack.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setAssetsError(data?.error || "Beat sync failed.");
        return;
      }
      setBeatMarkers(Array.isArray(data.beats) ? data.beats : []);
    } catch (err) {
      console.error(err);
      setAssetsError("Beat sync failed.");
    } finally {
      setIsBeatSyncLoading(false);
    }
  }

  function handleExtractAudioFromClipIndex(clipIndex: number) {
    const clip = clips[clipIndex];
    if (!clip || !clip.publicUrl) return;

    const full = clipDurations[clip.id] ?? clip.durationSeconds ?? 0;
    const safeFull = full > 0 ? full : 0;

    let sourceStart = 0;
    let sourceEnd = safeFull;

    const trim = clipTrims[clip.id];
    if (trim && safeFull > 0) {
      sourceStart = Math.max(0, Math.min(trim.start, safeFull));
      sourceEnd = Math.max(sourceStart, Math.min(trim.end ?? safeFull, safeFull));
    }

    const length = Math.max(0, sourceEnd - sourceStart);

    // Compute where this clip begins on the global timeline so the
    // extracted audio row lines up exactly under the same playhead.
    let timelineStart = 0;
    for (let i = 0; i < clipIndex; i++) {
      const cid = clips[i]?.id;
      if (!cid) continue;
      timelineStart += getClipTimelineDuration(cid);
    }

    const pseudoId = `audio-from-${clip.id}-${Date.now()}`;
    const pseudoAudioAsset: MediaAsset = {
      ...clip,
      id: pseudoId,
      type: "audio",
      originalName: `${clip.originalName} (Audio)`,
      mimeType: clip.mimeType ?? "audio/mpeg",
      durationSeconds: length || safeFull,
    };

    const effectiveDuration = length || safeFull;

    setAudioTrack(pseudoAudioAsset);
    setBeatMarkers([]);
    setAudioTrackDuration(effectiveDuration || null);

    const newClipId = `audio-clip-${pseudoId}`;
    const newClip: AudioClip = {
      id: newClipId,
      publicUrl: pseudoAudioAsset.publicUrl,
      originalDuration: effectiveDuration,
      sourceStart,
      sourceEnd: sourceStart + effectiveDuration,
      timelineStart,
    };

    // For now we keep a single contiguous audio row; replacing any
    // existing segments keeps the behaviour predictable.
    setAudioClips([newClip]);
    setSelectedAudioClipId(newClipId);
    setSelectedAudioId(newClipId);
    setAudioFadeByClip((prev) => ({
      ...prev,
      [newClipId]: { fadeIn: 0, fadeOut: 0 },
    }));

    // Mute the source video clip so only the extracted audio row
    // contributes sound during playback.
    setClipMutes((prev) => ({
      ...prev,
      [clip.id]: true,
    }));
  }

  function handleDeleteSelectedAudioClip() {
    if (!selectedAudioClipId) return;
    const idToDelete = selectedAudioClipId;
    setAudioClips((prev) => prev.filter((clip) => clip.id !== idToDelete));
    setAudioFadeByClip((prev) => {
      const next = { ...prev };
      delete next[idToDelete];
      return next;
    });
    setSelectedAudioClipId(null);
  }

  function handleSplitSelectedAudioClip() {
    if (!selectedAudioClipId) return;

    const splitTime = currentTimelineTime;
    let nextSelectedId: string | null = null;

    setAudioClips((prev) => {
      const idx = prev.findIndex((c) => c.id === selectedAudioClipId);
      if (idx === -1) return prev;

      const clip = prev[idx];
      const length = Math.max(0, clip.sourceEnd - clip.sourceStart);
      if (length <= 0) return prev;

      const local = splitTime - clip.timelineStart;
      // Avoid creating extremely tiny segments
      if (local <= 0.1 || local >= length - 0.1) return prev;

      const midSource = clip.sourceStart + local;
      const left: AudioClip = {
        ...clip,
        id: `${clip.id}-a-${Date.now()}`,
        sourceEnd: midSource,
      };
      const right: AudioClip = {
        ...clip,
        id: `${clip.id}-b-${Date.now()}`,
        sourceStart: midSource,
        timelineStart: clip.timelineStart + local,
      };

      nextSelectedId = right.id;

      const next = [...prev];
      next.splice(idx, 1, left, right);
      return next;
    });

    if (nextSelectedId) {
      setSelectedAudioClipId(nextSelectedId);
    }

    setAudioFadeByClip((prev) => {
      const next = { ...prev };
      delete next[selectedAudioClipId!];
      return next;
    });
  }

  const currentAudioClip =
    selectedAudioId != null
      ? (() => {
          const base = audioClips.find((clip) => clip.id === selectedAudioId);
          if (!base) return null;
          const fade = audioFadeByClip[selectedAudioId] || { fadeIn: 0, fadeOut: 0 };
          return {
            ...base,
            fadeIn: fade.fadeIn,
            fadeOut: fade.fadeOut,
          } as AudioClip & { fadeIn: number; fadeOut: number };
        })()
      : null;

  function handleUpdateAudioFade(
    id: string | null,
    field: "fadeIn" | "fadeOut",
    value: number,
  ) {
    if (!id) return;
    const safe = Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0));

    setAudioFadeByClip((prev) => {
      const existing = prev[id] || { fadeIn: 0, fadeOut: 0 };
      return {
        ...prev,
        [id]: {
          fadeIn: field === "fadeIn" ? safe : existing.fadeIn,
          fadeOut: field === "fadeOut" ? safe : existing.fadeOut,
        },
      };
    });
  }

  function handleDeleteAudio(id: string | null) {
    if (!id) return;
    setAudioClips((prev) => prev.filter((clip) => clip.id !== id));
    setAudioFadeByClip((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedAudioId === id) {
      setSelectedAudioId(null);
    }
    if (selectedAudioClipId === id) {
      setSelectedAudioClipId(null);
    }
  }

  const timelineMarkers = React.useMemo(() => {
    if (totalTimelineDuration <= 0)
      return [] as { time: number; position: number; major: boolean }[];

    const total = totalTimelineDuration;
    // Choose a base step depending on duration (more ticks for shorter timelines)
    let stepSeconds = 1;
    if (total > 120) {
      stepSeconds = 10; // > 2 min: ticks every 10s
    } else if (total > 30) {
      stepSeconds = 5; // 30–120s: ticks every 5s
    } else {
      stepSeconds = 1; // <= 30s: ticks every 1s
    }

    const markers: { time: number; position: number; major: boolean }[] = [];
    const maxTime = Math.floor(total);

    for (let t = 0; t <= maxTime; t += stepSeconds) {
      const clamped = Math.min(t, total);
      const position = total ? clamped / total : 0;
      const major = clamped === 0 || clamped % (stepSeconds * 2) === 0; // every 2nd tick is major
      markers.push({ time: clamped, position, major });
    }

    // Ensure we always include the very end as a major marker
    if (markers.length === 0 || markers[markers.length - 1].time < total) {
      markers.push({ time: total, position: 1, major: true });
    }

    return markers;
  }, [totalTimelineDuration]);

  function seekTimelineToRatio(ratio: number) {
    if (!clips.length || totalTimelineDuration <= 0) return;

    const clamped = Math.min(1, Math.max(0, ratio));
    const newTime = clamped * totalTimelineDuration;

    // Find which clip this time is in
    let accum = 0;
    let targetIndex = 0;
    for (let i = 0; i < clips.length; i++) {
      const dur = getClipTimelineDuration(clips[i].id);
      if (newTime < accum + dur || i === clips.length - 1) {
        targetIndex = i;
        break;
      }
      accum += dur;
    }
    const localTime = Math.max(0, newTime - accum);

    const targetClip = clips[targetIndex];
    if (!targetClip) return;

    const fullDur = clipDurations[targetClip.id] ?? 0;
    const trim = clipTrims[targetClip.id];
    const startOffset = trim && fullDur > 0
      ? Math.max(0, Math.min(trim.start, fullDur))
      : 0;
    const endOffset = trim && fullDur > 0
      ? Math.max(startOffset, Math.min(trim.end ?? fullDur, fullDur))
      : fullDur;
    const trimmedLength = Math.max(0, endOffset - startOffset);
    const safeLocal = trimmedLength > 0 ? Math.min(Math.max(localTime, 0), trimmedLength) : 0;

    setCurrentTimelineTime(newTime);
    setPlayheadIndex(targetIndex);
    setUploadedVideoUrl(targetClip.publicUrl);
    setUploadedVideoName(targetClip.originalName);
    setActiveAssetId(targetClip.id);
    setCanvasOffset({ x: 0, y: 0 });
    setCanvasScale(1);
    setLayerSelected(true);
    saveCanvasState(targetClip.id, clips);

    if (videoRef.current) {
      try {
        videoRef.current.currentTime = startOffset + safeLocal;
        if (isTimelinePlaying) {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              console.log("Play request safely interrupted/prevented:", error?.message ?? String(error));
            });
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const contextMenuAsset =
    contextMenu && contextMenu.assetId
      ? assets.find((a) => a.id === contextMenu.assetId) || null
      : null;

  const selectedAudioClip =
    selectedAudioClipId != null
      ? audioClips.find((clip) => clip.id === selectedAudioClipId) || null
      : null;

  const selectedClipFade = selectedAudioClip
    ? audioFadeByClip[selectedAudioClip.id] || { fadeIn: 0, fadeOut: 0 }
    : { fadeIn: 0, fadeOut: 0 };

  const selectedClipLength = selectedAudioClip
    ? Math.max(0, selectedAudioClip.sourceEnd - selectedAudioClip.sourceStart)
    : 0;

  const selectedClipMaxFade = selectedClipLength > 0 ? selectedClipLength / 2 : 0;

  let currentVideoClipId: string | null = null;
  if (playheadIndex != null && playheadIndex >= 0 && playheadIndex < clips.length) {
    currentVideoClipId = clips[playheadIndex]?.id ?? null;
  } else if (activeAssetId) {
    currentVideoClipId = activeAssetId;
  }

  function handleReorderTimelineClips(fromIndex: number, toIndex: number) {
    setClips((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveCanvasState(activeAssetId, next);
      return next;
    });

    // Keep playhead index aligned with the moved clip when possible
    setPlayheadIndex((prevIndex) => {
      if (prevIndex == null) return prevIndex;
      if (prevIndex === fromIndex) return toIndex;
      // If we removed an element before the current index and reinserted it after,
      // the current index shifts left by 1.
      if (fromIndex < prevIndex && toIndex >= prevIndex) return prevIndex - 1;
      // If we removed an element after the current index and reinserted it before,
      // the current index shifts right by 1.
      if (fromIndex > prevIndex && toIndex <= prevIndex) return prevIndex + 1;
      return prevIndex;
    });
  }

  return (
    <div className="min-h-screen flex flex-col text-white bg-gradient-to-b from-black via-slate-950 to-black">
      {/* HEADER */}
      <header className="border-b border-white/10 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
        <div />
        <div className="flex items-center gap-3 text-[11px] relative">
          <button
            type="button"
            onClick={() => router.push("/creation")}
            className="glow-focus px-3 py-1.5 rounded-full border border-white/20 text-white/80 bg-black/40 hover:bg-black/60 text-xs"
          >
            ← Back to Create
          </button>

          {/* Download dropdown for timeline clips */}
          <div className="relative">
            <button
              type="button"
              onClick={() => clips.length && setExportMenuOpen((v) => !v)}
              disabled={!clips.length}
              className={`glow-focus px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 ${
                !clips.length
                  ? "border-white/20 text-white/40 bg-black/30 cursor-not-allowed"
                  : exportMenuOpen
                  ? "border-cyan-400 text-cyan-100 bg-black/70"
                  : "border-cyan-400/60 text-cyan-100 bg-black/40 hover:bg-black/70"
              }`}
            >
              <span>Download</span>
              <span className="text-[9px]">▾</span>
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/15 bg-black/90 shadow-xl p-3 text-[11px] space-y-3 z-20">
                <div className="text-white/70 font-semibold">Downloads</div>

                {/* Format selector */}
                <div className="space-y-1">
                  <div className="text-white/60 text-[11px]">File format</div>
                  <div className="flex flex-col gap-1 mt-1">
                    {/* MP4 video */}
                    <label className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={downloadFormat === "mp4"}
                        onChange={() => setDownloadFormat("mp4")}
                      />
                      <span>MP4 (Video)</span>
                    </label>

                    {/* MP3 audio */}
                    <label className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={downloadFormat === "mp3"}
                        onChange={() => {
                          setDownloadFormat("mp3");
                          // Only MP4 supports "All" timeline export for now.
                          if (downloadScope === "all") {
                            setDownloadScope("single");
                          }
                        }}
                      />
                      <span>MP3 (Audio)</span>
                    </label>

                    {/* WAV audio */}
                    <label className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={downloadFormat === "wav"}
                        onChange={() => {
                          setDownloadFormat("wav");
                          if (downloadScope === "all") {
                            setDownloadScope("single");
                          }
                        }}
                      />
                      <span>WAV (Audio)</span>
                    </label>

                    {/* PNG frame */}
                    <label className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={downloadFormat === "png"}
                        onChange={() => {
                          setDownloadFormat("png");
                          if (downloadScope === "all") {
                            setDownloadScope("single");
                          }
                        }}
                      />
                      <span>PNG (Frame)</span>
                    </label>

                    {/* JPEG frame */}
                    <label className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={downloadFormat === "jpeg"}
                        onChange={() => {
                          setDownloadFormat("jpeg");
                          if (downloadScope === "all") {
                            setDownloadScope("single");
                          }
                        }}
                      />
                      <span>JPEG (Frame)</span>
                    </label>
                  </div>
                </div>

                {/* Range selector */}
                <div className="space-y-1 pt-2 border-t border-white/10">
                  <div className="text-white/60 text-[11px]">Range</div>

                  <label
                    className="flex items-center gap-2 text-[11px] text-white/75 cursor-pointer"
                    title={
                      !(selectedTimelineClipIds.length === 1 || !!selectedClipId)
                        ? "Select a clip on the timeline to enable single-clip download."
                        : ""
                    }
                  >
                    <input
                      type="radio"
                      className="h-3 w-3"
                      checked={downloadScope === "single"}
                      onChange={() => setDownloadScope("single")}
                      disabled={!(selectedTimelineClipIds.length === 1 || !!selectedClipId)}
                    />
                    <span>Single (selected clip)</span>
                  </label>

                  <label
                    className="flex items-center gap-2 text-[11px] text-white/75 cursor-pointer"
                    title={
                      downloadFormat !== "mp4"
                        ? "All clips is only supported for MP4 video exports."
                        : ""
                    }
                  >
                    <input
                      type="radio"
                      className="h-3 w-3"
                      checked={downloadScope === "all"}
                      onChange={() => setDownloadScope("all")}
                      disabled={downloadFormat !== "mp4" || !clips.length}
                    />
                    <span>All (full timeline)</span>
                    {downloadFormat !== "mp4" && (
                      <span className="ml-1 text-[10px] text-white/45">Not supported yet</span>
                    )}
                  </label>
                </div>

                {/* Timeline clip selection */}
                <div className="space-y-1 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span>Timeline clips</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={allTimelineChecked}
                        onChange={(e) => toggleSelectAllTimelineClips(e.target.checked)}
                      />
                      <span className="text-[10px] text-white/70">Select all</span>
                    </label>
                  </div>
                  <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
                    {clips.length === 0 ? (
                      <div className="text-[10px] text-white/40">No clips on the timeline.</div>
                    ) : (
                      clips.map((clip) => (
                        <label
                          key={clip.id}
                          className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={selectedTimelineClipIds.includes(clip.id)}
                            onChange={() => toggleSelectSingleTimelineClip(clip.id)}
                          />
                          <span className="truncate">{clip.originalName}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Final export button */}
                <button
                  type="button"
                  onClick={handleDownloadFromMenu}
                  disabled={
                    !clips.length ||
                    (downloadScope === "single" &&
                      !(selectedTimelineClipIds.length === 1 || !!selectedClipId))
                  }
                  className={`w-full mt-2 px-3 py-1.5 rounded-lg border text-left text-[11px] ${
                    !clips.length ||
                    (downloadScope === "single" &&
                      !(selectedTimelineClipIds.length === 1 || !!selectedClipId))
                      ? "border-white/20 bg-black/40 text-white/40 cursor-not-allowed"
                      : "border-cyan-400/70 bg-cyan-500/20 hover:bg-cyan-400/30 text-cyan-100"
                  }`}
                >
                  Export / Download
                </button>

                {exportStatus && (
                  <div className="text-[10px] text-white/55 pt-1 border-t border-white/10 mt-1">
                    {exportStatus}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Speed drop-up for the active clip */}
          <div className="relative">
            <button
              type="button"
              disabled={clips.length === 0}
              onClick={() => {
                if (!clips.length) return;
                setSpeedMenuOpen((v) => !v);
              }}
              className={`glow-focus px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 ${
                clips.length === 0
                  ? "border-white/20 text-white/40 bg-black/30 cursor-not-allowed"
                  : speedMenuOpen
                  ? "border-cyan-400 text-white bg-black/70"
                  : "border-white/25 text-white/80 bg-black/40 hover:bg-black/60"
              }`}
            >
              <span>
                {activeSpeedClip ? `Speed ${activeSpeed.toFixed(1)}x` : "Speed"}
              </span>
              <span className="text-[9px]">▴</span>
            </button>
            {speedMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-white/15 bg-black/90 shadow-xl p-3 text-[11px] z-20">
                <div className="text-white/60 mb-2 flex items-center justify-between">
                  <span>Playback speed</span>
                  <span className="font-mono text-white/90 text-[10px]">
                    {activeSpeed.toFixed(2)}x
                  </span>
                </div>
                {activeSpeedClip ? (
                  <div className="space-y-2">
                    <input
                      type="range"
                      min={0.25}
                      max={3}
                      step={0.05}
                      value={activeSpeed}
                      onChange={(e) => {
                        const value = Number(e.target.value) || 1;
                        // Clamp for safety
                        const clamped = Math.min(3, Math.max(0.25, value));
                        setClipSpeeds((prev) => ({
                          ...prev,
                          [activeSpeedClip.id]: clamped,
                        }));
                        setClips((prev) =>
                          prev.map((c) =>
                            c.id === activeSpeedClip.id
                              ? { ...c, speed: clamped }
                              : c,
                          ),
                        );
                      }}
                      className="w-full accent-cyan-400"
                    />
                    <div className="flex items-center justify-between text-[10px] text-white/50">
                      <span>Slower</span>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded-full border border-white/20 text-white/70 hover:border-cyan-400/80 hover:text-white"
                        onClick={() => {
                          const reset = 1;
                          setClipSpeeds((prev) => ({
                            ...prev,
                            [activeSpeedClip.id]: reset,
                          }));
                          setClips((prev) =>
                            prev.map((c) =>
                              c.id === activeSpeedClip.id
                                ? { ...c, speed: reset }
                                : c,
                            ),
                          );
                        }}
                      >
                        Reset to 1.0x
                      </button>
                      <span>Faster</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-white/50 text-[10px]">
                    Add a clip to the timeline to adjust its speed.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Edit (adjustments) shortcut */}
          <button
            type="button"
            onClick={() =>
              setActiveTool((prev) => (prev === "adjust" ? "select" : "adjust"))
            }
            className={
              `glow-focus px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 ` +
              (activeTool === "adjust"
                ? "border-cyan-400 text-white bg-black/70"
                : "border-white/25 text-white/80 bg-black/40 hover:bg-black/60")
            }
            title="Edit video brightness, contrast, saturation"
          >
            <span className="inline-flex items-center justify-center h-3 w-3 rounded-sm bg-white/80 text-black text-[9px] font-bold mr-1">
              ≡
            </span>
            <span>Edit</span>
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 px-3 py-3 flex flex-row items-stretch gap-3">
        {/* Canva dual-sidebar */}
        <div className="relative z-40">
          <CanvaSidebar
            assets={assets}
            // Cast to satisfy the sidebar's narrower MediaAsset type.
            setAssets={setAssets as any}
            assetsLoading={assetsLoading}
            assetsError={assetsError}
            assetType={assetType}
            setAssetType={setAssetType}
            loadAssets={loadAssets}
            handleAssetSelect={handleAssetSelect}
            handleAssetUpload={handleAssetUpload}
            setActiveTool={setActiveTool}
            activeTab={sidebarTab}
            setActiveTab={setSidebarTab}
            assetFilterQuery={assetFilterQuery}
            onAddBlankCanvas={handleAppendBlankClip}
            onAddTextLayer={handleAddTextLayerFromSidebar}
            onApplyTemplate={handleApplyTemplateFromSidebar}
            onSelectBrandColor={setCanvasBackgroundColor}
            onOpenProject={handleOpenProjectFromSidebar}
            onFilterAssets={handleFilterAssetsFromSidebar}
            onAddElementSticker={handleAddElementStickerFromSidebar}
            onSelectPromptPreset={handleSelectPromptPresetFromSidebar}
          />
        </div>

        <div className="w-full lg:flex-1 flex flex-col items-center">
          <div className="w-full max-w-5xl space-y-3 text-[13px] md:text-sm text-white/70">
            {activeView === "editor" && (
              <>
            {/* Tool popout panel driven by sidebar */}
            <div className="w-full">
              {activeTool === "select" && (
                <div className="rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-[11px] text-white/70">
                  <div className="flex items-center justify-between">
                    <div className="uppercase tracking-[0.16em] text-white/40">Select & Canvas</div>
                    <div className="text-white/45">
                      Use the canvas and timeline to select and reposition clips.
                    </div>
                  </div>
                </div>
              )}
              {activeTool === "text" && (
                <div className="rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-[11px] text-white/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="uppercase tracking-[0.16em] text-white/40">Text</div>
                    <div className="text-white/45">
                      Add titles, captions and lower-thirds (coming soon).
                    </div>
                  </div>
                </div>
              )}
              {activeTool === "adjust" && (
                <div className="rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-[11px] text-white/70">
                  <div className="flex items-center justify-between mb-1.5">
                  <div className="uppercase tracking-[0.16em] text-white/40">Adjustments</div>
                  <div className="text-white/45">
                    Fine-tune brightness, contrast, saturation and color for the selected clip.
                  </div>
                  </div>


                  {currentClipIdForAdjust ? (
                    <div className="space-y-2 mt-2 max-h-64 overflow-y-auto pr-1">
                      {/* Brightness */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Brightness</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.brightness}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={currentAdjustments.brightness}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 100;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  brightness: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>

                      {/* Contrast */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Contrast</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.contrast}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={currentAdjustments.contrast}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 100;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  contrast: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>

                      {/* Saturation */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Saturation</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.saturation}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={currentAdjustments.saturation}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 100;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  saturation: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>

                      {/* Exposure */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Exposure</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.exposure}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={currentAdjustments.exposure}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 100;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  exposure: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>

                      {/* Highlights */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Highlights</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.highlights}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={currentAdjustments.highlights}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 100;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  highlights: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>

                      {/* Warmth */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Warmth</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.warmth ?? 0}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-50}
                          max={50}
                          value={currentAdjustments.warmth ?? 0}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  warmth: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>

                      {/* Vignette */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/60">Vignette</span>
                          <span className="text-white/60 text-[10px]">
                            {currentAdjustments.vignette ?? 0}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={currentAdjustments.vignette ?? 0}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0;
                            if (!currentClipIdForAdjust) return;
                            setClipAdjustments((prev) => {
                              const base = prev[currentClipIdForAdjust] || defaultAdjustments;
                              return {
                                ...prev,
                                [currentClipIdForAdjust]: {
                                  ...base,
                                  vignette: value,
                                },
                              };
                            });
                          }}
                          className="w-full accent-cyan-400"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-white/50">
                      Select a clip on the timeline to adjust its look.
                    </div>
                  )}
                </div>
              )}
              {activeTool === "elements" && (
                <div className="rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-[11px] text-white/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="uppercase tracking-[0.16em] text-white/40">Elements</div>
                    <div className="text-white/45">
                      Shapes, stickers and overlays (coming soon).
                    </div>
                  </div>
                </div>
              )}
              {activeTool === "timeline" && (
                <div className="rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-[11px] text-white/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="uppercase tracking-[0.16em] text-white/40">Timeline</div>
                    <div className="text-white/45">
                      Use zoom, playhead and transitions to refine your edit.
                    </div>
                  </div>
                </div>
              )}
              {activeTool === "transition" && (
                <div className="rounded-2xl border border-white/15 bg-black/80 px-4 py-3 space-y-3 text-[11px]">
                  <div className="flex items-center justify-between">
                    <div className="uppercase tracking-[0.16em] text-white/40">Transition templates</div>
                    {activeTransitionIndex == null ? (
                      <div className="text-white/40">
                        Click the small icon above a "+" between clips to pick a gap.
                      </div>
                    ) : (
                      <div className="text-white/55">
                        Editing gap between <span className="font-semibold">Clip {activeTransitionIndex + 1}</span> and
                        <span className="font-semibold"> Clip {activeTransitionIndex + 2}</span>.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {transitionTemplates.map((tmpl) => {
                      const isActive =
                        activeTransitionIndex != null && gapTransitions[activeTransitionIndex]?.type === tmpl.id;
                      const hasAnyGap = clips.length > 1;

                      return (
                        <div
                          key={tmpl.id}
                          className={`rounded-xl border px-3 py-2 flex flex-col gap-2 bg-black/60 ${
                            isActive ? "border-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.6)]" : "border-white/20"
                          }`}
                        >
                          <button
                            type="button"
                            disabled={!hasAnyGap}
                            onClick={() => {
                              if (!hasAnyGap) return;

                              // Determine which gap to apply to: existing selection, or first gap by default
                              let targetGap = activeTransitionIndex;
                              if (targetGap == null) {
                                targetGap = 0;
                                setActiveTransitionIndex(0);
                              }

                              setGapTransitions((prev) => ({
                                ...prev,
                                [targetGap!]: {
                                  type: tmpl.id,
                                  duration:
                                    prev[targetGap!]?.type === tmpl.id
                                      ? prev[targetGap!]!.duration
                                      : tmpl.defaultDuration,
                                },
                              }));
                            }}
                            className={`w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg border ${
                              isActive
                                ? "bg-cyan-400 text-black border-cyan-300"
                                : !hasAnyGap
                                ? "bg-black/50 text-white/40 border-white/20 cursor-not-allowed"
                                : "bg-black/70 text-white/75 border-white/25 hover:border-cyan-400/70"
                            }`}
                          >
                            {tmpl.label}
                          </button>

                          <div className="flex flex-col gap-1 text-[10px] text-white/60">
                            <div className="flex items-center justify-between">
                              <span>Duration</span>
                              <span className="text-white/80 font-mono text-[10px]">
                                {tmpl.defaultDuration.toFixed(1)}s
                              </span>
                            </div>
                            <input
                              type="range"
                              step="0.1"
                              min="0.1"
                              max="5"
                              value={
                                activeTransitionIndex != null &&
                                gapTransitions[activeTransitionIndex]?.type === tmpl.id
                                  ? gapTransitions[activeTransitionIndex]!.duration
                                  : tmpl.defaultDuration
                              }
                              onChange={(e) => {
                                const value = Number(e.target.value) || 0.1;
                                setTransitionTemplates((prev) =>
                                  prev.map((t) => (t.id === tmpl.id ? { ...t, defaultDuration: value } : t)),
                                );

                                // If the currently selected gap is using this transition, update its duration too
                                if (
                                  activeTransitionIndex != null &&
                                  gapTransitions[activeTransitionIndex]?.type === tmpl.id
                                ) {
                                  setGapTransitions((prev) => ({
                                    ...prev,
                                    [activeTransitionIndex]: {
                                      type: tmpl.id,
                                      duration: value,
                                    },
                                  }));
                                }
                              }}
                              className="w-full accent-cyan-400"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Audio contextual action bar for selected audio clip */}
            {selectedAudioClipId && selectedAudioClip && (
              <div className="mt-2 w-full rounded-2xl border px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-purple-500/60 bg-black/70">
                <div className="flex items-center gap-2 text-[11px] text-white/80">
                  <span className="uppercase tracking-[0.16em] text-purple-200/80">
                    Audio clip
                  </span>
                  {audioTrack && (
                    <span className="truncate max-w-[180px] text-white/60">
                      {audioTrack.originalName}
                    </span>
                  )}
                  {selectedClipLength > 0 && (
                    <span className="ml-1 text-white/45 font-mono text-[10px]">
                      {selectedClipLength.toFixed(1)}s
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSplitSelectedAudioClip}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-white/80 hover:border-purple-400/80 hover:text-white"
                  >
                    <span className="text-[10px]">│</span>
                    <span>Split</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/10 bg-white/0 text-white/40 cursor-default"
                    title="Slip editing coming soon"
                  >
                    <span className="text-[10px]">⇋</span>
                    <span>Slip</span>
                  </button>
                  <div className="relative inline-flex">
                    <button
                      type="button"
                      ref={fadeButtonRef}
                      onClick={() => {
                        if (!selectedAudioClip) return;
                        setFadeMenuOpen((v) => !v);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-white/80 text-[11px] ${
                        fadeMenuOpen
                          ? "border-purple-400 bg-purple-500/20"
                          : "border-white/15 bg-white/5 hover:border-purple-400/80 hover:text-white"
                      }`}
                    >
                      <span className="h-2 w-3 rounded-sm bg-gradient-to-r from-transparent via-purple-300/80 to-transparent" />
                      <span>Fade</span>
                    </button>

                    {fadeMenuOpen && selectedAudioClip && (
                      <div
                        ref={fadeMenuRef}
                        className="absolute left-0 top-full mt-1 w-64 rounded-xl bg-white text-slate-900 shadow-xl border border-black/5 px-3 py-2 z-30"
                      >
                        {selectedClipMaxFade > 0 ? (
                          <div className="space-y-3 text-[11px]">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-900">
                                  Fade in
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono text-slate-800">
                                  {Math.round(selectedClipFade.fadeIn)}s
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={selectedClipMaxFade || 0}
                                step={0.1}
                                value={Math.min(
                                  selectedClipFade.fadeIn,
                                  selectedClipMaxFade || 0,
                                )}
                                onChange={(e) => {
                                  const value = Number(e.target.value) || 0;
                                  if (!selectedAudioClipId) return;
                                  setAudioFadeByClip((prev) => ({
                                    ...prev,
                                    [selectedAudioClipId]: {
                                      fadeIn: value,
                                      fadeOut:
                                        prev[selectedAudioClipId]?.fadeOut ?? 0,
                                    },
                                  }));
                                }}
                                className="w-full accent-purple-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-900">
                                  Fade out
                                </span>
                                <span className="text-[10px] font-mono text-slate-700">
                                  {selectedClipFade.fadeOut.toFixed(1)}s
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={selectedClipMaxFade || 0}
                                step={0.1}
                                value={Math.min(
                                  selectedClipFade.fadeOut,
                                  selectedClipMaxFade || 0,
                                )}
                                onChange={(e) => {
                                  const value = Number(e.target.value) || 0;
                                  if (!selectedAudioClipId) return;
                                  setAudioFadeByClip((prev) => ({
                                    ...prev,
                                    [selectedAudioClipId]: {
                                      fadeIn:
                                        prev[selectedAudioClipId]?.fadeIn ?? 0,
                                      fadeOut: value,
                                    },
                                  }));
                                }}
                                className="w-full accent-purple-500"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600">
                            This clip is too short for fades.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!audioTrack || isBeatSyncLoading}
                    onClick={() => void handleBeatSync()}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] ${
                      !audioTrack
                        ? "border-white/10 bg-white/0 text-white/35 cursor-not-allowed"
                        : "border-white/15 bg-white/5 text-white/80 hover:border-purple-400/80 hover:text-white"
                    }`}
                  >
                    <span className="text-[10px]">🎵</span>
                    <span>{isBeatSyncLoading ? "Beat Sync…" : "Beat Sync"}</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/10 bg-white/0 text-white/40 cursor-default"
                    title="Captions from audio coming soon"
                  >
                    <span className="text-[10px]">CC</span>
                    <span>Captions</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedAudioClip}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/70 bg-red-500/10 text-red-200 hover:bg-red-500/25"
                  >
                    <TrashIcon className="h-3 w-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}

            {/* Canvas header */}
            <div className="flex items-center justify-end gap-3">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-white/60 mr-1">Aspect</span>
                <button
                  type="button"
                  onClick={() => setAspect("16:9")}
                  className={`glow-focus px-3 py-1 rounded-full border text-xs ${
                    aspect === "16:9"
                      ? "bg-white text-black font-semibold border-white/80"
                      : "bg-black/40 text-white/70 border-white/25"
                  }`}
                >
                  16:9
                </button>
                <button
                  type="button"
                  onClick={() => setAspect("9:16")}
                  className={`glow-focus px-3 py-1 rounded-full border text-xs ${
                    aspect === "9:16"
                      ? "bg-white text-black font-semibold border-white/80"
                      : "bg-black/40 text-white/70 border-white/25"
                  }`}
                >
                  9:16
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCanvasOffset({ x: 0, y: 0 });
                    setCanvasScale(1);
                    setLayerSelected(false);
                  }}
                  className="glow-focus px-3 py-1 rounded-full border text-xs border-white/30 text-white/70 hover:border-cyan-400/80 hover:text-white"
                >
                  Reset view
                </button>
              </div>
            </div>

            {/* Canvas + Assets side by side */}
            <div className="mt-2 flex flex-col lg:flex-row gap-4 items-start">
              {/* Assets column migrated into CanvaSidebar Uploads tab */}

              {/* Canvas column */}
              <div className="w-full lg:flex-1 flex flex-col items-center gap-3 relative">

                {selectedAudioId && (
                  <div className="flex items-center gap-1.5 bg-black/90 border border-white/10 rounded-xl px-2 py-1.5 shadow-2xl absolute top-4 left-1/2 transform -translate-x-1/2 z-50 text-[11px] text-white/80 font-medium animate-in fade-in zoom-in-95 duration-150">
                    <button
                      className="hover:bg-white/10 px-2 py-1 rounded-md transition"
                      onClick={() => handleSplitSelectedAudioClip()}
                    >
                      Split
                    </button>
                    <button className="hover:bg-white/10 px-2 py-1 rounded-md transition">
                      Slip
                    </button>
                    {/* Fade Trigger Button */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFadeMenuOpen(!fadeMenuOpen);
                        }}
                        className={`px-2 py-1 rounded-md transition flex items-center gap-1 ${
                          fadeMenuOpen
                            ? "bg-purple-600 text-white"
                            : "hover:bg-white/10"
                        }`}
                      >
                        Fade
                      </button>
                      {/* Canva Floating Dropdown Panel */}
                      {fadeMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-0 mt-2 w-64 bg-white text-black p-4 rounded-2xl shadow-2xl border border-black/5 z-50 space-y-4 text-xs animate-in fade-in slide-in-from-top-2 duration-200"
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between font-medium text-gray-500 text-[11px]">
                              <span>Fade in</span>
                              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-mono">
                                {currentAudioClip?.fadeIn || 0}s
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="0.1"
                              value={currentAudioClip?.fadeIn || 0}
                              onChange={(e) =>
                                handleUpdateAudioFade(
                                  selectedAudioId,
                                  "fadeIn",
                                  parseFloat(e.target.value),
                                )
                              }
                              className="w-full accent-purple-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between font-medium text-gray-500 text-[11px]">
                              <span>Fade out</span>
                              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-mono">
                                {currentAudioClip?.fadeOut || 0}s
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="0.1"
                              value={currentAudioClip?.fadeOut || 0}
                              onChange={(e) =>
                                handleUpdateAudioFade(
                                  selectedAudioId,
                                  "fadeOut",
                                  parseFloat(e.target.value),
                                )
                              }
                              className="w-full accent-purple-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <button className="hover:bg-white/10 px-2 py-1 rounded-md transition">
                      Beat Sync
                    </button>
                    <button className="hover:bg-white/10 px-2 py-1 rounded-md transition">
                      Captions
                    </button>
                    <button className="hover:bg-white/10 px-2 py-1 rounded-md transition">
                      Enhance voice ✨
                    </button>
                    <div className="h-4 w-[1px] bg-white/10 mx-1" />
                    <button
                      onClick={() => handleDeleteAudio(selectedAudioId)}
                      className="text-red-400 hover:bg-red-500/20 p-1 rounded-md transition"
                    >
                      🗑️
                    </button>
                  </div>
                )}
                <div
                  className="bg-white rounded-3xl border border-white/25 shadow-[0_30px_120px_rgba(0,0,0,0.75)] overflow-hidden flex items-center justify-center relative"
                  style={{
                    backgroundColor: canvasBackgroundColor,
                    width:
                      aspect === "16:9"
                        ? `${100 / layoutZoomScale}%`
                        : `${40 / layoutZoomScale}%`,
                    maxWidth:
                      aspect === "16:9"
                        ? `${960 / layoutZoomScale}px`
                        : `${420 / layoutZoomScale}px`,
                    maxHeight: "60vh",
                    aspectRatio: aspect === "16:9" ? "16 / 9" : "9 / 16",
                  }}
                  onDragOver={(e) => {
                    if (!activeAssets.length) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    const asset = activeAssets.find((a) => a.id === id);
                    if (asset) handleAssetSelect(asset);
                  }}
                >
                  {uploadedVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setCanvasMuted((v) => !v)}
                      className="absolute z-20 top-2 right-2 px-2 py-1 rounded-full text-[10px] border border-white/40 bg-black/60 text-white/80 hover:border-cyan-400 hover:text-white"
                    >
                      {canvasMuted ? "Unmute" : "Mute"}
                    </button>
                  )}
                  <div
                    className="relative w-full h-full overflow-hidden"
                    onContextMenu={(e) => {
                      if (!activeAssetId) return;
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        assetId: activeAssetId,
                        source: "canvas",
                      });
                    }}
                  >
                    <div
                      className={`absolute inset-0 cursor-move ${layerSelected ? "border border-cyan-400/80" : "border border-transparent"}`}
                      style={{
                        transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
                        transformOrigin: "center center",
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setLayerSelected(true);
                        setIsDraggingLayer(true);
                        dragStartRef.current = {
                          mouseX: e.clientX,
                          mouseY: e.clientY,
                          startX: canvasOffset.x,
                          startY: canvasOffset.y,
                        };
                      }}
                    >
                      {/* Primary canvas video element (optional) */}
                      {uploadedVideoUrl && (
                        <video
                          key={activeAssetId || uploadedVideoUrl || "canvas-video"}
                          ref={videoRef}
                          src={uploadedVideoUrl}
                          autoPlay={!isTimelinePlaying}
                          loop={!isTimelinePlaying}
                          muted={
                            canvasMuted ||
                            (currentVideoClipId ? !!clipMutes[currentVideoClipId] : false)
                          }
                          playsInline
                          style={{
                            // Combine brightness, exposure and highlights into a
                            // single brightness() filter and add a subtle
                            // hue-rotate for warmth so the panel stays compact
                            // while still giving expressive control.
                            filter: `brightness(${(((currentAdjustments.brightness || 100) *
                              (currentAdjustments.exposure || 100) *
                              (currentAdjustments.highlights || 100)) / 10000)}%) contrast(${currentAdjustments.contrast}%) saturate(${currentAdjustments.saturation}%) hue-rotate(${currentAdjustments.warmth ?? 0}deg)`,
                          }}
                          onTimeUpdate={(e) => {
                            if (!isTimelinePlaying) return;
                            const el = e.currentTarget as HTMLVideoElement;
                            const current = el.currentTime || 0;
                            const idx =
                              playheadIndex != null
                                ? playheadIndex
                                : clips.findIndex((c) => c.id === activeAssetId);
                            if (idx == null || idx < 0) return;

                            const currentClip = clips[idx];
                            const currentClipId = currentClip?.id;
                            const fullDur = currentClipId ? clipDurations[currentClipId] ?? 0 : 0;
                            const trim = currentClipId ? clipTrims[currentClipId] : undefined;
                            const startOffset = trim && fullDur > 0
                              ? Math.max(0, Math.min(trim.start, fullDur))
                              : 0;
                            const endOffset = trim && fullDur > 0
                              ? Math.max(startOffset, Math.min(trim.end ?? fullDur, fullDur))
                              : fullDur;
                            const trimmedLength = Math.max(0, endOffset - startOffset);

                            // Local time within the trimmed region
                            const localInClip = Math.max(0, current - startOffset);
                          }}
                          onLoadedMetadata={(e) => {
                            const el = e.currentTarget as HTMLVideoElement;
                            try {
                              // Always start new clips from the beginning when they load
                              el.currentTime = 0;
                            } catch {
                              // ignore seek errors
                            }
                            const dur = el.duration;
                            if (!Number.isFinite(dur) || dur <= 0) return;
                            const id = activeAssetId;
                            if (!id) return;
                            setClipDurations((prev) =>
                              prev[id] === dur ? prev : { ...prev, [id]: dur },
                            );
                            setClipTrims((prev) =>
                              prev[id]
                                ? prev
                                : {
                                    ...prev,
                                    [id]: { start: 0, end: dur },
                                  },
                            );
                          }}
                          onEnded={() => {
                            if (!isTimelinePlaying) return;
                            // Safety net: if we didn't already advance early in
                            // onTimeUpdate, advance now at the actual end event.
                            if (!advancedEarlyRef.current) {
                              advancedEarlyRef.current = true;
                              advanceToNextClip();
                            }
                          }}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      )}

                      {/* Vignette overlay driven by adjustments */}
                      {(currentAdjustments.vignette ?? 0) > 0 && (
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            background:
                              "radial-gradient(circle at center, transparent 55%, rgba(0,0,0,0.9) 100%)",
                            opacity: Math.min(1, (currentAdjustments.vignette ?? 0) / 100),
                          }}
                        />
                      )}

                      {/* Hidden audio element for the timeline's audio track. */}
                      {audioTrack?.publicUrl && (
                        <audio
                          ref={audioRef}
                          src={audioTrack.publicUrl}
                          style={{ display: "none" }}
                          onLoadedMetadata={(e) => {
                            const dur = e.currentTarget.duration;
                            if (!Number.isFinite(dur) || dur <= 0) return;
                            setAudioTrackDuration(dur);
                            setAudioClips((prev) => {
                              // If no clips exist yet for this track, seed a full-length clip.
                              if (!prev.length && audioTrack) {
                                const clipId = `audio-clip-${audioTrack.id}-${Date.now()}`;
                                const initialClip: AudioClip = {
                                  id: clipId,
                                  publicUrl: audioTrack.publicUrl,
                                  originalDuration: dur,
                                  sourceStart: 0,
                                  sourceEnd: dur,
                                  timelineStart: 0,
                                };
                                setSelectedAudioClipId(clipId);
                                return [initialClip];
                              }

                              // Otherwise, hydrate any clips that are missing originalDuration.
                              return prev.map((clip) => {
                                if (!clip.originalDuration || clip.originalDuration <= 0) {
                                  const safeEnd =
                                    clip.sourceEnd && clip.sourceEnd > 0
                                      ? Math.min(clip.sourceEnd, dur)
                                      : dur;
                                  return {
                                    ...clip,
                                    originalDuration: dur,
                                    sourceEnd: safeEnd,
                                  };
                                }
                                return clip;
                              });
                            });
                          }}
                          onTimeUpdate={() => {
                            const audioEl = audioRef.current;
                            if (!audioEl) return;

                            // No audio segments → silence
                            if (!audioClips.length) {
                              audioEl.volume = 0;
                              return;
                            }

                            const t = currentTimelineTime; // global timeline time in seconds

                            // Find the active audio segment at time t
                            const active = audioClips.find((clip) => {
                              const segLen = Math.max(0, clip.sourceEnd - clip.sourceStart);
                              if (segLen <= 0) return false;
                              const segStart = clip.timelineStart;
                              const segEnd = segStart + segLen;
                              return t >= segStart && t < segEnd;
                            });

                            if (!active) {
                              audioEl.volume = 0;
                              return;
                            }

                            const segLen = Math.max(0, active.sourceEnd - active.sourceStart);
                            const localT = t - active.timelineStart; // position within this segment
                            const fade = audioFadeByClip[active.id] || { fadeIn: 0, fadeOut: 0 };

                            const fadeInDur = Math.min(fade.fadeIn || 0, segLen / 2 || 0);
                            const fadeOutDur = Math.min(fade.fadeOut || 0, segLen / 2 || 0);

                            let volume = 1;

                            if (fadeInDur > 0) {
                              const k = Math.max(0, Math.min(1, localT / fadeInDur));
                              volume *= k;
                            }

                            if (fadeOutDur > 0) {
                              const distToEnd = segLen - localT;
                              const k = Math.max(0, Math.min(1, distToEnd / fadeOutDur));
                              volume *= k;
                            }

                            audioEl.volume = Math.max(0, Math.min(1, volume));
                          }}
                        />
                      )}

                      {/* Text overlays (stickers/elements) – always render, even with no video */}
                      {textBoxes.map((box) => (
                        <div
                          key={box.id}
                          ref={(el) => {
                            if (el && box.id === lastAddedTextId) {
                              try {
                                el.focus();
                              } catch {
                                // ignore focus errors
                              }
                            }
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          tabIndex={0}
                          onInput={(e) => {
                            const value = e.currentTarget.textContent ?? "";
                            setTextBoxes((prev) =>
                              prev.map((tb) =>
                                tb.id === box.id
                                  ? {
                                      ...tb,
                                      text: value,
                                    }
                                  : tb,
                              ),
                            );
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedTextBoxId(box.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTextBoxId(box.id);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            // Delete this element on right-click
                            setTextBoxes((prev) => prev.filter((tb) => tb.id !== box.id));
                            if (lastAddedTextId === box.id) {
                              setLastAddedTextId(null);
                            }
                            setSelectedTextBoxId(null);
                            setLayerSelected(false);
                          }}
                          onFocus={() => {
                            setSelectedTextBoxId(box.id);
                            setEditingTextBoxId(box.id);
                          }}
                          onBlur={() => {
                            setEditingTextBoxId((current) =>
                              current === box.id ? null : current,
                            );
                          }}
                          className="absolute min-w-[40px] max-w-[70%] text-white text-sm cursor-text"
                          style={{
                            top: `${box.yPercent}%`,
                            left: `${box.xPercent}%`,
                            transform: "translate(-50%, -50%)",
                            fontSize: box.fontSize ? `${box.fontSize}px` : undefined,
                            fontWeight: box.fontWeight ?? undefined,
                            outline: "none",
                          }}
                        >
                          {box.text}
                          {selectedTextBoxId === box.id && (
                            <div
                              className="absolute -bottom-2 -right-2 h-3 w-3 bg-white rounded-sm cursor-nwse-resize"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                textResizeRef.current = {
                                  id: box.id,
                                  startMouseY: e.clientY,
                                  startFontSize: box.fontSize || 40,
                                };
                              }}
                            />
                          )}
                        </div>
                      ))}

                      {layerSelected && (
                        <>
                          <div
                            className="absolute -top-1 -left-1 h-3 w-3 bg-black border border-cyan-400 cursor-nwse-resize"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsResizingLayer(true);
                              resizeStartRef.current = {
                                mouseY: e.clientY,
                                startScale: canvasScale,
                              };
                            }}
                          />
                          <div
                            className="absolute -top-1 -right-1 h-3 w-3 bg-black border border-cyan-400 cursor-nesw-resize"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsResizingLayer(true);
                              resizeStartRef.current = {
                                mouseY: e.clientY,
                                startScale: canvasScale,
                              };
                            }}
                          />
                          <div
                            className="absolute -bottom-1 -left-1 h-3 w-3 bg-black border border-cyan-400 cursor-nesw-resize"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsResizingLayer(true);
                              resizeStartRef.current = {
                                mouseY: e.clientY,
                                startScale: canvasScale,
                              };
                            }}
                          />
                          <div
                            className="absolute -bottom-1 -right-1 h-3 w-3 bg-black border border-cyan-400 cursor-nwse-resize"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsResizingLayer(true);
                              resizeStartRef.current = {
                                mouseY: e.clientY,
                                startScale: canvasScale,
                              };
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Central play control below the main canvas */}
                <div className="mt-3 flex items-center justify-center gap-3">
                  <span className="font-mono text-xs md:text-sm text-white/80">
                    {formatTime(currentTimelineTime)}
                  </span>
                  <button
                    type="button"
                    onClick={handlePlayTimelineToggle}
                    disabled={clips.length === 0}
                    className={`glow-focus h-16 w-16 rounded-full border flex items-center justify-center text-base md:text-lg font-semibold ${
                      clips.length === 0
                        ? "border-white/30 bg-white/70 text-black/40 cursor-not-allowed"
                        : isTimelinePlaying
                        ? "border-cyan-400 bg-white text-black hover:bg-neutral-100"
                        : "border-white/80 bg-white text-black hover:bg-neutral-100"
                    }`}
                    title="Play timeline"
                  >
                    {isTimelinePlaying ? "❚❚" : "▶"}
                  </button>
                  <span className="font-mono text-xs md:text-sm text-white/80">
                    {formatTime(totalTimelineDuration)}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline section */}
            <div ref={timelineSectionRef} className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/60">
                <div className="uppercase tracking-[0.18em] text-white/40">Timeline</div>
              </div>

              <div className="mt-3">
                <div className="overflow-x-auto w-full relative timeline-scroll">
                  <div
                    className="inline-block align-top"
                    style={{
                      width: `${(audioTimelineDuration || totalTimelineDuration || 0) * pixelsPerSecond}px`,
                    }}
                  >
                    <TrimTimeline
                      clips={clips.map((clip, index) => ({
                        id: clip.id,
                        key: `${clip.id}-${index}`,
                        label: clip.originalName,
                        thumbnailUrl: clip.publicUrl,
                        type: clip.id.startsWith("blank-") ? "white_canvas" : "video",
                      }))}
                      setClips={setClips}
                      isPlaying={isTimelinePlaying}
                      videoRef={videoRef}
                      zoomLevel={zoomLevel}
                      setZoomLevel={setZoomLevel}
                      clipSpeeds={clipSpeeds}
                      totalTimelineDuration={totalTimelineDuration}
                      currentTimelineTime={currentTimelineTime}
                      setCurrentTimelineTime={setCurrentTimelineTime}
                      activeTransitionIndex={activeTransitionIndex}
                      setActiveTransitionIndex={setActiveTransitionIndex}
                      setActiveTab={setSidebarTab}
                      selectedClipKey={selectedTimelineKey}
                      onSelectClip={(key, id) => {
                        setSelectedTimelineKey(key);
                        setSelectedClipId(id);
                        const clipIndex = clips.findIndex((c) => c.id === id);
                        const clip = clipIndex >= 0 ? clips[clipIndex] : undefined;
                        if (!clip) return;

                        // Reset playhead to the start of the clicked clip.
                        let offset = 0;
                        for (let i = 0; i < clipIndex; i++) {
                          const cid = clips[i]?.id;
                          if (cid) offset += getClipTimelineDuration(cid);
                        }
                        setCurrentTimelineTime(offset);
                        setPlayheadIndex(clipIndex);

                        setUploadedVideoUrl(clip.publicUrl);
                        setUploadedVideoName(clip.originalName);
                        setActiveAssetId(clip.id);
                        setCanvasOffset({ x: 0, y: 0 });
                        setCanvasScale(1);
                        setLayerSelected(true);
                      }}
                      clipDurations={clipDurations}
                      instanceTrims={timelineInstanceTrims}
                      // Live trim updates while dragging – keep everything on the
                      // client so the timeline length and card widths adjust in
                      // real time without spamming the backend.
                      onUpdateTrimLive={(key, id, start, end) => {
                        setTimelineInstanceTrims((prev) => ({
                          ...prev,
                          [key]: { start, end },
                        }));

                        setClipTrims((prev) => ({
                          ...prev,
                          [id]: { start, end },
                        }));
                      }}
                      onUpdateTrim={(key, id, start, end) => {
                        // Final commit on mouseup – send to backend. State is
                        // already in sync from onUpdateTrimLive.
                        void sendTrimToBackend(start, end);
                      }}
                      beatMarkers={beatMarkers}
                      isBeatSyncLoading={isBeatSyncLoading}
                      gapTransitions={gapTransitions}
                      onSelectTransitionGap={(gapIndex) => {
                        setActiveTransitionIndex(gapIndex);
                      }}
                      onChangeTransition={(gapIndex, choice) => {
                        setActiveTransitionIndex(gapIndex);
                        // When a transition is chosen from the seam icon, switch
                        // the active tool to the Transition panel so the user can
                        // tweak templates and durations.
                        setActiveTool("transition");
                        if (timelineSectionRef.current) {
                          timelineSectionRef.current.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                        }
                        setGapTransitions((prev) => {
                          const next = { ...prev };

                          if (choice === "none") {
                            delete next[gapIndex];
                            return next;
                          }

                          let mappedType: TransitionType = "crossfade";
                          if (choice === "dissolve") {
                            mappedType = "fade";
                          } else if (choice === "crossfade") {
                            mappedType = "crossfade";
                          }

                          const existing = prev[gapIndex];
                          const duration =
                            existing?.duration ??
                            transitionTemplates.find((t) => t.id === mappedType)?.defaultDuration ??
                            0.5;

                          next[gapIndex] = {
                            type: mappedType,
                            duration,
                          };

                          return next;
                        });
                      }}
                      onAddBlankClip={handleInsertBlankAtGap}
                      onClipContextMenu={(index, event) => {
                        setTimelineMenu({ index, x: event.clientX, y: event.clientY });
                      }}
                      onReorderClips={handleReorderTimelineClips}
                    />

                    {/* Audio lane directly under the video timeline */}
                    <div
                      className="mt-2"
                      style={{ height: "28px" }}
                      onDragOver={(e) => {
                        // Allow drops when something is being dragged from the
                        // sidebar. Most browsers do not expose getData() during
                        // dragOver, so we only need to call preventDefault here.
                        if (
                          e.dataTransfer &&
                          e.dataTransfer.types.includes("text/plain")
                        ) {
                          e.preventDefault();
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        const asset = assets.find((a) => a.id === id);
                        if (!asset || asset.type !== "audio") return;
                        const baseDuration = asset.durationSeconds ?? 0;
                        const duration = baseDuration > 0 ? baseDuration : 0;
                        const clipId = `audio-clip-${asset.id}-${Date.now()}`;
                        const initialClip: AudioClip = {
                          id: clipId,
                          publicUrl: asset.publicUrl,
                          originalDuration: duration,
                          sourceStart: 0,
                          sourceEnd: duration,
                          timelineStart: currentTimelineTime,
                        };
                        setAudioTrack(asset);
                        setBeatMarkers([]);
                        setAudioClips([initialClip]);
                        setSelectedAudioClipId(clipId);
                        setSelectedAudioId(clipId);
                        setAudioTrackDuration(duration || null);
                      }}
                    >
                      <div
                        className="relative"
                        style={{
                          width: "100%",
                          height: "100%",
                        }}
                      >
                        {audioClips.length === 0 ? (
                          <div className="absolute inset-0 flex items-center rounded-lg border border-dashed border-purple-500/40 bg-purple-900/10 px-3 text-[11px] text-purple-100/80">
                            <span className="mr-2 text-[13px]">🎵</span>
                            <span className="truncate">
                              Drag audio here from Uploads to add a soundtrack
                            </span>
                          </div>
                        ) : (
                          audioClips.map((clip) => {
                            const fade = audioFadeByClip[clip.id] || {
                              fadeIn: 0,
                              fadeOut: 0,
                            };
                            const audio = {
                              id: clip.id,
                              timelineStart: clip.timelineStart,
                              sourceStart: clip.sourceStart,
                              sourceEnd: clip.sourceEnd,
                              fadeIn: fade.fadeIn,
                              fadeOut: fade.fadeOut,
                              name: audioTrack?.originalName ?? "Audio",
                            };
                            const widthSeconds = Math.max(
                              0,
                              audio.sourceEnd - audio.sourceStart,
                            );
                            const widthPx = widthSeconds * pixelsPerSecond;

                            return (
                              <div
                                key={audio.id}
                                onClick={() => {
                                  setSelectedAudioId(audio.id);
                                  setSelectedAudioClipId(audio.id);
                                  setFadeMenuOpen(false);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedAudioId(audio.id);
                                  setSelectedAudioClipId(audio.id);
                                  setAudioContextMenu({
                                    clipId: audio.id,
                                    x: e.clientX,
                                    y: e.clientY,
                                  });
                                }}
                                onMouseDown={(e) => {
                                  const target = e.target as HTMLElement | null;
                                  if (
                                    target?.dataset.handle === "left" ||
                                    target?.dataset.handle === "right"
                                  ) {
                                    return;
                                  }
                                  e.preventDefault();
                                  setSelectedAudioId(audio.id);
                                  setSelectedAudioClipId(audio.id);
                                  audioDragRef.current = {
                                    clipId: audio.id,
                                    mode: "move",
                                    startX: e.clientX,
                                    startTimelineStart: clip.timelineStart,
                                    startSourceStart: clip.sourceStart,
                                    startSourceEnd: clip.sourceEnd,
                                  };
                                }}
                                className={`relative my-1.5 h-7 rounded-lg flex items-center transition-all cursor-pointer ${
                                  selectedAudioId === audio.id
                                    ? "bg-purple-700/90 ring-2 ring-purple-500 border border-purple-400"
                                    : "bg-purple-900/40 hover:bg-purple-900/60 border border-purple-800/50"
                                }`}
                                style={{
                                  marginLeft: `${audio.timelineStart * pixelsPerSecond}px`,
                                  width: `${widthPx}px`,
                                }}
                              >
                                {/* Visual Fade Indicator Overlays */}
                                <div
                                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-black/40 to-transparent pointer-events-none rounded-l-lg"
                                  style={{
                                    width: `${Math.max(
                                      0,
                                      (audio.fadeIn || 0) * pixelsPerSecond,
                                    )}px`,
                                    clipPath:
                                      "polygon(0 100%, 100% 0, 100% 100%)",
                                  }}
                                />
                                <div
                                  className="absolute right-0 top-0 h-full bg-gradient-to-l from-black/40 to-transparent pointer-events-none rounded-r-lg"
                                  style={{
                                    width: `${Math.max(
                                      0,
                                      (audio.fadeOut || 0) * pixelsPerSecond,
                                    )}px`,
                                    clipPath:
                                      "polygon(0 0, 0 100%, 100% 50%)",
                                  }}
                                />
                                {/* Audio Details Text & Waveform Pattern */}
                                <div className="absolute left-3 z-10 flex items-center gap-1.5 text-[10px] text-purple-100 font-medium truncate select-none">
                                  <span>🎵</span>
                                  <span className="truncate max-w-[150px]">
                                    {audio.name}
                                  </span>
                                  {((audio.fadeIn || 0) > 0 ||
                                    (audio.fadeOut || 0) > 0) && (
                                    <span className="text-[8px] bg-purple-500/40 px-1 rounded text-purple-200">
                                      Fade Active
                                    </span>
                                  )}
                                </div>
                                {/* Simulated Continuous White Waveform Pattern */}
                                <div className="w-full h-full opacity-25 flex items-center justify-around px-2 pointer-events-none">
                                  {Array.from({ length: 40 }).map((_, idx) => (
                                    <div
                                      key={idx}
                                      className="w-[1.5px] bg-white rounded-full"
                                      style={{
                                        height: `${
                                          Math.sin(idx * 0.5) * 60 + 40
                                        }%`,
                                      }}
                                    />
                                  ))}
                                </div>
                                {/* Outer Edge Drag Handles for Edge Trimming */}
                                <div
                                  data-handle="left"
                                  className="absolute left-0 top-0 w-1.5 h-full bg-purple-400/30 hover:bg-purple-400 cursor-ew-resize rounded-l-lg"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setSelectedAudioId(audio.id);
                                    setSelectedAudioClipId(audio.id);
                                    audioDragRef.current = {
                                      clipId: audio.id,
                                      mode: "trim-left",
                                      startX: e.clientX,
                                      startTimelineStart: clip.timelineStart,
                                      startSourceStart: clip.sourceStart,
                                      startSourceEnd: clip.sourceEnd,
                                    };
                                  }}
                                />
                                <div
                                  data-handle="right"
                                  className="absolute right-0 top-0 w-1.5 h-full bg-purple-400/30 hover:bg-purple-400 cursor-ew-resize rounded-r-lg"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setSelectedAudioId(audio.id);
                                    setSelectedAudioClipId(audio.id);
                                    audioDragRef.current = {
                                      clipId: audio.id,
                                      mode: "trim-right",
                                      startX: e.clientX,
                                      startTimelineStart: clip.timelineStart,
                                      startSourceStart: clip.sourceStart,
                                      startSourceEnd: clip.sourceEnd,
                                    };
                                  }}
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>


            </div>

            {/* Transition templates moved into the Transitions sidebar tool */}

            </>
            )}

            {activeView === "trash" && (
              <section className="mt-4 space-y-3 rounded-2xl border border-white/15 bg-black/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrashIcon className="h-4 w-4 text-red-300" />
                      <span className="uppercase tracking-[0.18em] text-white/60">Trash</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/55">
                      Items in trash will be permanently deleted after 30 days.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("editor")}
                    className="glow-focus px-3 py-1.5 rounded-full border border-white/25 text-[11px] text-white/70 hover:border-white/60"
                  >
                    Close trash
                  </button>
                </div>

                {trashedVideoAssets.length === 0 ? (
                  <div className="text-[11px] text-white/40 border border-dashed border-white/15 rounded-xl px-3 py-6 text-center">
                    No items in trash.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {trashedVideoAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="rounded-xl border border-white/15 bg-black/70 overflow-hidden flex flex-col"
                      >
                        {asset.type === "video" && (
                          <div className="relative w-full aspect-video bg-black">
                            <video
                              src={asset.publicUrl}
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                              onMouseEnter={(e) => {
                                try {
                                  const v = e.currentTarget as HTMLVideoElement;
                                  const playPromise = v.play();
                                  if (playPromise !== undefined) {
                                    playPromise.catch((error) => {
                                      console.log(
                                        "Play request safely interrupted/prevented (trash thumbnail):",
                                        (error as Error)?.message ?? String(error),
                                      );
                                    });
                                  }
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
                        )}
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
              </section>
            )}
          </div>
        </div>
      </main>
      {timelineMenu && (
        <div
          className="fixed z-40 min-w-[180px] rounded-lg border border-white/20 bg-black/90 shadow-xl py-1 text-xs text-white/80"
          style={{ top: Math.max(0, timelineMenu.y - 160), left: timelineMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
            onClick={() => {
              setClips((prev) => {
                const copy = [...prev];
                const clip = copy[timelineMenu.index];
                if (!clip) return prev;
                copy.splice(timelineMenu.index + 1, 0, clip);
                saveCanvasState(activeAssetId, copy);
                return copy;
              });
              setTimelineMenu(null);
            }}
          >
            Duplicate clip
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
            onClick={() => {
              handleExtractAudioFromClipIndex(timelineMenu.index);
              setTimelineMenu(null);
            }}
          >
            Extract audio
          </button>
          {audioTrack && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-white/10"
              onClick={() => {
                void handleBeatSync();
                setTimelineMenu(null);
              }}
            >
              🎵 AI Beat Sync
            </button>
          )}


          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-red-500/80 hover:text-white"
            onClick={() => {
              const removeIndex = timelineMenu.index;
              setClips((prev) => {
                if (removeIndex < 0 || removeIndex >= prev.length) return prev;
                const copy = [...prev];
                const [removed] = copy.splice(removeIndex, 1);
                const removedId = removed?.id;
                const stillHasActive = removedId
                  ? copy.some((clip) => clip.id === removedId)
                  : false;
                const nextActiveId =
                  removedId && removedId === activeAssetId && !stillHasActive
                    ? null
                    : activeAssetId;

                if (removedId && removedId === activeAssetId && !stillHasActive) {
                  // Clear canvas if we removed the only instance of the active clip from the timeline
                  setUploadedVideoUrl(null);
                  setUploadedVideoName(null);
                  setActiveAssetId(null);
                  setCanvasOffset({ x: 0, y: 0 });
                  setCanvasScale(1);
                  setLayerSelected(false);
                }

                saveCanvasState(nextActiveId, copy);
                return copy;
              });
              setTimelineMenu(null);
            }}
          >
            Remove from timeline
          </button>
        </div>
      )}

      {audioContextMenu && (
        <div
          className="fixed z-40 min-w-[180px] rounded-lg border border-white/20 bg-black/90 shadow-xl py-1 text-xs text-white/80"
          style={{ top: Math.max(0, audioContextMenu.y - 120), left: audioContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
            onClick={() => {
              setSelectedAudioClipId(audioContextMenu.clipId);
              setSelectedAudioId(audioContextMenu.clipId);
              setFadeMenuOpen(true);
              setAudioContextMenu(null);
            }}
          >
            Fade In / Out
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
            onClick={() => {
              setSelectedAudioClipId(audioContextMenu.clipId);
              setSelectedAudioId(audioContextMenu.clipId);
              handleSplitSelectedAudioClip();
              setAudioContextMenu(null);
            }}
          >
            Split Clip
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-red-500/80 hover:text-white"
            onClick={() => {
              const id = audioContextMenu.clipId;
              setAudioClips((prev) => {
                const next = prev.filter((clip) => clip.id !== id);
                if (next.length === 0) {
                  setAudioTrack(null);
                  setAudioTrackDuration(null);
                }
                return next;
              });
              setAudioFadeByClip((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
              if (selectedAudioClipId === id) {
                setSelectedAudioClipId(null);
              }
              if (selectedAudioId === id) {
                setSelectedAudioId(null);
              }
              setAudioContextMenu(null);
            }}
          >
            Delete Track
          </button>
        </div>
      )}

      {contextMenu && contextMenu.assetId && contextMenuAsset && (
        <div
          className="fixed z-40 min-w-[140px] rounded-lg border border-white/20 bg-black/90 shadow-xl py-1 text-xs text-white/80"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenuAsset.type === "video" && (
            <>
              {audioTrack && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10"
                  onClick={() => {
                    void handleBeatSync();
                    setContextMenu(null);
                  }}
                >
                  🎵 AI Beat Sync
                </button>
              )}
            </>
          )}
          {contextMenuAsset.type === "audio" && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-white/10"
              onClick={() => {
                setAudioTrack(contextMenuAsset);
                setBeatMarkers([]);
                const baseDuration = contextMenuAsset.durationSeconds ?? 0;
                const duration = baseDuration > 0 ? baseDuration : 0;
                const clipId = `audio-clip-${contextMenuAsset.id}-${Date.now()}`;
                const initialClip: AudioClip = {
                  id: clipId,
                  publicUrl: contextMenuAsset.publicUrl,
                  originalDuration: duration,
                  sourceStart: 0,
                  sourceEnd: duration,
                  timelineStart: 0,
                };
                setAudioClips([initialClip]);
                setSelectedAudioClipId(clipId);
                setAudioTrackDuration(duration || null);
                setContextMenu(null);
              }}
            >
              Set as audio track
            </button>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-red-500/80 hover:text-white"
            onClick={() => {
              void handleTrashAsset(contextMenu.assetId!);
              setContextMenu(null);
            }}
          >
            Delete (move to trash)
          </button>
        </div>
      )}
    </div>
  );
} 