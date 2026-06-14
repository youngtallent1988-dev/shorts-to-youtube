# Tools

Helper scripts for testing your AI providers and video backends from the command line.

Each script expects certain environment variables to be set, matching what your Flask/Next.js app uses.

## Setup

From the project root:

```bash
cd tools
npm install
```

This installs the local dependencies defined in `tools/package.json` (Replicate, Runway SDK, etc.).

## Minimax (Replicate default model)

Script: `minimax.mjs`

Environment:

- `REPLICATE_API_TOKEN`

Run:

```bash
cd tools
REPLICATE_API_TOKEN=your_token node minimax.mjs
```

This will start a `minimax/video-01` prediction on Replicate and attempt to print the resulting video URL.

## Kling (Replicate Kling model)

Script: `kling.mjs`

Environment:

- `REPLICATE_API_TOKEN`

Run:

```bash
cd tools
REPLICATE_API_TOKEN=your_token node kling.mjs
```

This uses `kwaivgi/kling-v1.6-standard` on Replicate with a hard-coded cinematic prompt.

## Veo 3 Lite (Google / Veo HTTP endpoints)

Script: `veo.mjs`

Environment (same as Flask backend):

- `GOOGLE_API_KEY`
- `VEO_GENERATE_URL`  (e.g. `https://your-veo-endpoint/generate`)
- `VEO_STATUS_URL`    (e.g. `https://your-veo-endpoint/status`)

Run:

```bash
cd tools
GOOGLE_API_KEY=... VEO_GENERATE_URL=... VEO_STATUS_URL=... node veo.mjs
```

The script will:

1. Call your Veo generate endpoint with a test prompt
2. Log the full response
3. If a job id is found, poll the status endpoint and try to extract a video URL

## Runway veo3.1 (text-to-video)

Script: `runway-text-to-video.mjs`

Environment (same as your Next.js API route):

- `RUNWAYML_API_SECRET`

Run:

```bash
cd tools
RUNWAYML_API_SECRET=... node runway-text-to-video.mjs
```

The script will create a `veo3.1` text-to-video task using the Runway SDK, wait for completion, and print the task object and any detected video URL.

---

These tools are safe to run independently of your Flask/Next.js servers and are meant for quick debugging of provider configuration (API keys, endpoints, etc.).
