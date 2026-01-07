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


def save_upload(file_storage) -> Path:
    """Save upload using original extension so ffmpeg can read it reliably."""
    ext = Path(file_storage.filename or "").suffix.lower()
    if not ext:
        ext = ".mp4"
    job = uuid.uuid4().hex
    inp = UPLOAD_DIR / f"{job}{ext}"
    file_storage.save(inp)
    return inp


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/favicon.ico")
def favicon():
    return Response(status=204)  # No Content


@app.errorhandler(RuntimeError)
def ffmpeg_error(e):
    # Shows ffmpeg errors instead of generic "Internal Server Error"
    return (f"FFmpeg failed:\n\n{str(e)}", 500)


# ==========================================================
# 1) Shorts -> YouTube (9:16 -> 16:9)
# POST /convert  (your existing endpoint)
# ==========================================================
@app.post("/convert")
def convert_shorts_to_youtube():
    file = request.files.get("video")
    if not file:
        abort(400, "No video uploaded. Field name must be 'video'.")

    inp = save_upload(file)
    job = uuid.uuid4().hex
    out = OUTPUT_DIR / f"{job}_youtube_16x9.mp4"

    mode = (request.form.get("mode") or "blur").lower()
    if mode not in {"blur", "fitzoom", "crop"}:
        mode = "blur"

    if mode == "blur":
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-filter_complex",
            # FG fits inside 1920x1080
            "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos[fg];"
            # BG fills 1920x1080, crop, blur
            "[0:v]scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
            "crop=1920:1080,gblur=sigma=30[bg];"
            # Overlay FG centered
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

    run_ffmpeg(cmd)
    inp.unlink(missing_ok=True)

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


# ==========================================================
# 2) YouTube -> Shorts (16:9 -> 9:16)
# POST /convert_shorts   (THIS FIXES YOUR MISSING ROUTE)
# ==========================================================
@app.post("/convert_shorts")
def convert_youtube_to_shorts():
    file = request.files.get("video")
    if not file:
        abort(400, "No video uploaded. Field name must be 'video'.")

    inp = save_upload(file)
    job = uuid.uuid4().hex
    out = OUTPUT_DIR / f"{job}_shorts_9x16.mp4"

    mode = (request.form.get("mode") or "blur").lower()
    if mode not in {"blur", "fit", "crop"}:
        mode = "blur"

    if mode == "blur":
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-filter_complex",
            # FG fits inside 1080x1920
            "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];"
            # BG fills 1080x1920, crop, blur
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,"
            "crop=1080:1920,gblur=sigma=30[bg];"
            # Overlay FG centered
            "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]",
            "-map", "[v]",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "16",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]

    elif mode == "fit":
        # Fit inside 9:16 with padding (black bars if needed)
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-vf",
            "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "16",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]

    else:  # crop
        # Crop to fill 9:16 (best Shorts look, cuts sides)
        cmd = [
            "ffmpeg", "-y",
            "-i", str(inp),
            "-vf",
            "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,"
            "crop=1080:1920",
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "16",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out),
        ]

    run_ffmpeg(cmd)
    inp.unlink(missing_ok=True)

    @after_this_request
    def cleanup(response):
        out.unlink(missing_ok=True)
        return response

    return send_file(
        out,
        as_attachment=True,
        download_name=f"shorts_9x16_{mode}_{job}.mp4",
        conditional=False,
        max_age=0,
    )


# ==========================================================
# 3) Video -> MP4
# POST /format_convert   (THIS FIXES YOUR /format_convert 404)
# ==========================================================
@app.post("/format_convert")
def format_convert_to_mp4():
    file = request.files.get("video")
    if not file:
        abort(400, "No video uploaded. Field name must be 'video'.")

    inp = save_upload(file)
    job = uuid.uuid4().hex
    out = OUTPUT_DIR / f"{job}_converted.mp4"

    # Most compatible MP4 output: H.264 + AAC
    cmd = [
        "ffmpeg", "-y",
        "-i", str(inp),
        "-map", "0:v:0?",
        "-map", "0:a:0?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(out),
    ]

    run_ffmpeg(cmd)
    inp.unlink(missing_ok=True)

    @after_this_request
    def cleanup(response):
        out.unlink(missing_ok=True)
        return response

    return send_file(
        out,
        as_attachment=True,
        download_name=f"converted_{job}.mp4",
        conditional=False,
        max_age=0,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
