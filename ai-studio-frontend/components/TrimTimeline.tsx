"use client";

import React, { useEffect, useRef, useState } from "react";

// Hard-coded ruler ticks for a Canva-style grid
const RULER_TICKS: { label: string; position: number }[] = [
  { label: "0s", position: 0 },
  { label: "10s", position: 0.2 },
  { label: "20s", position: 0.4 },
  { label: "30s", position: 0.6 },
  { label: "40s", position: 0.8 },
  { label: "50s", position: 0.98 },
];

export type TimelineClip = {
  id: string; // underlying asset id
  key: string; // unique instance key for this position on the timeline
  label: string;
  thumbnailUrl: string;
  type?: string;
};

export type TrimTimelineProps = {
  clips: TimelineClip[];
  selectedClipKey?: string | null;
  onSelectClip?: (key: string, id: string) => void;

  // Optional extras we accept but don't fully implement here
  clipDurations?: Record<string, number>;
  instanceTrims?: Record<string, { start: number; end: number | null }>;
  onUpdateTrim?: (key: string, id: string, start: number, end: number) => void;
  // Live trim callback for dragging; called on every mousemove. Should
  // update client-side state only (no backend calls) so the timeline
  // length and clip widths respond in real time.
  onUpdateTrimLive?: (key: string, id: string, start: number, end: number) => void;
  beatMarkers?: number[];
  isBeatSyncLoading?: boolean;
  onClipContextMenu?: (index: number, event: React.MouseEvent<HTMLDivElement>) => void;
  gapTransitions?: Record<number, { type: string; duration?: number }>;
  onSelectTransitionGap?: (gapIndex: number) => void;
  onChangeTransition?: (gapIndex: number, choice: string) => void;
  onAddBlankClip?: (gapIndex: number) => void;
  isPlaying?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  totalTimelineDuration?: number;
  currentTimelineTime?: number;
  setCurrentTimelineTime?: (time: number) => void;
  setClips?: (value: any) => void;
  activeTransitionIndex?: number | null;
  setActiveTransitionIndex?: (index: number | null) => void;
  setActiveTab?: (tab: string) => void;
  clipSpeeds?: Record<string, number>;
  zoomLevel?: number;
  setZoomLevel?: (value: number) => void;
  // Reorder clips via drag-and-drop
  onReorderClips?: (fromIndex: number, toIndex: number) => void;
};

