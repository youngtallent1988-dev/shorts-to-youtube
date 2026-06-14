import Replicate from "replicate";

/**
 * Simple CLI tool to test the Minimax /video model on Replicate.
 *
 * Usage (from project root):
 *   cd tools
 *   REPLICATE_API_TOKEN=your_token node minimax.mjs
 */

if (!process.env.REPLICATE_API_TOKEN) {
  console.error("[minimax] Missing REPLICATE_API_TOKEN environment variable");
  process.exit(1);
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function main() {
  const input = {
    prompt:
      "A cinematic drone shot flying over an ocean at golden hour, waves crashing in slow motion, volumetric sunlight rays, ultra realistic, 4K movie trailer style",
    prompt_optimizer: true,
  };

  console.log("[minimax] Starting minimax/video-01 prediction...");

  const output = await replicate.run("minimax/video-01", { input });

  console.log("[minimax] Raw output:");
  console.dir(output, { depth: null });

  // Try to extract a video URL similar to how the backend does
  let videoUrl = null;

  const extractUrl = (obj) => {
    if (!obj) return null;
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const maybe = extractUrl(item);
        if (maybe) return maybe;
      }
      return null;
    }
    if (typeof obj === "object") {
      for (const key of ["video", "video_url", "url", "uri"]) {
        if (typeof obj[key] === "string") return obj[key];
      }
    }
    return null;
  };

  videoUrl = extractUrl(output);

  if (videoUrl) {
    console.log("[minimax] Detected video URL:", videoUrl);
  } else {
    console.log("[minimax] No direct video URL detected in output.");
  }
}

main().catch((err) => {
  console.error("[minimax] Error while calling Replicate minimax/video-01:");
  console.error(err);
  process.exit(1);
});
