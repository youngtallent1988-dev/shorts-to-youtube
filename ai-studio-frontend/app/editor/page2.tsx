"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { TrimTimeline } from "../../components/TrimTimeline";
import { API_BASE } from "../../lib/apiBase";

type AssetType = "video" | "image" | "audio";
type ExportFormat = "mp4" | "mp3" | "wav" | "jpeg" | "png";

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
  // Optional client-side fields for playback calibration
  speed?: number; // 0.5x, 1x, 2x, etc.
  durationSeconds?: number; // audio/video duration when known
};

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
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [downloadAllClips, setDownloadAllClips] = useState(false);
  const [activeView, setActiveView] = useState<"editor" | "trash">("editor");

  const [assetType, setAssetType] = useState<AssetType>("video");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  // Secondary audio track for the timeline (separate from canvas video)
  const [audioTrack, setAudioTrack] = useState<MediaAsset | null>(null);
  const [beatMarkers, setBeatMarkers] = useState<number[]>([]);
  const [isBeatSyncLoading, setIsBeatSyncLoading] = useState(false);
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
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
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [playheadIndex, setPlayheadIndex] = useState<number | null>(null);

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
  const [canvasMuted, setCanvasMuted] = useState(true);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{ mouseY: number; startScale: number } | null>(null);
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

  useEffect(() => {
    async function loadAssets() {
      setAssetsLoading(true);
      setAssetsError(null);

      try {
        const res = await fetch(
          `${API_BASE}/api/assets?type=${assetType}&includeTrash=true`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        let data: any = null;
        try {
          data = await res.json();
        } catch (jsonErr) {
          console.error("Failed to parse /api/assets JSON:", jsonErr);
        }

        if (!res.ok || !data || data.ok === false) {
          console.error("loadAssets: non-OK response", {
            status: res.status,
            data,
          });
          setAssetsError((data && data.error) || "Failed to load assets.");
          setAssets([]);
          return;
        }

        setAssets(Array.isArray(data.files) ? data.files : []);
      } catch (err) {
        console.error("loadAssets failed:", err);
        setAssetsError("Failed to load assets. Using empty asset list.");
        setAssets([]);
      } finally {
        setAssetsLoading(false);
      }
    }

    void loadAssets();
  }, [API_BASE, assetType]);

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

  // Global mouse handlers for drag/resize on the canvas layer
  useEffect(() => {
    if (!isDraggingLayer && !isResizingLayer) return;

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
    }

    function handleMouseUp() {
      setIsDraggingLayer(false);
      setIsResizingLayer(false);
      dragStartRef.current = null;
      resizeStartRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLayer, isResizingLayer]);

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
  }, [selectedClipId]);

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

      const res = await fetch(`${API_BASE}/api/assets/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setAssetsError(data?.error || "Upload failed.");
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
      }
    } catch (err) {
      console.error(err);
      setAssetsError("Upload failed.");
    }
  }

  async function handleTrashAsset(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/assets/${id}/trash`, {
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
      const res = await fetch(`${API_BASE}/api/assets/${id}/restore`, {
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
      const res = await fetch(`${API_BASE}/api/assets/${id}`, {
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
          console.log("Pause during timeline toggle encountered an error:", (error as Error)?.message ?? String(error));
        }
      }
      return;
    }

    // Start playback from the selected clip or from the first clip
    let startIndex = 0;
    if (activeAssetId) {
      const idx = clips.findIndex((c) => c.id === activeAssetId);
      if (idx !== -1) startIndex = idx;
    }

    // Ensure the playhead (white bar) starts at the beginning of the
    // selected clip instead of jumping from a previous position.
    let offset = 0;
    for (let i = 0; i < startIndex; i++) {
      const id = clips[i]?.id;
      if (id) offset += getClipTimelineDuration(id);
    }
    setCurrentTimelineTime(offset);

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

  function handleUseAsset(asset: MediaAsset) {
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
    } else if (asset.type === "audio") {
      // Use this asset as the active audio track for the timeline
      setAudioTrack(asset);
      setBeatMarkers([]);
    }
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

      const data = await res.json();

      if (!res.ok || !data?.ok) {
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

  const allTimelineSelected =
    clips.length > 0 &&
    selectedTimelineClipIds.length === clips.length;

  function toggleSelectAllTimelineClips(checked: boolean) {
    if (checked) {
      setSelectedTimelineClipIds(clips.map((c) => c.id));
    } else {
      setSelectedTimelineClipIds([]);
    }
  }

  function toggleSelectSingleTimelineClip(id: string) {
    setSelectedTimelineClipIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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

  async function handleDownloadCurrentClip() {
    let target: MediaAsset | undefined;

    if (selectedTimelineClipIds.length === 1) {
      const id = selectedTimelineClipIds[0];
      target = clips.find((c) => c.id === id);
    }

    if (!target) {
      target =
        (activeAssetId && clips.find((c) => c.id === activeAssetId)) ||
        clips[0];
    }

    if (!target) return;
    await downloadAssetFile(target);
  }

  async function handleDownloadAllTimelineClips() {
    const clipsToUse =
      selectedTimelineClipIds.length > 0
        ? clips.filter((c) => selectedTimelineClipIds.includes(c.id))
        : clips;

    if (!clipsToUse.length) return;

    try {
      setExportStatus("Preparing timeline export...");

      const res = await fetch("/api/export-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrls: clipsToUse.map((c) => c.publicUrl),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok || !data.downloadUrl) {
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
      } catch (err) {
        console.error(err);
        setExportStatus("Timeline download failed.");
      }
    } catch (err) {
      console.error(err);
      setExportStatus("Timeline export failed.");
    }
  }

  const hasVideo = !!uploadedVideoUrl;
  const activeAssets = assets.filter((a) => a.type === assetType && a.status === "active");
  const trashedAssets = assets.filter((a) => a.status === "trashed");
  const trashedVideoAssets = trashedAssets.filter((a) => a.type === "video");

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

    // Timeline duration for this clip is its trimmed length. Visual
    // width is derived proportionally; playback speed is handled by
    // the animation loop, not by compressing the block.
    return effective;
  }

  const totalTimelineDuration = clips.reduce(
    (acc, clip) => acc + getClipTimelineDuration(clip.id),
    0,
  );
  const anyMissingDurations = clips.some((clip) => !(clipDurations[clip.id] > 0));

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

      const rawDeltaSeconds = (now - lastNow) / 1000;
      lastNow = now;

      // Precompute per-clip effective durations on the timeline.
      const segmentDurations = clips.map((clip) => getClipTimelineDuration(clip.id));
      const totalDuration = segmentDurations.reduce((sum, d) => sum + d, 0);
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
      // For now, keep the playback timeline strictly 1:1 with
      // media time so the red playhead and clip duration stay in
      // perfect sync, ignoring per-clip speed modifiers in the
      // preview engine.
      const speedFactor = 1;

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

            // Advance the logical playhead. When we have a real video
      // element and it's playing smoothly, derive the global
      // timeline clock directly from the element's currentTime
      // so the red playhead and the visual media are locked.
      let nextTimelineTime = localTimelineTime;
      if (videoEl && !isBuffering && activeClipId) {
        const full = clipDurations[activeClipId] ?? 0;
        const trim = clipTrims[activeClipId];
        const startOffset = trim && full > 0
          ? Math.max(0, Math.min(trim.start, full))
          : 0;
        const endOffset = trim && full > 0
          ? Math.max(startOffset, Math.min(trim.end ?? full, full))
          : full;
        const trimmedLength = Math.max(0, endOffset - startOffset);

        const localVideoTime = Math.max(
          0,
          Math.min((videoEl.currentTime || 0) - startOffset, trimmedLength),
        );
        nextTimelineTime = activeStart + localVideoTime;
      } else {
        // Fallback: use wall‑clock based advancement when we do not
        // have a usable video element (e.g. audio‑only timelines).
        const deltaSeconds = isBuffering ? 0 : rawDeltaSeconds;
        nextTimelineTime = localTimelineTime + deltaSeconds;
      }

      // Stop cleanly at the end of the full timeline.
      if (nextTimelineTime >= totalDuration) {
        nextTimelineTime = totalDuration;
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

      if (nextTimelineTime >= totalDuration) {
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
    getClipTimelineDuration,
    videoRef,
  ]);

  async function handleExtractAudio(assetId: string) {
    try {
      setAssetsError(null);
      setIsExtractingAudio(true);
      const res = await fetch(`${API_BASE}/api/extract-audio`, {
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
      const res = await fetch(`${API_BASE}/api/beat-sync`, {
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

  return (
    <div className="min-h-screen flex flex-col text-white bg-gradient-to-b from-black via-slate-950 to-black">
      {/* HEADER */}
      <header className="border-b border-white/10 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-1">Studio</div>
          {activeView === "editor" ? (
            <>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Editor workspace</h1>
              <p className="mt-1 text-[12px] md:text-sm text_white/60 max-w-xl">
                This will be your dedicated video editing workspace. For now, you can open any video
                in the Create page to edit its title and reuse the prompt.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Trash</h1>
              <p className="mt-1 text-[12px] md:text-sm text-white/60 max-w-xl">
                Review deleted videos here. You can restore them or permanently delete them.
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] relative">
          <button
            type="button"
            onClick={() => router.push("/creation")}
            className="glow-focus px-3 py-1.5 rounded-full border border-white/20 text-white/80 bg-black/40 hover:bg-black/60 text-xs"
          >
            ← Back to Create
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              className={`glow-focus px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 ${
                hasVideo
                  ? "border-cyan-400/60 text-cyan-100 bg-black/40 hover:bg-black/70"
                  : "border-white/25 text-white/60 bg-black/40 hover:bg-black/60"
              }`}
            >
              <span>Download</span>
              <span className="text-[9px]">▾</span>
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/15 bg-black/90 shadow-xl p-3 text-[11px] space-y-3 z-20">
                <div className="text-white/60 font-semibold">Download clips</div>

                {/* Optional format selector – currently informational */}
                <div className="space-y-1">
                  <div className="text-white/50">Format (for future export)</div>
                  <div className="mt-1 space-y-1">
                    {[
                      { id: "mp4" as ExportFormat, label: "MP4 (video)" },
                      { id: "mp3" as ExportFormat, label: "MP3 (audio)" },
                      { id: "wav" as ExportFormat, label: "WAV (audio)" },
                      { id: "jpeg" as ExportFormat, label: "JPEG (image)" },
                      { id: "png" as ExportFormat, label: "PNG (image)" },
                    ].map((fmt) => {
                      const active = exportFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setExportFormat(fmt.id)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] text-left ${
                            active
                              ? "bg-white text-black font-semibold border-white/80"
                              : "bg-black/40 text-white/70 border-white/25 hover:bg-black/70"
                          }`}
                        >
                          {fmt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {clips.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-white/10">
                    <div className="text-white/60 font-semibold text-[11px]">
                      Select clips
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-white/75">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={allTimelineSelected}
                        onChange={(e) => toggleSelectAllTimelineClips(e.target.checked)}
                      />
                      <span>All timeline clips</span>
                    </label>

                    <div className="max-h-28 overflow-y-auto space-y-1 pl-1">
                      {clips.map((clip, index) => (
                        <label
                          key={clip.id + index}
                          className="flex items-center gap-2 text-[11px] text-white/70"
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={selectedTimelineClipIds.includes(clip.id)}
                            onChange={() => toggleSelectSingleTimelineClip(clip.id)}
                          />
                          <span className="truncate">
                            Clip {index + 1}: {clip.originalName}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleDownloadCurrentClip}
                    disabled={!clips.length}
                    className={`w-full px-3 py-1.5 rounded-lg border text-left text-[11px] ${
                      clips.length
                        ? "border-white/40 bg-black/60 hover:bg-black/80 text-white/80"
                        : "border-white/20 bg-black/40 text-white/40 cursor-not-allowed"
                    }`}
                  >
                    Download current clip
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadAllTimelineClips}
                    disabled={!clips.length}
                    className={`w-full px-3 py-1.5 rounded-lg border text-left text-[11px] ${
                      clips.length
                        ? "border-cyan-400/70 bg-cyan-500/20 hover:bg-cyan-400/30 text-cyan-100"
                        : "border-white/20 bg-black/40 text-white/40 cursor-not-allowed"
                    }`}
                  >
                    Download all timeline clips
                  </button>
                </div>

                {exportStatus && (
                  <div className="text-[10px] text-white/55 pt-1 border-t border-white/10 mt-1">
                    {exportStatus}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 px-4 py-6 flex flex-col items-start gap-6">
        <div className="w-full lg:flex-1 flex flex-col items-center">
          <div className="w-full max-w-5xl space-y-5 text-[13px] md:text-sm text-white/70">
            {activeView === "editor" && (
              <>
            {/* Canvas header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-1">Canvas</div>
                <p className="text-white/65">
                  Start with a blank canvas. You&apos;ll be able to drop clips here, adjust framing, and
                  preview edits before export.
                </p>
              </div>
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
            <div className="mt-4 flex flex-col lg:flex-row gap-6 items-start">
              {/* Assets column */}
              <div className="w-full lg:w-1/3 space-y-3 text-[11px] text-white/70">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="uppercase tracking-[0.18em] text-white/40">Assets</span>
                    <div className="flex gap-1">
                      {[
                        { id: "video" as AssetType, label: "Video" },
                        { id: "image" as AssetType, label: "Images" },
                        { id: "audio" as AssetType, label: "Audio" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAssetType(opt.id)}
                          className={`glow-focus px-2.5 py-1.5 rounded-full border text-[11px] ${
                            assetType === opt.id
                              ? "bg-white text-black font-semibold border-white/80"
                              : "bg-black/40 text-white/70 border-white/25"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-typecenter gap-2">
                    <label className="glow-focus inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/25 bg-black/60 cursor-pointer hover:border-cyan-400/70 hover:bg-black/80">
                      <span className="text-xs">
                        {assetType === "video"
                          ? "Upload video"
                          : assetType === "image"
                          ? "Upload image"
                          : "Upload audio"}
                      </span>
                      <input
                        type="file"
                        accept={assetType === "video" ? "video/*" : assetType === "image" ? "image/*" : "audio/*"}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          if (assetType === "video") {
                            const localUrl = URL.createObjectURL(file);
                            setUploadedVideoUrl(localUrl);
                            setUploadedVideoName(file.name);
                            setCanvasOffset({ x: 0, y: 0 });
                            setCanvasScale(1);
                            setLayerSelected(false);
                          }

                          void handleAssetUpload(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>

                {assetsError && <div className="text-red-400 text-[11px]">{assetsError}</div>}

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="uppercase tracking-[0.16em] text-white/40">
                      Active {assetType === "video" ? "videos" : assetType === "image" ? "images" : "audio"}
                    </span>
                  </div>
                  {assetsLoading ? (
                    <div className="text-white/40">Loading...</div>
                  ) : activeAssets.length === 0 ? (
                    <div className="text-white/40">No {assetType} assets yet.</div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {activeAssets.map((asset) => (
                        <div
                          key={asset.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", asset.id);
                            e.dataTransfer.effectAllowed = "copyMove";
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              assetId: asset.id,
                              source: "asset",
                            });
                          }}
                          className="group flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
                        >
                          {asset.type === "video" && (
                            <div className="relative h-10 w-16 overflow-hidden rounded-md bg-black/80 border border-white/15 flex-shrink-0">
                              <video
                                src={asset.publicUrl}
                                muted
                                playsInline
                                className="h-full w-full object-cover"
                                onMouseEnter={(e) => {
                                  try {
                                    const v = e.currentTarget as HTMLVideoElement;
                                    const playPromise = v.play();
                                    if (playPromise !== undefined) {
                                      playPromise.catch((error) => {
                                        console.log(
                                          "Play request safely interrupted/prevented (asset thumbnail):",
                                          (error as Error)?.message ?? String(error),
                                        );
                                      });
                                    }
                                  } catch {
                                    // ignore autoplay
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

                          <button
                            type="button"
                            onClick={() => handleUseAsset(asset)}
                            className="truncate text-left flex-1 hover:text-white"
                          >
                            {asset.originalName}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => router.push("/editor/trash")}
                      className="inline-flex items-center gap-1 text-white/40 hover:text-white transition-colors"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      <span className="uppercase tracking-[0.16em]">Trash</span>
                      <span className="text-[10px] text-white/50">
                        {trashedVideoAssets.length} video{trashedVideoAssets.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    <span className="text-white/40 text-[10px]">Auto-deletes after 30 days</span>
                  </div>
                </div>

                {/* Timeline play button, lower in the column and more visible */}
                <div className="flex justify-center mt-8">
                  <button
                    type="button"
                    onClick={handlePlayTimelineToggle}
                    disabled={clips.length === 0}
                    className={`glow-focus h-14 w-14 rounded-full border flex items-center justify-center text-base font-semibold ${
                      clips.length === 0
                        ? "border-white/15 text-white/35 cursor-not-allowed bg-black/40"
                        : isTimelinePlaying
                        ? "border-cyan-400 text-black bg-cyan-300 hover:bg-cyan-200"
                        : "border-cyan-400/80 text-black bg-cyan-400 hover:bg-cyan-300"
                    }`}
                    title="Play timeline"
                  >
                    {isTimelinePlaying ? "❚❚" : "▶"}
                  </button>
                </div>
              </div>

              {/* Canvas column */}
              <div className="w-full lg:flex-1 flex flex-col items_center gap-3">
                <div
                  className="bg-white rounded-3xl border border-white/25 shadow-[0_30px_120px_rgba(0,0,0,0.75)] overflow-hidden flex items-center justify-center relative"
                  style={{
                    width: aspect === "16:9" ? "100%" : "40%",
                    maxWidth: aspect === "16:9" ? "960px" : "420px",
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
                    if (asset) handleUseAsset(asset);
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
                  {uploadedVideoUrl ? (
                    <div
                      className="relative w-full h-full bg-black overflow-hidden"
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
                        {/* Primary canvas video element */}
                        <video
                          key={activeAssetId || uploadedVideoUrl || "canvas-video"}
                          ref={videoRef}
                          src={uploadedVideoUrl}
                          autoPlay={!isTimelinePlaying}
                          loop={!isTimelinePlaying}
                          muted={canvasMuted}
                          playsInline
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

                        {/* Hidden audio element for the timeline's audio track.
                            This lets the attached audio file actually play
                            when the timeline is running. Only render it when
                            we have a real audio URL to avoid empty src
                            warnings in the browser. */}
                        {audioTrack?.publicUrl && (
                          <audio
                            ref={audioRef}
                            src={audioTrack.publicUrl}
                            style={{ display: "none" }}
                          />
                        )}

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
                  ) : (
                    <div className="w-full h-full bg-white" />
                  )}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={!activeAssetId || isExtractingAudio}
                    onClick={() => {
                      if (!activeAssetId) return;
                      void handleExtractAudio(activeAssetId);
                    }}
                    className={`glow-focus px-4 py-1.5 rounded-full border text-xs font-semibold ${
                      !activeAssetId || isExtractingAudio
                        ? "border-white/20 text-white/40 bg-black/40 cursor-not-allowed"
                        : "border-amber-300 text-amber-200 bg-black/50 hover:bg-black/80"
                    }`}
                  >
                    {isExtractingAudio ? "🎬 Extracting audio..." : "🎬 Extract Audio"}
                  </button>
                </div>
              </div>
            </div>

            {/* Timeline section */}
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/60">
                <div className="uppercase tracking-[0.18em] text-white/40">Timeline</div>
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2 text-[10px] text-white/60">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3 w-3 text-white/70"
                        aria-hidden="true"
                      >
                        <circle
                          cx="11"
                          cy="11"
                          r="6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                        <line
                          x1="15.5"
                          y1="15.5"
                          x2="20"
                          y2="20"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="whitespace-nowrap">Timeline zoom</span>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.05"
                      value={zoomLevel}
                      onChange={(e) => setZoomLevel(Number(e.target.value) || 1)}
                      className="w-24 accent-cyan-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setZoomLevel(1);
                        setCurrentTimelineTime(0);
                      }}
                      className="glow-focus ml-2 px-2.5 py-1 rounded-full border border-white/30 text-[10px] text-white/70 hover:border-cyan-400/80 hover:text-white"
                    >
                      👁️ View All
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>Clips will appear here in order when the editor is wired to your videos.</span>
                    {totalTimelineDuration > 0 && (
                      <span className="font-mono text-white text-sm md:text-base font-semibold">
                        {formatTime(currentTimelineTime)} / {formatTime(totalTimelineDuration)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3">
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
                  clipSpeeds={clipSpeeds}
                  totalTimelineDuration={totalTimelineDuration}
                  currentTimelineTime={currentTimelineTime}
                  setCurrentTimelineTime={setCurrentTimelineTime}
                  activeTransitionIndex={activeTransitionIndex}
                  setActiveTransitionIndex={setActiveTransitionIndex}
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
                  onUpdateTrim={(key, id, start, end) => {
                    // Lock updates to the active timeline instance key only
                    setTimelineInstanceTrims((prev) => ({
                      ...prev,
                      [key]: { start, end },
                    }));

                    // Optionally mirror to asset-level trim so backend/export still sees it
                    setClipTrims((prev) => ({
                      ...prev,
                      [id]: { start, end },
                    }));

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
                  onAddBlankClip={handleAppendBlankClip}
                  onClipContextMenu={(index, event) => {
                    setTimelineMenu({ index, x: event.clientX, y: event.clientY });
                  }}
                />
              </div>
            </div>

            {/* Transition templates */}
            <div className="mt-4 rounded-2xl border border-white/15 bg-black/80 px-4 py-3 space-y-3 text-[11px]">
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

            </>
            )}

            {activeView === "trash" && (
              <section className="mt-6 space-y-3 rounded-2xl border border-white/15 bg-black/80 px-4 py-3">
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
          style={{ top: timelineMenu.y, left: timelineMenu.x }}
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
              const clip = clips[timelineMenu.index];
              if (!clip) return;
              void handleExtractAudio(clip.id);
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

          {/* Clip speed presets */}
          <div className="mt-1 border-t border-white/10 pt-1.5 px-3 pb-1">
            <div className="mb-1 text-[10px] text-white/50">Clip speed</div>
            {(() => {
              const clip = clips[timelineMenu.index];
              if (!clip) return null;
              const currentSpeed = clipSpeeds[clip.id] ?? 1;
              const speeds: { value: number; label: string }[] = [
                { value: 0.5, label: "0.5x (Slow)" },
                { value: 1.0, label: "1.0x (Normal)" },
                { value: 1.5, label: "1.5x (Fast)" },
                { value: 2.0, label: "2.0x (Double)" },
              ];
              return (
                <div className="flex flex-col gap-0.5">
                  {speeds.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`w-full text-left px-2 py-0.5 rounded-md text-[10px] ${
                        currentSpeed === opt.value
                          ? "bg-cyan-500/80 text-black"
                          : "bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                      onClick={() => {
                        // Persist speed in both the per-clip speed map and
                        // on the clip object itself so playback and UI
                        // can react instantly.
                        setClipSpeeds((prev) => ({
                          ...prev,
                          [clip.id]: opt.value,
                        }));
                        setClips((prev) =>
                          prev.map((c) =>
                            c.id === clip.id
                              ? {
                                  ...c,
                                  speed: opt.value,
                                }
                              : c,
                          ),
                        );
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

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

      {contextMenu && contextMenu.assetId && contextMenuAsset && (
        <div
          className="fixed z-40 min-w-[140px] rounded-lg border border-white/20 bg-black/90 shadow-xl py-1 text-xs text-white/80"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenuAsset.type === "video" && (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-white/10"
                onClick={() => {
                  void handleExtractAudio(contextMenu.assetId!);
                  setContextMenu(null);
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