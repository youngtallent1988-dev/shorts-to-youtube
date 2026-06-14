import RunwayML, { TaskFailedError } from "@runwayml/sdk";

/**
 * CLI helper to test Runway veo3.1 text-to-video.
 *
 * Uses the same env var as your Next.js API route:
 *   RUNWAYML_API_SECRET
 *
 * Usage (from project root):
 *   cd tools
 *   RUNWAYML_API_SECRET=... node runway-text-to-video.mjs
 */

if (!process.env.RUNWAYML_API_SECRET) {
  console.error("[runway] Missing RUNWAYML_API_SECRET environment variable");
  process.exit(1);
}

async function main() {
  const promptText =
    "Cinematic dolly shot through a futuristic city at dusk, warm neon reflections, shallow depth of field, film grain";

  const client = new RunwayML();

  try {
    console.log("[runway] Creating veo3.1 text-to-video task...");

    const task = await client.textToVideo
      .create({
        model: "veo3.1",
        promptText,
        ratio: "1280:720",
        duration: 10,
      })
      .waitForTaskOutput();

    console.log("[runway] Task completed. Raw task object:");
    console.dir(task, { depth: null });

    // Try to pull out a video URL heuristically
    let videoUrl = null;
    const output = task?.output;

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
      console.log("[runway] Detected video URL:", videoUrl);
    } else {
      console.log("[runway] No direct video URL detected in task.output.");
    }
  } catch (error) {
    if (error instanceof TaskFailedError) {
      console.error("[runway] The veo3.1 video failed to generate.");
      console.dir(error.taskDetails, { depth: null });
    } else {
      console.error("[runway] Unexpected error while calling Runway textToVideo:");
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[runway] Top-level error:");
  console.error(err);
  process.exit(1);
});
