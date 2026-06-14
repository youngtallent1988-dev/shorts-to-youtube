export type AssetType = "video" | "image" | "audio";

export type MediaAsset = {
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
