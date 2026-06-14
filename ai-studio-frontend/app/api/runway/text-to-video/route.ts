import { NextRequest, NextResponse } from "next/server";
import RunwayML, { TaskFailedError } from "@runwayml/sdk";

// Runway SDK expects RUNWAYML_API_SECRET to contain your API key
export async function POST(req: NextRequest) {
  const promptBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const promptText = ((promptBody.promptText as string) || (promptBody.prompt as string) || "")
    .toString()
    .trim();
  const ratio = ((promptBody.ratio as string) || "1280:720").toString();

  // Runway veo3.1 currently only supports discrete durations (4, 6, or 8 seconds).
  // Clamp or coerce the requested duration into one of the allowed values.
  const requestedDuration = Number((promptBody.duration as number | string | undefined) ?? 8);
  let duration: 4 | 6 | 8;
  if (requestedDuration <= 4) {
    duration = 4;
  } else if (requestedDuration <= 6) {
    duration = 6;
  } else {
    duration = 8;
  }

  if (!process.env.RUNWAYML_API_SECRET) {
    return NextResponse.json(
      { error: "Missing RUNWAYML_API_SECRET on the server" },
      { status: 500 },
    );
  }

  if (!promptText) {
    return NextResponse.json({ error: "promptText is required" }, { status: 400 });
  }

  const client = new RunwayML();

  try {
    const task = await client.textToVideo
      .create({
        model: "veo3.1",
        promptText,
        ratio,
        duration,
      })
      .waitForTaskOutput();

    // NOTE: The exact shape of `task` depends on Runway's response.
    // For now we return the full task object so you can inspect it client-side
    // and see where the final video URL lives.

    return NextResponse.json({ ok: true, task });
  } catch (error: unknown) {
    if (error instanceof TaskFailedError) {
      return NextResponse.json(
        {
          error: "The Runway veo3.1 video failed to generate.",
          details: error.taskDetails,
        },
        { status: 500 },
      );
    }

    // eslint-disable-next-line no-console
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected error while calling Runway textToVideo" },
      { status: 500 },
    );
  }
}