export const TrimTimeline: React.FC<TrimTimelineProps> = ({
  clips,
  selectedClipKey = null,
  onSelectClip,
  clipDurations,
  instanceTrims,
  onUpdateTrim,
  onUpdateTrimLive,
  beatMarkers = [],
  zoomLevel = 1,
  setZoomLevel,
  onClipContextMenu,
  gapTransitions,
  onSelectTransitionGap,
  onChangeTransition,
  onAddBlankClip,
  activeTransitionIndex,
  setActiveTransitionIndex,
  setClips,
  setActiveTab,
  clipSpeeds = {},
  totalTimelineDuration = 0,
  currentTimelineTime = 0,
  setCurrentTimelineTime,
  videoRef,
  onReorderClips,
}) => {
  const isDraggingZoomLineRef = useRef(false);
  const startYRef = useRef(0);
  const startZoomRef = useRef(1);
  const [isZoomLineHovered, setIsZoomLineHovered] = useState(false);

  // Drag state for clip reordering
  const draggingClipIndexRef = useRef<number | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);

  // Per-instance trim expressed as local [0–1] ratios within each card.
  const [clipPercents, setClipPercents] = useState<
    Record<string, { start: number; end: number }>
  >({});

  const clipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Track scroll position so we can render a visible custom slider
  // bar for the timeline clips.
  const [scrollMeta, setScrollMeta] = useState<{
    contentWidth: number;
    viewportWidth: number;
    scrollLeft: number;
  }>({ contentWidth: 0, viewportWidth: 0, scrollLeft: 0 });
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const sliderDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);

  const isDraggingPlayheadRef = useRef(false);

  const draggingHandleRef = useRef<

    | {
        clipKey: string;
        side: "start" | "end";
        startX: number;
        startStart: number;
        startEnd: number;
        cardWidth: number;
        index: number;
        currentStart: number;
        currentEnd: number;
      }
    | null
  >(null);

  // Rebuild per-instance trim percentages whenever clips or their
  // canonical trims/durations change. This keeps the purple handles
  // in sync with the workspace state even after reload.
  useEffect(() => {
    setClipPercents((prev) => {
      const next: Record<string, { start: number; end: number }> = {};

      clips.forEach((clip) => {
        const existing = prev[clip.key];
        if (existing) {
          next[clip.key] = existing;
          return;
        }

        const duration = clipDurations?.[clip.id];
        const trim = instanceTrims?.[clip.key];

        if (duration && duration > 0 && trim) {
          const safeStart = Math.max(0, Math.min(trim.start, duration));
          const safeEndRaw =
            trim.end != null ? Math.max(safeStart, Math.min(trim.end, duration)) : duration;
          const safeEnd = safeEndRaw > 0 ? safeEndRaw : duration;

          next[clip.key] = {
            start: safeStart / duration,
            end: safeEnd / duration,
          };
        } else {
          next[clip.key] = { start: 0, end: 1 };
        }
      });

      return next;
    });
  }, [clips, clipDurations, instanceTrims]);

  // Initialize scroll metadata so the custom scrollbar appears as
  // soon as the track is rendered or when its length changes.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setScrollMeta({
      contentWidth: el.scrollWidth,
      viewportWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
    });
  }, [clips.length, totalTimelineDuration]);

  const clampedTimelineDuration = Math.max(0, totalTimelineDuration || 0);
  const zoomScale = Math.max(1, Math.min(zoomLevel ?? 1, 5));
  const safePlayheadTime = Math.max(
    0,
    Math.min(currentTimelineTime || 0, clampedTimelineDuration),
  );

  // Fixed horizontal time scale: 1 second of timeline = 25px of width.
  // zoomScale is used only to stretch the timeline vertically.
  const pixelsPerSecond = 25;

  // Global mouse listeners for purple handle dragging, the
  // custom scroll slider, and playhead scrubbing.
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = draggingHandleRef.current;

      // Handle vertical drag on the top ruler hot-zone for zooming
      if (isDraggingZoomLineRef.current && setZoomLevel) {
        const deltaY = e.clientY - startYRef.current;
        // Invert direction so dragging UP increases zoom (bigger timeline),
        // and dragging DOWN decreases zoom.
        let updatedZoom = startZoomRef.current - deltaY * 0.02;
        if (!Number.isFinite(updatedZoom)) updatedZoom = 1;
        if (updatedZoom < 1) updatedZoom = 1;
        if (updatedZoom > 5) updatedZoom = 5;
        setZoomLevel(updatedZoom);
      }

      // Handle dragging the global playhead for scrubbing
      if (isDraggingPlayheadRef.current && trackRef.current && setCurrentTimelineTime) {
        const el = trackRef.current;
        const rect = el.getBoundingClientRect();
        const timelineDuration = clampedTimelineDuration;

        if (timelineDuration > 0) {
          const x = e.clientX - rect.left + el.scrollLeft;
          const rawTime = x / pixelsPerSecond;
          const snapTime = Math.max(0, Math.min(rawTime, timelineDuration));

          setCurrentTimelineTime(snapTime);

          const videoEl = videoRef?.current ?? null;
          if (videoEl && Number.isFinite(snapTime)) {
            try {
              videoEl.currentTime = snapTime;
            } catch {
              // ignore seek errors
            }
          }
        }
      }

      // Handle slider dragging if active
      if (isSliderDragging && sliderDragRef.current && trackRef.current) {
        const dx = e.clientX - sliderDragRef.current.startX;
        const el = trackRef.current;
        const maxScroll = Math.max(1, el.scrollWidth - el.clientWidth);
        const trackWidthPx = el.clientWidth || 1;
        const scrollPerPixel = maxScroll / trackWidthPx;
        const nextScrollLeft = Math.min(
          maxScroll,
          Math.max(0, sliderDragRef.current.startScrollLeft + dx * scrollPerPixel),
        );
        el.scrollLeft = nextScrollLeft;
        setScrollMeta((prev) => ({
          ...prev,
          contentWidth: el.scrollWidth,
          viewportWidth: el.clientWidth,
          scrollLeft: nextScrollLeft,
        }));
      }

      if (!drag) return;

      const { clipKey, side, startX, startStart, startEnd, cardWidth, index } = drag;
      if (!cardWidth) return;

      const dx = e.clientX - startX;

      const minSpan = 0.05; // minimum 5% segment width in local 0–1 space

      // Convert the mouse delta directly into seconds using the
      // fixed pixel-per-second scale, then into a per-clip ratio.
      const clip = clips[index];
      const baseDuration = clip && clipDurations?.[clip.id] ? clipDurations[clip.id]! : 1;
      const deltaSeconds = dx / pixelsPerSecond;
      const deltaRatio = deltaSeconds / baseDuration;

      let newStart = startStart;
      let newEnd = startEnd;

      if (side === "start") {
        newStart = startStart + deltaRatio;
        newStart = Math.max(0, Math.min(newStart, newEnd - minSpan));
      } else {
        newEnd = startEnd + deltaRatio;
        newEnd = Math.min(1, Math.max(newEnd, newStart + minSpan));
      }

      // Remember the latest ratios so mouseup can commit them back to
      // the workspace trims in real seconds.
      if (draggingHandleRef.current) {
        draggingHandleRef.current.currentStart = newStart;
        draggingHandleRef.current.currentEnd = newEnd;
      }

      setClipPercents((prev) => ({
        ...prev,
        [clipKey]: {
          start: newStart,
          end: newEnd,
        },
      }));

      // Live trim propagation in seconds so the parent can recompute
      // totalTimelineDuration and any duration-dependent layout while
      // the user is dragging.
      if (onUpdateTrimLive && clip && baseDuration > 0) {
        const startSeconds = Math.max(0, Math.min(newStart * baseDuration, baseDuration));
        const endSeconds = Math.max(
          startSeconds,
          Math.min(newEnd * baseDuration, baseDuration),
        );
        onUpdateTrimLive(clipKey, clip.id, startSeconds, endSeconds);
      }

      // Snap the global playhead + preview to whichever edge is being dragged.
      const totalClips = Math.max(clips.length, 1);
      const baseStartRatio = index / totalClips;
      const baseEndRatio = (index + 1) / totalClips;
      const span = baseEndRatio - baseStartRatio;

      const startGlobalRatio = baseStartRatio + newStart * span;
      const endGlobalRatio = baseStartRatio + newEnd * span;

      const snapRatio = side === "start" ? startGlobalRatio : endGlobalRatio;
      const timelineDuration = clampedTimelineDuration;
      const snapTime = timelineDuration > 0 ? snapRatio * timelineDuration : 0;

      if (setCurrentTimelineTime) {
        setCurrentTimelineTime(snapTime);
      }

      const videoEl = videoRef?.current ?? null;
      if (videoEl && Number.isFinite(snapTime)) {
        try {
          videoEl.currentTime = snapTime;
        } catch {
          // ignore seek errors
        }
      }
    }

    function handleMouseUp() {
      // Stop slider dragging
      setIsSliderDragging(false);
      sliderDragRef.current = null;

      // Stop playhead dragging
      isDraggingPlayheadRef.current = false;

      // Stop zoom-line dragging
      isDraggingZoomLineRef.current = false;

      const drag = draggingHandleRef.current;
      if (drag && onUpdateTrim) {
        const { clipKey, index, currentStart, currentEnd, startStart, startEnd } = drag;
        const clip = clips[index];
        const duration = clipDurations?.[clip?.id];

        if (clip && duration && duration > 0) {
          const startRatio = typeof currentStart === "number" ? currentStart : startStart;
          const endRatio = typeof currentEnd === "number" ? currentEnd : startEnd;

          const startSeconds = Math.max(0, Math.min(startRatio * duration, duration));
          const endSeconds = Math.max(
            startSeconds,
            Math.min(endRatio * duration, duration),
          );

          onUpdateTrim(clipKey, clip.id, startSeconds, endSeconds);
        }
      }

      draggingHandleRef.current = null;
      // Clear any pending insertion indicator for drag-reorder
      draggingClipIndexRef.current = null;
      setDragInsertIndex(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [clips, clipDurations, totalTimelineDuration, setCurrentTimelineTime, videoRef, onUpdateTrim, onUpdateTrimLive, isSliderDragging, clampedTimelineDuration, setZoomLevel]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        background: "#18191e",
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 0,
        paddingRight: 0,
        borderRadius: 12,
        boxSizing: "border-box",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      }}
    >
      {/* Time ruler with widely spaced ticks */}
      <div
        style={{
          position: "relative",
          height: 28,
          display: "flex",
          alignItems: "flex-end",
          paddingBottom: 4,
          marginBottom: 8,
          borderBottom: "1px solid rgba(148,163,184,0.3)",
          color: "#e5e7eb",
          fontSize: 10,
          overflow: "hidden",
        }}
      >
        {/* Hot-zone zoom border line at the very top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            cursor: "ns-resize",
            zIndex: 60,
            background: isZoomLineHovered ? "rgba(139, 61, 255, 0.4)" : "transparent",
          }}
          onMouseEnter={() => setIsZoomLineHovered(true)}
          onMouseLeave={() => setIsZoomLineHovered(false)}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            isDraggingZoomLineRef.current = true;
            startYRef.current = e.clientY;
            startZoomRef.current = zoomLevel;
          }}
        />

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          {RULER_TICKS.map((tick) => (
            <div
              key={tick.label}
              style={{
                position: "absolute",
                left: `${tick.position * 100}%`,
                bottom: 0,
                transform: "translateX(-50%)",
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  height: 10,
                  width: 1,
                  background: "rgba(148,163,184,0.9)",
                  marginBottom: 2,
                }}
              />
              <div style={{ color: "#9ca3af" }}>{tick.label}</div>
            </div>
          ))}

          {/* Faint vertical grid lines */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 24,
              bottom: -8,
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            {RULER_TICKS.map((tick) => (
              <div
                key={`${tick.label}-grid`}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${tick.position * 100}%`,
                  width: 1,
                  background: "rgba(255,255,255,0.12)",
                  transform: "translateX(-0.5px)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Extended playhead with Canva-style teardrop badge */}
      {clampedTimelineDuration > 0 && (
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 16,
            width: 2,
            background: "#ffffff",
            zIndex: 100,
            left: `${Math.max(
              0,
              safePlayheadTime * pixelsPerSecond - scrollMeta.scrollLeft,
            )}px`,
          }}
          onMouseDown={(e) => {
            // Begin dragging from the playhead itself
            e.preventDefault();
            if (!trackRef.current || !setCurrentTimelineTime) return;

            const el = trackRef.current;
            const rect = el.getBoundingClientRect();
            const timelineDuration = clampedTimelineDuration;
            if (timelineDuration <= 0) return;

            const x = e.clientX - rect.left + el.scrollLeft;
            const rawTime = x / pixelsPerSecond;
            const snapTime = Math.max(0, Math.min(rawTime, timelineDuration));

            setCurrentTimelineTime(snapTime);

            const videoEl = videoRef?.current ?? null;
            if (videoEl && Number.isFinite(snapTime)) {
              try {
                videoEl.currentTime = snapTime;
              } catch {
                // ignore seek errors
              }
            }

            isDraggingPlayheadRef.current = true;
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -10,
              left: -7,
              width: 16,
              height: 16,
              background: "#0f0f11",
              borderRadius: "50% 50% 50% 0",
              transform: "rotate(-45deg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 1px rgba(148,163,184,0.6)",
            }}
          >
            <div
              style={{
                width: 4,
                height: 4,
                background: "#ffffff",
                borderRadius: "50%",
                transform: "rotate(45deg)",
              }}
            />
          </div>
        </div>
      )}

      {/* Clip strip with purple trim handles */}
      <div
        ref={trackRef}
        className="timeline-scroll"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10, // extra horizontal space so transition (+ / ⧉) controls are not cut off
          width:
            clampedTimelineDuration > 0
              ? `${clampedTimelineDuration * pixelsPerSecond}px`
              : "100%",
          minWidth: "100%",
          overflowX: "visible",
          scrollBehavior: "smooth",
          position: "relative",
          zIndex: 20,
        }}
        onMouseDown={(e) => {
          // Only handle primary button drags
          if (e.button !== 0) return;

          const target = e.target as HTMLElement | null;
          // If the user clicked on a clip card (or inside it), don't start scrubbing
          if (target && target.closest('[data-clip-card="true"]')) {
            return;
          }

          if (!trackRef.current || !setCurrentTimelineTime) return;

          const el = trackRef.current;
          const rect = el.getBoundingClientRect();
          const timelineDuration = clampedTimelineDuration;
          if (timelineDuration <= 0) return;

          const x = e.clientX - rect.left + el.scrollLeft;
          const rawTime = x / pixelsPerSecond;
          const snapTime = Math.max(0, Math.min(rawTime, timelineDuration));

          setCurrentTimelineTime(snapTime);

          const videoEl = videoRef?.current ?? null;
          if (videoEl && Number.isFinite(snapTime)) {
            try {
              videoEl.currentTime = snapTime;
            } catch {
              // ignore seek errors
            }
          }

          isDraggingPlayheadRef.current = true;
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollMeta((prev) => ({
            ...prev,
            contentWidth: el.scrollWidth,
            viewportWidth: el.clientWidth,
            scrollLeft: el.scrollLeft,
          }));
        }}
      >
        {clips.length === 0 ? (
          <div
            style={{
              flex: 1,
              height: 56 * zoomScale,
              borderRadius: 8,
              border: "1px dashed #333b4d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#b3b3b3",
              fontSize: 11,
            }}
          >
            Load videos from Active videos to start building your sequence.
          </div>
        ) : (
          clips.map((clip, index) => {
            const isSelected = clip.key === selectedClipKey;
            const local = clipPercents[clip.key] || { start: 0, end: 1 };

            const showInsertBefore =
              dragInsertIndex !== null && dragInsertIndex === index;
            const showInsertAfter =
              dragInsertIndex !== null &&
              dragInsertIndex === clips.length &&
              index === clips.length - 1;

            // Derive an absolute width for this card based on its
            // effective (trimmed) duration in seconds, using a fixed
            // pixel-per-second scale so horizontal time is not
            // affected by the vertical zoom gesture.
            const baseDuration = clipDurations?.[clip.id] ?? 0;

            // Primary source of truth for the live duration is the
            // local trim ratios so that both the visual width and
            // the numeric badge respond on every mousemove while
            // dragging the purple handles.
            const spanRatio = Math.max(0, (local.end ?? 1) - (local.start ?? 0));
            let effectiveDurationSeconds = baseDuration > 0 ? spanRatio * baseDuration : 0;

            // Fallback: if we do not yet know this clip's duration,
            // or the ratios are still at their default, approximate
            // from any persisted instance trim.
            if (!(effectiveDurationSeconds > 0)) {
              const trim = instanceTrims?.[clip.key];
              let startSec = trim?.start ?? 0;
              let endSec =
                trim?.end != null
                  ? trim.end
                  : baseDuration;
              if (endSec < startSec) endSec = startSec;
              effectiveDurationSeconds = Math.max(0, endSec - startSec);
            }

            // Apply per-clip playback speed so that faster clips
            // visually compress and slower clips expand on the
            // timeline. A speed of 2.0 halves the visual duration.
            const speed = clipSpeeds?.[clip.id] ?? 1;
            if (speed > 0) {
              effectiveDurationSeconds = effectiveDurationSeconds / speed;
            }

            // Ensure cards never collapse completely while keeping
            // the width firmly tied to real seconds.
            const cardWidthPx = Math.max(1, effectiveDurationSeconds * pixelsPerSecond);

            const isActiveGap =
              typeof activeTransitionIndex === "number" &&
              activeTransitionIndex === index;

            return (
              <React.Fragment key={clip.key}>
                {showInsertBefore && (
                  <div
                    style={{
                      width: 2,
                      height: 56 * zoomScale + 12,
                      borderRadius: 999,
                      background: "#8b3dff",
                    }}
                  />
                )}
                <div
                  ref={(el) => {
                    clipRefs.current[clip.key] = el;
                  }}
                  data-clip-card="true"
                  draggable={!!onReorderClips}
                  onDragStart={(e) => {
                    if (!onReorderClips) return;
                    draggingClipIndexRef.current = index;
                    try {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", clip.id);
                    } catch {
                      // ignore dataTransfer errors (e.g. in some browsers)
                    }
                  }}
                  onDragOver={(e) => {
                    if (!onReorderClips) return;
                    if (draggingClipIndexRef.current == null) return;
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const offsetX = e.clientX - rect.left;
                    const insertBefore = offsetX < rect.width / 2;
                    const targetIndex = insertBefore ? index : index + 1;
                    setDragInsertIndex(targetIndex);
                  }}
                  onDrop={(e) => {
                    if (!onReorderClips) return;
                    e.preventDefault();
                    if (
                      draggingClipIndexRef.current == null ||
                      dragInsertIndex == null
                    ) {
                      draggingClipIndexRef.current = null;
                      setDragInsertIndex(null);
                      return;
                    }
                    const from = draggingClipIndexRef.current;
                    let to = dragInsertIndex;
                    // Adjust target index if moving forward in the list
                    if (to > from) {
                      to -= 1;
                    }
                    if (to !== from) {
                      onReorderClips(from, to);
                    }
                    draggingClipIndexRef.current = null;
                    setDragInsertIndex(null);
                  }}
                  onDragEnd={() => {
                    draggingClipIndexRef.current = null;
                    setDragInsertIndex(null);
                  }}
                  style={{
                    position: "relative",
                    height: 56 * zoomScale,
                    minWidth: 40,
                    width: `${cardWidthPx}px`,
                    flex: "0 0 auto",
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "#2a2b36",
                    border: isSelected ? "3px solid #8b3dff" : "1px solid #333b4d",
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                  onClick={() => onSelectClip && onSelectClip(clip.key, clip.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (onClipContextMenu) {
                      onClipContextMenu(index, e as any);
                    }
                  }}
                >
                  {/* Thumbnail layer */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      overflow: "hidden",
                    }}
                  >
                    {clip.type === "white_canvas" ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          backgroundColor: "#ffffff",
                        }}
                      />
                    ) : clip.thumbnailUrl ? (
                      <video
                        src={clip.thumbnailUrl}
                        muted
                        playsInline
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "center",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          backgroundColor: "#020617",
                        }}
                      />
                    )}
                  </div>

                  {/* Trim overlays removed (no inner purple fade/track) */}

                  {/* Left purple pill handle pinned to card left edge */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: -4,
                      width: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "ew-resize",
                      zIndex: 50,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const card = clipRefs.current[clip.key];
                      const cardWidth = card?.offsetWidth || 1;
                      draggingHandleRef.current = {
                        clipKey: clip.key,
                        side: "start",
                        startX: e.clientX,
                        startStart: local.start,
                        startEnd: local.end,
                        cardWidth,
                        index,
                        currentStart: local.start,
                        currentEnd: local.end,
                      };
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: "70%",
                        borderRadius: 999,
                        backgroundColor: "#8b3dff",
                        boxShadow:
                          "0 0 0 1px rgba(255,255,255,0.12), 0 6px 14px rgba(0,0,0,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 2,
                          height: "60%",
                          borderRadius: 999,
                          backgroundColor: "#ffffff",
                          opacity: 0.95,
                        }}
                      />
                    </div>
                  </div>

                  {/* Right purple pill handle pinned to card right edge */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      right: -4,
                      width: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "ew-resize",
                      zIndex: 50,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const card = clipRefs.current[clip.key];
                      const cardWidth = card?.offsetWidth || 1;
                      draggingHandleRef.current = {
                        clipKey: clip.key,
                        side: "end",
                        startX: e.clientX,
                        startStart: local.start,
                        startEnd: local.end,
                        cardWidth,
                        index,
                        currentStart: local.start,
                        currentEnd: local.end,
                      };
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: "70%",
                        borderRadius: 999,
                        backgroundColor: "#8b3dff",
                        boxShadow:
                          "0 0 0 1px rgba(255,255,255,0.12), 0 6px 14px rgba(0,0,0,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 2,
                          height: "60%",
                          borderRadius: 999,
                          backgroundColor: "#ffffff",
                          opacity: 0.95,
                        }}
                      />
                    </div>
                  </div>

                  {/* Clip label */}
                  <div
                    style={{
                      position: "absolute",
                      left: 8,
                      bottom: 4,
                      fontSize: 10,
                      color: "#e5e7eb",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      maxWidth: "calc(100% - 16px)",
                    }}
                  >
                    {clip.label}
                  </div>

                  {/* Live duration badge – updates on every drag frame */}
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 6,
                      padding: "2px 6px",
                      borderRadius: 999,
                      backgroundColor: "rgba(15,23,42,0.9)",
                      color: "#e5e7eb",
                      fontSize: 9,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Number.isFinite(effectiveDurationSeconds)
                      ? `${effectiveDurationSeconds.toFixed(1)}s`
                      : "0.0s"}
                  </div>
                </div>

                {showInsertAfter && (
                  <div
                    style={{
                      width: 2,
                      height: 56 * zoomScale + 12,
                      borderRadius: 999,
                      background: "#8b3dff",
                    }}
                  />
                )}

                {/* Transition controls between clips */}
                {index < clips.length - 1 && (
                  // Render the transition/"+" controls visually at the
                  // seam between clips, without adding any extra
                  // horizontal time to the track. The parent flex item
                  // has width 0 so it does not push later clips; the
                  // inner wrapper is absolutely positioned with its
                  // center aligned exactly to the seam so the white
                  // playhead crosses directly through the icons at the
                  // moment of handover.
                  <div
                    style={{
                      position: "relative",
                      width: 0,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        transform: "translateX(-50%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        paddingInline: 2,
                        pointerEvents: "auto",
                        zIndex: 80, // ensure the + and ⧉ buttons sit above adjacent clips
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: "1px solid #4b5563",
                          background:
                            isActiveGap || (gapTransitions && gapTransitions[index]?.type)
                              ? "#22d3ee"
                              : "#020617",
                          color:
                            isActiveGap || (gapTransitions && gapTransitions[index]?.type)
                              ? "#020617"
                              : "#e5e7eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          cursor: "pointer",
                        }}
                        title="Select transition for this gap"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (setActiveTransitionIndex) {
                            setActiveTransitionIndex(index);
                          }
                          if (setActiveTab) {
                            setActiveTab("Transitions");
                          }
                          if (onSelectTransitionGap) {
                            onSelectTransitionGap(index);
                          }
                          if (onChangeTransition) {
                            const hasTransition = !!(
                              gapTransitions && gapTransitions[index]?.type
                            );
                            onChangeTransition(index, hasTransition ? "none" : "crossfade");
                          }
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "1px solid #4b5563",
                          background: "#111827",
                          color: "#e5e7eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                        title="Insert a blank clip at this point in the timeline"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (setClips) {
                            setClips((prevClips: TimelineClip[]) => {
                              const newClips = Array.isArray(prevClips)
                                ? [...prevClips]
                                : [];
                              const newKey = `blank-${Date.now()}`;
                              const newBlankClip: TimelineClip = {
                                id: newKey,
                                key: newKey,
                                label: "Blank Canvas",
                                thumbnailUrl: "",
                                type: "white_canvas",
                              };
                              const insertIndex = Number.isFinite(index)
                                ? index + 1
                                : newClips.length;
                              newClips.splice(insertIndex, 0, newBlankClip);
                              return newClips;
                            });
                          } else if (onAddBlankClip) {
                            onAddBlankClip(index);
                          }
                          // After the blank clip is inserted, gently scroll so the seam
                          // remains visible around the clicked gap.
                          requestAnimationFrame(() => {
                            if (trackRef.current) {
                              const el = trackRef.current;
                              const seamCenter = el.scrollLeft + el.clientWidth / 2;
                              el.scrollLeft = seamCenter;
                            }
                          });
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>

            {/* Global scrollbar styling for the horizontal clip track */}

      <style jsx global>{`
        .timeline-scroll::-webkit-scrollbar {
          height: 10px;
          display: block !important;
        }
        .timeline-scroll::-webkit-scrollbar-track {
          background: #181922;
          border-radius: 6px;
        }
        .timeline-scroll::-webkit-scrollbar-thumb {
          background: #444554;
          border-radius: 6px;
          border: 2px solid #181922;
        }
        .timeline-scroll::-webkit-scrollbar-thumb:hover {
          background: #8b3dff;
        }
      `}</style>
    </div>
  );
};

export default TrimTimeline;
