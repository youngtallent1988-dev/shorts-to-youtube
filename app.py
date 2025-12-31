import os
import uuid
import subprocess
from pathlib import Path

from flask import (
    Flask,
    Response,
    abort,
    after_this_request,
    render_template,
    request,
    send_file,
)

APP_DIR = Path(__file__).parent.resolve()
UPLOAD_DIR = APP_DIR / "uploads"
OUTPUT_DIR = APP_DIR / "outputs"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 500  # 500MB


def run_ffmpeg(cmd: list[str]) -> None:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr)


# ✅ IMPORTANT: Railway was returning 404 because you were missing this route
@app.get("/")
def home():
    return render_template("index.html")


# Optional: avoid favicon noise
@app.get("/favicon.ico")
def favicon():
    return Response(status=204)  # No Content


@app.post("/convert")
def convert():
    file = request.files.get("video")
    if not file:
        abort(400, "No video uploaded. Field name must be 'video'.")

    job = uuid.uuid4().hex
    inp = UPLOAD_DIR / f"{job}.mp4"
    out = OUTPUT_DIR / f"{job}_youtube.mp4"
    file.save(inp)

    # mode comes from your HTML form: <select name="mode">
    mode = (request.form.get("mode") or "blur").lower()
    if mode not in {"blur", "fitzoom", "crop"}:
        mode = "blur"

    if mode == "blur":
        # Background = scaled + cropped + blurred
        # Foreground = scaled to fit (no crop), then centered on top
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-filter_complex",
            "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos[fg];"
            "[0:v]scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
            "crop=1920:1080,gblur=sigma=30[bg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]",
            "-map", "[v]",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "14",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]

    elif mode == "fitzoom":
        # Fits inside 1920x1080, pads, then a tiny zoom to reduce black bars,
        # then crops back to exact size.
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-vf",
            "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
            "scale=iw*1.08:ih*1.08,"
            "crop=1920:1080",
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "14",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]

    else:  # crop
        # Crop to fill 16:9 (no stretch). Best “standard” conversion.
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-vf",
            "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
            "crop=1920:1080",
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "14",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]

    # run conversion
    run_ffmpeg(cmd)

    # delete upload immediately
    inp.unlink(missing_ok=True)

    # ✅ IMPORTANT: delete output after it’s downloaded (keeps Railway clean)
    @after_this_request
    def cleanup(response):
        out.unlink(missing_ok=True)
        return response

    return send_file(
        out,
        as_attachment=True,
        download_name=f"youtube_16x9_{mode}_{job}.mp4",
        conditional=False,
        max_age=0,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
