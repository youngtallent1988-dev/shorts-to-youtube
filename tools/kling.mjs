import { writeFile } from "fs/promises";
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function main() {

  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("Missing REPLICATE_API_TOKEN");
    process.exit(1);
  }

  const input = {
    prompt:
      "Ultra cinematic futuristic cyberpunk city at night, neon reflections on wet streets, flying cars, dramatic movie lighting, epic cinematic camera movement, hyper realistic, 4k movie trailer style",
    duration: 10,
  };

  console.log("Generating Kling video...");

  const output = await replicate.run(
    "kwaivgi/kling-v1.6-standard",
    { input }
  );

  console.log("Output:", output);

  if (typeof output === "string") {
    console.log("Video URL:", output);
  }
}

main().catch(console.error);
