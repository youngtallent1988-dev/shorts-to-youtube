"use client";

import React, { useEffect, useRef, useState } from "react";

export type TrimTimelineProps = {
  duration: number; // total video duration in seconds
  startTime: number; // current in point
  endTime: number; // current out point
  onChange?: (startTime: number, endTime: number) => void;
  width?: number; // optional explicit width in px
  minSegment?: number; // minimum segment length in seconds
};

export const TrimTimeline: React.FC<TrimTimelineProps> = ({
  duration,
  startTime,
  endTime,
  onChange,
  width = 480,
  // Minimum allowed segment length between handles (seconds). The only
  // real restriction we keep so the clip never collapses to zero.
  minSegment = 1,
}) => {
  const [localStart, setLocalStart] = useState(startTime);
  const [localEnd, setLocalEnd] = useState(endTime);
  const [drag, setDrag] = useState<{
    side: "start" | "end";
    startX: number;
    startStart: number;
    startEnd: number;
  } | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);

  // Sync local state when props change
  useEffect(() => {
    setLocalStart(startTime);
    setLocalEnd(endTime);
  }, [startTime, endTime]);

  // Global mouse listeners for dragging
  useEffect(() => {
    if (!drag) return;

    // Take a snapshot of the current drag state so TypeScript knows it
    // cannot be null inside our event handlers and we don't accidentally
    // read a changed value mid-drag.
    const currentDrag = drag;

    function handleMouseMove(e: MouseEvent) {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const trackWidth = rect.width || width;

      const dx = e.clientX - currentDrag.startX;
      const safeDuration = duration || 1;
      const secondsPerPixel = safeDuration / trackWidth;
      const deltaSeconds = dx * secondsPerPixel;

      let newStart = currentDrag.startStart;
      let newEnd = currentDrag.startEnd;

      if (currentDrag.side === "start") {
        newStart = currentDrag.startStart + deltaSeconds;
        newStart = Math.max(0, Math.min(newStart, newEnd - minSegment));
      } else {
        newEnd = currentDrag.startEnd + deltaSeconds;
        newEnd = Math.min(safeDuration, Math.max(newEnd, newStart + minSegment));
      }

      setLocalStart(newStart);
      setLocalEnd(newEnd);
      onChange?.(newStart, newEnd);
    }

    function handleMouseUp() {
      setDrag(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [drag, duration, minSegment, onChange, width]);

  const safeDuration = duration || 1;
  const startPct = (localStart / safeDuration) * 100;
  const endPct = (localEnd / safeDuration) * 100;
  const widthPct = Math.max(0, endPct - startPct);

  const formatTime = (t: number) => {
    const s = Math.max(0, Math.floor(t));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  };

  return (
    <div
      style={{
        width,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header / summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
          fontSize: 11,
          color: "#e5e7eb",
        }}
      >
        <span>Trim active clip</span>
        <span>
          {formatTime(localStart)} – {formatTime(localEnd)} / {formatTime(duration)}
        </span>
      </div>

      {/* Background track in a Canva-style dark pill */}
      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: 40,
          borderRadius: 999,
          background: "linear-gradient(180deg, #33333b, #25262c)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "1px solid rgba(0,0,0,0.7)",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* Filmstrip / grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 12px, transparent 12px, transparent 24px)",
            opacity: 0.45,
            pointerEvents: "none",
          }}
        />

        {/* Inner soft track */}
        <div
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: 999,
            background:
              "linear-gradient(180deg, rgba(12,12,18,0.9), rgba(26,27,35,0.95))",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        />

        {/* Canva-style purple active zone */}
        <div
          style={{
            position: "absolute",
            top: 8,
            bottom: 8,
            left: `${startPct}%`,
            width: `${widthPct}%`,
            borderRadius: 999,
            backgroundColor: "rgba(139, 61, 255, 0.15)",
            borderTop: "4px solid #8b3dff",
            borderBottom: "4px solid #8b3dff",
            boxShadow: "0 0 14px rgba(139,61,255,0.45)",
          }}
        />

        {/* Left pill handle */}
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: `calc(${startPct}% - 10px)` ,
            width: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "ew-resize",
          }}
          onMouseDown={(e) =>
            setDrag({
              side: "start",
              startX: e.clientX,
              startStart: localStart,
              startEnd: localEnd,
            })
          }
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

        {/* Right pill handle */}
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: `calc(${endPct}% - 10px)` ,
            width: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "ew-resize",
          }}
          onMouseDown={(e) =>
            setDrag({
              side: "end",
              startX: e.clientX,
              startStart: localStart,
              startEnd: localEnd,
            })
          }
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
      </div>

      {/* Live start / end time indicators under the handles */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 11,
          color: "#b3b3b3",
        }}
      >
        <div>
          <span style={{ marginRight: 4 }}>Start</span>
          <span
            style={{
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            {formatTime(localStart)}
          </span>
        </div>
        <div>
          <span style={{ marginRight: 4 }}>End</span>
          <span
            style={{
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            {formatTime(localEnd)}
          </span>
        </div>
      </div>
    </div>
  );
};

