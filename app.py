from __future__ import annotations
import hashlib
import os
import secrets
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

import requests
from flask_cors import CORS
import google.generativeai as genai

# Optional media/analysis libraries for advanced editor features
try:  # pragma: no cover
    from moviepy.editor import VideoFileClip, concatenate_videoclips  # type: ignore[import]
    from moviepy.video.fx.all import speedx  # type: ignore[import]
except Exception:  # noqa: BLE001 - keep app running even if MoviePy/Numpy are broken
    VideoFileClip = None  # type: ignore[assignment]
    concatenate_videoclips = None  # type: ignore[assignment]
    speedx = None  # type: ignore[assignment]

try:  # pragma: no cover
    import librosa  # type: ignore[import]
except Exception:  # noqa: BLE001
    librosa = None  # type: ignore[assignment]

# Stripe and Replicate are optional in local/dev; guard their imports so
# missing or incompatible dependencies (like anyio) don't prevent the app
# from starting.
try:  # pragma: no cover - best effort for local dev
    import stripe  # type: ignore[import]
except Exception:  # noqa: BLE001 - broad to keep local dev running
    stripe = None  # type: ignore[assignment]

try:  # pragma: no cover
    import replicate  # type: ignore[import]
except Exception:  # noqa: BLE001
    replicate = None  # type: ignore[assignment]

from flask import Flask, jsonify, render_template, request

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN"),
    integrations=[FlaskIntegration()],
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
)

# Explicitly configure Flask to serve files from the local "static" directory
# so /static/uploads and /static/exports are reachable by the browser.
app = Flask(__name__, static_folder="static", static_url_path="/static")

# Global self-healing error interceptor
# This will catch unexpected exceptions, wake up agent.py with the traceback,
# and still return a JSON error payload so the frontend never hangs.
@app.errorhandler(Exception)
def handle_runtime_crash(error):
    error_message = str(error)
    target_file = "app.py"  # Primary file to attempt self-healing on

    print("🚨 ALERT: Backend crashed! Waking up the Self-Healing Agent...")

    # Run agent.py in a background process, handing it the crash log details
    try:
        subprocess.Popen(
            [
                "python3",
                "agent.py",
                error_message,
                target_file,
            ]
        )
    except Exception as e:
        print(f"Failed to trigger healing script: {str(e)}")

    # For API routes, always return JSON so the frontend does not hang
    if request.path.startswith("/api/"):
        return (
            jsonify(
                {
                    "ok": False,
                    "error": error_message,
                    "healing_status": "Self-healing script triggered automatically!",
                }
            ),
            500,
        )

    # For non-API routes, fall back to a simple text response
    return "Internal Server Error", 500

# -------------------------
# Config
# -------------------------

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "data.db"))
EXPORT_DIR = os.path.join(os.path.dirname(__file__), "static", "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)

# User-uploaded media (videos, images, audio) for the editor
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Maximum allowed upload size defaults (in bytes) for any single media file.
# NOTE: These defaults are intentionally generous so production can handle
# larger creator uploads without extra env wiring. You can always override
# them via MAX_* env vars on Railway if needed.
# Global default: 2 GB (MAX_UPLOAD_BYTES), can be overridden per type via
# MAX_VIDEO_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES, MAX_AUDIO_UPLOAD_BYTES.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2 GB
MAX_VIDEO_UPLOAD_BYTES = int(os.getenv("MAX_VIDEO_UPLOAD_BYTES", str(MAX_UPLOAD_BYTES)))
MAX_IMAGE_UPLOAD_BYTES = int(os.getenv("MAX_IMAGE_UPLOAD_BYTES", str(200 * 1024 * 1024)))   # 200 MB default
MAX_AUDIO_UPLOAD_BYTES = int(os.getenv("MAX_AUDIO_UPLOAD_BYTES", str(500 * 1024 * 1024)))  # 500 MB default

# Maximum allowed duration for uploaded videos (in seconds).
# Bumped to 300s (5 minutes) by default so longer clips work in production.
MAX_VIDEO_DURATION_SECONDS = int(os.getenv("MAX_VIDEO_DURATION_SECONDS", "300"))

FAL_KEY = os.getenv("FAL_KEY")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
REPLICATE_MODEL_VERSION = os.getenv(
    "REPLICATE_MODEL_VERSION",
    "5aa835260ff7f40f4069c41185f72036accf99e29957bb4a3b3a911f3b6c1912",
)
REPLICATE_KLING_VERSION = os.getenv("REPLICATE_KLING_VERSION")
REPLICATE_API_BASE = "https://api.replicate.com/v1"

# Google Veo 3 Lite
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
VEO_GENERATE_URL = os.getenv("VEO_GENERATE_URL")  # e.g. https://your-veo-endpoint/generate
VEO_STATUS_URL = os.getenv("VEO_STATUS_URL")      # e.g. https://your-veo-endpoint/status

# Google Gemini (Generative AI) via google-generativeai
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")

# We initialize a single GenerativeModel instance at startup so that
# all /api/ai/generate calls share the same configuration.
gemini_model: genai.GenerativeModel | None = None
if GEMINI_API_KEY:
    try:  # pragma: no cover - best effort init
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
    except Exception as e:
        # Don't crash the app if Gemini init fails; just log.
        # Other routes will still work and /api/ai/generate will
        # return a clear error message instead.
        app.logger.warning("Failed to configure Google Gemini client: %s", e)
        gemini_model = None

# Resend (transactional email)
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM = os.getenv("RESEND_FROM", "AI Studio <onboarding@resend.dev>")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://sailorai.app")

# Stripe
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "mock_key")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Initialize Stripe with a safe env-based fallback so missing dashboard
# variables do not cause initialization errors. In production you should
# set STRIPE_SECRET_KEY in Railway; otherwise this uses a mock key.
if stripe is not None:
    try:
        stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "mock_secret_key_fallback")
    except Exception as e:  # noqa: BLE001 - keep app booting even if Stripe init fails
        app.logger.warning("Stripe initialization failed during startup: %s", e)
        stripe = None

STRIPE_PRICE_CREATOR_MONTHLY = os.getenv("STRIPE_PRICE_CREATOR_MONTHLY")
STRIPE_PRICE_CREATOR_YEARLY = os.getenv("STRIPE_PRICE_CREATOR_YEARLY")
STRIPE_PRICE_PRO_MONTHLY = os.getenv("STRIPE_PRICE_PRO_MONTHLY")
STRIPE_PRICE_PRO_YEARLY = os.getenv("STRIPE_PRICE_PRO_YEARLY")
STRIPE_PRICE_STUDIO_MONTHLY = os.getenv("STRIPE_PRICE_STUDIO_MONTHLY")
STRIPE_PRICE_STUDIO_YEARLY = os.getenv("STRIPE_PRICE_STUDIO_YEARLY")

# Credit grants per billing period (MVP defaults)
CREATOR_CREDITS_PER_MONTH = int(os.getenv("CREATOR_CREDITS_PER_MONTH", "200"))
PRO_CREDITS_PER_MONTH = int(os.getenv("PRO_CREDITS_PER_MONTH", "800"))

FREE_SIGNUP_CREDITS = int(os.getenv("FREE_SIGNUP_CREDITS", "100"))

MAGIC_LINK_TTL_MINUTES = int(os.getenv("MAGIC_LINK_TTL_MINUTES", "15"))
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "30"))

# One generation cost (simple MVP). You can later make this dynamic by duration/quality.
GENERATION_COST_CREDITS = int(os.getenv("GENERATION_COST_CREDITS", "10"))

# Allow Next.js dev server (and other local ports) to call this Flask API from the browser.
ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
}

# Enable CORS for API routes. Allow the production frontend and local dev
# frontend, and support cookies / credentials for session auth.
CORS(
    app,
    resources={r"/api/*": {"origins": ["https://sailorai.app", "http://localhost:3000"]}},
    supports_credentials=True,
)

# -------------------------
# DB
# -------------------------


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize SQLite schema (users, credits, sessions, videos, etc.)."""

    def ensure_column(conn: sqlite3.Connection, table: str, col: str, col_def: str) -> None:
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if col not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}")

    with db() as conn:
        # Users table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              credits INTEGER NOT NULL DEFAULT 0,
              unlimited_generations INTEGER NOT NULL DEFAULT 0,
              plan TEXT,
              subscription_status TEXT,
              stripe_customer_id TEXT,
              stripe_subscription_id TEXT,
              created_at TEXT NOT NULL
            );
            """
        )

        # Migrate older DBs
        ensure_column(conn, "users", "unlimited_generations", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "users", "plan", "TEXT")
        ensure_column(conn, "users", "subscription_status", "TEXT")
        ensure_column(conn, "users", "stripe_customer_id", "TEXT")
        ensure_column(conn, "users", "stripe_subscription_id", "TEXT")

        # Credit ledger
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_ledger (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              delta INTEGER NOT NULL,
              reason TEXT NOT NULL,
              reference TEXT,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )

        # Magic links for auth
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS magic_links (
              token_hash TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              expires_at TEXT NOT NULL,
              used INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )

        # Sessions
        conn.execute(
    """
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )

        # Videos history (Replicate jobs)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS videos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              job_id TEXT NOT NULL UNIQUE,
              prompt TEXT NOT NULL,
              model TEXT,
              provider TEXT,
              status TEXT,
              video_url TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )

        # User uploaded media (videos, images, audio) with trash + soft delete
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS media_files (
              id TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              type TEXT NOT NULL,              -- 'video' | 'image' | 'audio'
              original_name TEXT NOT NULL,
              mime_type TEXT NOT NULL,
              size_bytes INTEGER NOT NULL,
              storage_key TEXT NOT NULL,      -- e.g. 'uploads/abc123.mp4'
              public_url TEXT NOT NULL,       -- e.g. 'https://.../static/uploads/abc123.mp4'
              status TEXT NOT NULL,           -- 'active' | 'trashed' | 'deleted'
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              trashed_at TEXT,
              deleted_at TEXT,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def media_row_to_dict(row: sqlite3.Row) -> dict:
    """Convert a media_files row to a JSON-serializable dict.

    Historically, some rows may have an empty or relative public_url.
    To keep the frontend <video> elements happy, always emit a fully
    qualified, browser-reachable URL. If public_url is missing or looks
    like a bare storage key, rebuild it from storage_key and host URL.
    """
    storage_key = (row["storage_key"] or "").replace("\\", "/")
    raw_public_url = (row["public_url"] or "").strip()

    public_url: str
    if not raw_public_url or raw_public_url.startswith("uploads/") or raw_public_url.startswith("/uploads/"):
        # Fallback: serve from our Flask static folder
        base = request.host_url.rstrip("/") if request else ""
        public_url = f"{base}/static/{storage_key.lstrip('/')}" if storage_key else ""
    else:
        public_url = raw_public_url

    # As a final safeguard, if we still do not have a usable URL, fall back to a
    # known-good public sample video. This prevents <video> elements from
    # receiving an empty or unsupported src and throwing NotSupportedError
    # during playback in the editor.
    if not public_url:
        public_url = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"

    return {
        "id": row["id"],
        "userId": row["user_id"],
        "type": row["type"],
        "originalName": row["original_name"],
        "mimeType": row["mime_type"],
        "sizeBytes": row["size_bytes"],
        "storageKey": storage_key,
        "publicUrl": public_url,
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "trashedAt": row["trashed_at"],
        "deletedAt": row["deleted_at"],
    }


# -------------------------
# CORS
# -------------------------


@app.after_request
def add_cors_headers(response):
    """Augment CORS headers after Flask-CORS has run.

    We let Flask-CORS manage Access-Control-Allow-Origin for /api/* routes
    based on the explicit origins list above. Here we only ensure that
    credentials, methods and headers are consistently allowed.
    """
    # Do not override Access-Control-Allow-Origin set by Flask-CORS.
    # Just make sure the other CORS headers are present.
    response.headers.setdefault("Access-Control-Allow-Credentials", "true")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
    return response


# -------------------------
# Global error handling for API routes
# -------------------------


@app.errorhandler(500)
def handle_internal_server_error(err):  # pragma: no cover - safety net
    """Ensure /api/* routes never return a bare HTML "Internal Server Error" page.

    If any unhandled exception bubbles up from an API handler, we convert it
    to a JSON response so frontend callers (like /app/editor/loadAssets) never
    see a plain text/HTML body that would break JSON.parse.
    """
    app.logger.exception("Unhandled 500 error on %s: %s", request.path, err)

    # For API routes, always emit JSON so the frontend can safely parse it.
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "error": "Internal Server Error"}), 500

    # For non-API pages, fall back to a simple text response. The editor
    # never calls these with JSON.parse, so this is safe.
    return "Internal Server Error", 500


# -------------------------
# Auth helpers
# -------------------------


def get_user_from_session() -> sqlite3.Row | None:
    token = request.cookies.get("session")
    if not token:
        return None

    token_hash = sha256_hex(token)

    with db() as conn:
        row = conn.execute(
            """
            SELECT
              s.user_id,
              s.expires_at,
              u.id,
              u.email,
              u.credits,
              u.plan,
              u.subscription_status,
              u.unlimited_generations,
              u.stripe_customer_id
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()

        if not row:
            return None

        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at < now_utc():
            # session expired
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            return None

        return row


def require_user() -> sqlite3.Row:
    user = get_user_from_session()
    if not user:
        raise PermissionError("Not authenticated")
    return user


def create_magic_link_for_email(email: str) -> str:
    """Creates a one-time login link and returns the callback URL."""
    init_db()

    with db() as conn:
        user = conn.execute("SELECT id, email, credits FROM users WHERE email = ?", (email,)).fetchone()
        if not user:
            conn.execute(
                "INSERT INTO users (email, credits, created_at) VALUES (?, ?, ?)",
                (email, FREE_SIGNUP_CREDITS, iso(now_utc())),
            )
            user = conn.execute("SELECT id, email, credits FROM users WHERE email = ?", (email,)).fetchone()

        raw_token = secrets.token_urlsafe(32)
        token_hash = sha256_hex(raw_token)
        expires_at = now_utc() + timedelta(minutes=MAGIC_LINK_TTL_MINUTES)

        conn.execute(
            """
            INSERT INTO magic_links (token_hash, user_id, expires_at, used, created_at)
            VALUES (?, ?, ?, 0, ?)
            """,
            (token_hash, user["id"], iso(expires_at), iso(now_utc())),
        )

    return f"{APP_BASE_URL}/auth/callback?token={raw_token}"


def send_magic_link_email(to_email: str, login_url: str) -> None:
    if not RESEND_API_KEY:
        # Local/dev mode fallback: no email sending.
        return

    html = f"""
    <div style=\"font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.5;\">
      <h2>Your sign-in link</h2>
      <p>Click to sign in:</p>
      <p><a href=\"{login_url}\" style=\"display:inline-block;padding:12px 16px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-weight:700\">Sign in</a></p>
      <p style=\"color:#666\">This link expires in {MAGIC_LINK_TTL_MINUTES} minutes.</p>
    </div>
    """

    r = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": RESEND_FROM,
            "to": [to_email],
            "subject": "Your sign-in link",
            "html": html,
        },
        timeout=30,
    )

    r.raise_for_status()


# -------------------------
# Routes
# -------------------------


@app.route("/")
def home():
    # Legacy Flask template (optional). Your main UI is Next.js on localhost:3000
    return render_template("index.html")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


@app.route("/debug/replicate-token", methods=["GET"])
def debug_replicate_token():
    """Simple debug endpoint to check if the backend sees REPLICATE_API_TOKEN.

    Visit http://localhost:8080/debug/replicate-token in a browser.
    It should return {"has_token": true} if the token is visible to Flask.
    """
    return jsonify({"has_token": bool(REPLICATE_API_TOKEN)})


@app.route("/auth/request-magic-link", methods=["POST", "OPTIONS"])
def request_magic_link():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()

    if not email or "@" not in email:
        return jsonify({"error": "Please provide a valid email"}), 400

    callback_url = create_magic_link_for_email(email)

    # Send email (or no-op in dev mode)
    try:
        send_magic_link_email(email, callback_url)
    except Exception as e:
        return jsonify({"error": f"Email send failed: {str(e)}"}), 500

    resp = {
        "ok": True,
        "message": "Login link sent. Check your email.",
    }

    # Helpful for local dev when RESEND_API_KEY isn't set.
    if not RESEND_API_KEY:
        resp["dev_login_url"] = callback_url

    return jsonify(resp)


@app.route("/auth/consume", methods=["POST", "OPTIONS"])
def consume_magic_link():
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    data = request.json or {}
    raw_token = (data.get("token") or "").strip()
    if not raw_token:
        return jsonify({"error": "Missing token"}), 400

    token_hash = sha256_hex(raw_token)

    with db() as conn:
        link = conn.execute(
            "SELECT token_hash, user_id, expires_at, used FROM magic_links WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()

        if not link:
            return jsonify({"error": "Invalid login link"}), 400

        if int(link["used"]) == 1:
            return jsonify({"error": "Login link already used"}), 400

        expires_at = datetime.fromisoformat(link["expires_at"])
        if expires_at < now_utc():
            return jsonify({"error": "Login link expired"}), 400

        # Mark link used
        conn.execute("UPDATE magic_links SET used = 1 WHERE token_hash = ?", (token_hash,))

        # Create session
        session_token = secrets.token_urlsafe(32)
        session_hash = sha256_hex(session_token)
        session_expires = now_utc() + timedelta(days=SESSION_TTL_DAYS)

        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (session_hash, link["user_id"], iso(session_expires), iso(now_utc())),
        )

        user = conn.execute(
            """
            SELECT id, email, credits, plan, subscription_status, unlimited_generations, stripe_customer_id
            FROM users
            WHERE id = ?
            """,
            (link["user_id"],),
        ).fetchone()

    response = jsonify(
        {
            "ok": True,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "credits": user["credits"],
                "plan": user["plan"],
                "subscription_status": user["subscription_status"],
                "unlimited_generations": bool(user["unlimited_generations"]),
                "stripe_customer_id": user["stripe_customer_id"],
            },
        }
    )

    # Cookie works across ports on the same domain (localhost).
    response.set_cookie(
        "session",
        session_token,
        httponly=True,
        samesite="Lax",
        secure=False,  # set True when using HTTPS
        max_age=SESSION_TTL_DAYS * 24 * 3600,
    )

    return response


@app.route("/me", methods=["GET", "OPTIONS"])
def me():
    if request.method == "OPTIONS":
        return ("", 204)

    user = get_user_from_session()
    if not user:
        return jsonify({"ok": True, "user": None}), 200

    return jsonify(
        {
            "ok": True,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "credits": user["credits"],
                "plan": user["plan"],
                "subscription_status": user["subscription_status"],
                "unlimited_generations": bool(user["unlimited_generations"]),
                "stripe_customer_id": user["stripe_customer_id"],
            },
        }
    )


@app.route("/logout", methods=["POST", "OPTIONS"])
def logout():
    if request.method == "OPTIONS":
        return ("", 204)

    token = request.cookies.get("session")
    if token:
        token_hash = sha256_hex(token)
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    response = jsonify({"ok": True})
    response.set_cookie("session", "", expires=0)
    return response


def add_credits(user_id: int, delta: int, reason: str, reference: str | None = None) -> None:
    with db() as conn:
        conn.execute(
            "UPDATE users SET credits = credits + ? WHERE id = ?",
            (delta, user_id),
        )
        conn.execute(
            "INSERT INTO credit_ledger (user_id, delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, delta, reason, reference, iso(now_utc())),
        )


def set_unlimited(user_id: int, enabled: bool) -> None:
    with db() as conn:
        conn.execute(
            "UPDATE users SET unlimited_generations = ? WHERE id = ?",
            (1 if enabled else 0, user_id),
        )


def upsert_user_by_email(email: str) -> sqlite3.Row:
    init_db()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user:
            conn.execute(
                "INSERT INTO users (email, credits, created_at) VALUES (?, ?, ?)",
                (email, FREE_SIGNUP_CREDITS, iso(now_utc())),
            )
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return user


def plan_from_price_id(price_id: str | None) -> tuple[str | None, str | None]:
    if not price_id:
        return (None, None)

    mapping = {
        STRIPE_PRICE_CREATOR_MONTHLY: ("creator", "monthly"),
        STRIPE_PRICE_CREATOR_YEARLY: ("creator", "yearly"),
        STRIPE_PRICE_PRO_MONTHLY: ("pro", "monthly"),
        STRIPE_PRICE_PRO_YEARLY: ("pro", "yearly"),
        STRIPE_PRICE_STUDIO_MONTHLY: ("studio", "monthly"),
        STRIPE_PRICE_STUDIO_YEARLY: ("studio", "yearly"),
    }
    return mapping.get(price_id, (None, None))


def credits_for_plan(plan: str, billing: str) -> tuple[int, bool]:
    """Returns (credits_to_add, unlimited_flag)."""
    if plan == "studio":
        return (0, True)

    per_month = CREATOR_CREDITS_PER_MONTH if plan == "creator" else PRO_CREDITS_PER_MONTH
    months = 12 if billing == "yearly" else 1
    return (per_month * months, False)


@app.route("/stripe/create-portal-session", methods=["POST", "OPTIONS"])
def stripe_create_portal_session():
    if request.method == "OPTIONS":
        return ("", 204)

    if not STRIPE_SECRET_KEY:
        return jsonify({"error": "Missing STRIPE_SECRET_KEY"}), 500

    init_db()

    try:
        user = require_user()
    except PermissionError:
        return jsonify({"error": "Not authenticated"}), 401

    # Re-read full user row to get stripe_customer_id
    with db() as conn:
        row = conn.execute(
            "SELECT stripe_customer_id FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()

    customer_id = row["stripe_customer_id"] if row else None
    if not customer_id:
        return jsonify({"error": "No Stripe customer found for this account"}), 400

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{APP_BASE_URL}/pricing",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"url": session.url})


@app.route("/stripe/create-checkout-session", methods=["POST", "OPTIONS"])
def stripe_create_checkout_session():
    if request.method == "OPTIONS":
        return ("", 204)

    if not STRIPE_SECRET_KEY:
        return jsonify({"error": "Missing STRIPE_SECRET_KEY"}), 500

    data = request.json or {}
    plan = (data.get("plan") or "").strip().lower()
    billing = (data.get("billing") or "monthly").strip().lower()

    price_map = {
        ("creator", "monthly"): STRIPE_PRICE_CREATOR_MONTHLY,
        ("creator", "yearly"): STRIPE_PRICE_CREATOR_YEARLY,
        ("pro", "monthly"): STRIPE_PRICE_PRO_MONTHLY,
        ("pro", "yearly"): STRIPE_PRICE_PRO_YEARLY,
        ("studio", "monthly"): STRIPE_PRICE_STUDIO_MONTHLY,
        ("studio", "yearly"): STRIPE_PRICE_STUDIO_YEARLY,
    }

    price_id = price_map.get((plan, billing))
    if not price_id:
        return jsonify(
            {
                "error": "Missing Stripe Price ID for selected plan/billing",
                "plan": plan,
                "billing": billing,
            }
        ), 400

    # In production we want users to land back on the live Sailor AI site.
    success_url = "https://sailorai.app/pricing?success=1&session_id={CHECKOUT_SESSION_ID}"
    cancel_url = "https://sailorai.app/pricing?canceled=1"

    # If the user is already logged in, attach checkout to their Stripe customer (or prefill email).
    existing_user = get_user_from_session()
    existing_customer_id = None
    existing_email = None

    if existing_user:
        existing_email = existing_user["email"]
        with db() as conn:
            row = conn.execute(
                "SELECT stripe_customer_id FROM users WHERE id = ?",
                (existing_user["id"],),
            ).fetchone()
            existing_customer_id = row["stripe_customer_id"] if row else None

    session_kwargs = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": True,
        "metadata": {
            "plan": plan,
            "billing": billing,
            **({"app_user_id": str(existing_user["id"])} if existing_user else {}),
        },
    }

    if existing_customer_id:
        session_kwargs["customer"] = existing_customer_id
    elif existing_email:
        session_kwargs["customer_email"] = existing_email

    try:
        session = stripe.checkout.Session.create(**session_kwargs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"url": session.url})


@app.route("/api/create-checkout-session", methods=["POST", "OPTIONS"])
def api_create_checkout_session():
    if request.method == "OPTIONS":
        return ("", 204)

    if not STRIPE_SECRET_KEY:
        return jsonify({"error": "Missing STRIPE_SECRET_KEY"}), 500

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price": "price_12345_your_product_price_id",  # TODO: replace with your real Price ID
                    "quantity": 1,
                }
            ],
            mode="subscription",  # or "payment" for a one-time purchase
            # Production checkout should always return to the live Sailor AI site.
            success_url="https://sailorai.app/?success=1&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://sailorai.app/?canceled=1",
        )
        return jsonify({"url": checkout_session.url})
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route("/stripe/webhook", methods=["POST"])
def stripe_webhook():
    if not STRIPE_WEBHOOK_SECRET:
        return jsonify({"error": "Missing STRIPE_WEBHOOK_SECRET"}), 500

    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except Exception as e:
        return jsonify({"error": f"Webhook signature verification failed: {str(e)}"}), 400

    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})

    # Checkout completed: map subscription to user by email and send magic link
    if event_type == "checkout.session.completed":
        email = (obj.get("customer_details") or {}).get("email") or obj.get("customer_email")
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription")

        if email:
            email = email.strip().lower()
            user = upsert_user_by_email(email)

            with db() as conn:
                conn.execute(
                    """
                    UPDATE users
                    SET stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, plan = ?
                    WHERE id = ?
                    """,
                    (
                        customer_id,
                        subscription_id,
                        "active",
                        (obj.get("metadata") or {}).get("plan"),
                        user["id"],
                    ),
                )

            # Send a sign-in link after purchase so checkout can be "no-login".
            login_url = create_magic_link_for_email(email)
            try:
                send_magic_link_email(email, login_url)
            except Exception:
                pass

    # Invoice paid: grant credits for the billing period
    if event_type == "invoice.paid":
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription")

        lines = (obj.get("lines") or {}).get("data") or []
        price_id = None
        if lines and isinstance(lines[0], dict):
            price_id = ((lines[0].get("price") or {}) if isinstance(lines[0], dict) else {}).get("id")

        plan, billing = plan_from_price_id(price_id)

        if customer_id and plan and billing:
            with db() as conn:
                user = conn.execute(
                    "SELECT * FROM users WHERE stripe_customer_id = ?",
                    (customer_id,),
                ).fetchone()

                if user:
                    conn.execute(
                        "UPDATE users SET plan = ?, subscription_status = ?, stripe_subscription_id = ? WHERE id = ?",
                        (plan, "active", subscription_id, user["id"]),
                    )

            credits_to_add, unlimited = credits_for_plan(plan, billing)

            if unlimited:
                with db() as conn:
                    user = conn.execute(
                        "SELECT * FROM users WHERE stripe_customer_id = ?",
                        (customer_id,),
                    ).fetchone()
                    if user:
                        set_unlimited(user["id"], True)

            if credits_to_add > 0:
                with db() as conn:
                    user = conn.execute(
                        "SELECT * FROM users WHERE stripe_customer_id = ?",
                        (customer_id,),
                    ).fetchone()
                    if user:
                        add_credits(user["id"], credits_to_add, "subscription_grant", reference=str(price_id))

    # Subscription canceled/unpaid
    if event_type in {"customer.subscription.deleted", "customer.subscription.updated"}:
        status = obj.get("status")
        customer_id = obj.get("customer")

        if customer_id and status in {"canceled", "unpaid", "incomplete_expired"}:
            with db() as conn:
                user = conn.execute(
                    "SELECT * FROM users WHERE stripe_customer_id = ?",
                    (customer_id,),
                ).fetchone()
                if user:
                    conn.execute(
                        "UPDATE users SET subscription_status = ?, plan = NULL WHERE id = ?",
                        (status, user["id"]),
                    )
                    set_unlimited(user["id"], False)

    return jsonify({"ok": True})


@app.route("/generate-video", methods=["POST", "OPTIONS"])
def generate_video():
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    # Require login
    try:
        user = require_user()
    except PermissionError:
        return jsonify({"error": "Not authenticated"}), 401

    if not FAL_KEY:
        return jsonify({"error": "Missing FAL_KEY environment variable"}), 500

        data = request.json or {}
    prompt = data.get("prompt")
    image_url = data.get("image_url")

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    # Check credits (unless unlimited)
    with db() as conn:
        fresh = conn.execute(
            "SELECT id, credits, unlimited_generations FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        credits = int(fresh["credits"]) if fresh else 0
        unlimited = int(fresh["unlimited_generations"]) == 1 if fresh else False

        if not unlimited:
            if credits < GENERATION_COST_CREDITS:
                return (
                    jsonify(
                        {
                            "error": "Not enough credits",
                            "credits": credits,
                            "required": GENERATION_COST_CREDITS,
                        }
                    ),
                    402,
                )

            conn.execute(
                "UPDATE users SET credits = credits - ? WHERE id = ?",
                (GENERATION_COST_CREDITS, user["id"]),
            )
            conn.execute(
                "INSERT INTO credit_ledger (user_id, delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?)",
                (user["id"], -GENERATION_COST_CREDITS, "generation", None, iso(now_utc())),
            )

    payload = {"prompt": prompt}
    if image_url:
        payload["image_url"] = image_url

    try:
        r = requests.post(
            "https://fal.run/fal-ai/minimax/video-01-live",
            headers={
                "Authorization": f"Key {FAL_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=600,
        )
        r.raise_for_status()

        return jsonify(r.json())

    except Exception as e:
        # Refund on failure (if we charged credits)
        with db() as conn:
            fresh = conn.execute(
                "SELECT unlimited_generations FROM users WHERE id = ?",
                (user["id"],),
            ).fetchone()
            unlimited = int(fresh["unlimited_generations"]) == 1 if fresh else False

        if not unlimited:
            add_credits(user["id"], GENERATION_COST_CREDITS, "refund", reference="generation_failed")

        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/generate", methods=["POST", "OPTIONS"])
def ai_generate():
    """Simple AI text generation via Google Gemini.

    Expects JSON body: { "prompt": "..." }
    Returns: { "ok": true, "prompt": "...", "text": "..." }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    if not GEMINI_API_KEY:
        return jsonify({"ok": False, "error": "Missing GEMINI_API_KEY on server."}), 500

    if gemini_model is None:
        return jsonify({"ok": False, "error": "Gemini client is not initialized on server."}), 500

    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"ok": False, "error": "Missing 'prompt' in request body."}), 400

    try:
        # Use the shared google-generativeai GenerativeModel instance.
        result = gemini_model.generate_content(prompt)

        # Try to extract the primary text response. The google-generativeai
        # client surfaces this as `result.text` for simple use cases.
        text = getattr(result, "text", None) or ""

        # Fallback: if `text` is empty but candidates exist, try to
        # stitch together candidate text segments so the frontend always
        # gets something useful back.
        if not text and hasattr(result, "candidates"):
            try:
                parts: list[str] = []
                for cand in result.candidates or []:
                    for part in getattr(cand, "content", {}).get("parts", []):  # type: ignore[union-attr]
                        t = getattr(part, "text", None) or part.get("text")  # type: ignore[union-attr]
                        if isinstance(t, str):
                            parts.append(t)
                text = "\n".join(parts)
            except Exception:
                # If this fallback fails, we'll just return an empty string.
                pass

        return jsonify({"ok": True, "prompt": prompt, "text": text})
    except Exception as e:  # pragma: no cover - external API
        app.logger.exception("Gemini /api/ai/generate failed")
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/generate-video", methods=["POST", "OPTIONS"])
def api_generate_video():
    """Start a new video generation job on Replicate (minimax/video-01).

    For local/dev, this endpoint will automatically create/use a "dev@example.com"
    user if no session cookie is present, so you don't have to log in just to test
    video generation.
    """
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    # Try to get a logged-in user; if none, fall back to a dev user so generation
    # works without the magic-link flow in local development.
    user = get_user_from_session()
    if not user:
        user = upsert_user_by_email("dev@example.com")

    if not REPLICATE_API_TOKEN:
        return jsonify({"error": "Missing REPLICATE_API_TOKEN environment variable"}), 500

    data = request.json or {}
    prompt = data.get("prompt")
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    # Duration gating: durations >5s require Pro/Studio/unlimited (except dev@example.com)
    duration_raw = data.get("duration")
    duration_seconds = 5
    if isinstance(duration_raw, str):
        cleaned = duration_raw.strip().lower()
        if cleaned.endswith("s"):
            cleaned = cleaned[:-1]
        if cleaned.isdigit():
            duration_seconds = int(cleaned)
    elif isinstance(duration_raw, (int, float)):
        duration_seconds = int(duration_raw)

    user_email = (user["email"] or "").lower()
    user_plan = (user["plan"] or "").lower() if "plan" in user.keys() else ""
    user_unlimited = bool(user["unlimited_generations"]) if "unlimited_generations" in user.keys() else False

    has_pro_plan = user_unlimited or user_plan in {"pro", "studio"}
    # Allow dev@example.com to bypass duration gating for local development
    if user_email == "dev@example.com":
        has_pro_plan = True

    if duration_seconds > 5 and not has_pro_plan:
        return (
            jsonify(
                {
                    "error": "Durations 6s and above require a Pro or Studio subscription.",
                    "required_plan": "pro",
                    "max_free_duration_seconds": 5,
                }
            ),
            402,
        )

    # Determine which Replicate model to use (default: minimax)
    model_choice = (data.get("model") or "minimax").strip().lower()

    # Check credits (unless unlimited)
    with db() as conn:
        fresh = conn.execute(
            "SELECT id, credits, unlimited_generations FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        credits = int(fresh["credits"]) if fresh else 0
        unlimited = int(fresh["unlimited_generations"]) == 1 if fresh else False

        if not unlimited:
            if credits < GENERATION_COST_CREDITS:
                return (
                    jsonify(
                        {
                            "error": "Not enough credits",
                            "credits": credits,
                            "required": GENERATION_COST_CREDITS,
                        }
                    ),
                    402,
                )

            conn.execute(
                "UPDATE users SET credits = credits - ? WHERE id = ?",
                (GENERATION_COST_CREDITS, user["id"]),
            )
            conn.execute(
                "INSERT INTO credit_ledger (user_id, delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?)",
                (user["id"], -GENERATION_COST_CREDITS, "generation", None, iso(now_utc())),
            )

    # Build provider payload based on chosen model
    if model_choice == "kling":
        # Map frontend fields -> Kling input schema
        # Duration: accept numeric or strings like "10s", clamp to 3-15 seconds
        duration_raw = data.get("duration")
        duration_val = 10
        if isinstance(duration_raw, str):
            cleaned = duration_raw.strip().lower()
            if cleaned.endswith("s"):
                cleaned = cleaned[:-1]
            if cleaned.isdigit():
                duration_val = int(cleaned)
        elif isinstance(duration_raw, (int, float)):
            duration_val = int(duration_raw)
        duration_val = max(3, min(15, duration_val))

        aspect = (data.get("aspect") or "16:9").strip()
        if aspect not in {"16:9", "9:16", "1:1"}:
            app.logger.warning("Invalid aspect_ratio '%s' for Kling, defaulting to 16:9", aspect)
            aspect = "16:9"

        kling_input = {
            "prompt": prompt,
            "duration": duration_val,
            "aspect_ratio": aspect,
        }

        # Explicitly fetch token from environment (no implicit detection)
        token = os.environ.get("REPLICATE_API_TOKEN")
        app.logger.info(
            "REPLICATE_API_TOKEN present: %s",
            "yes" if token else "no",
        )
        if not token:
            return jsonify({"error": "Missing REPLICATE_API_TOKEN for Kling"}), 500

        try:
            client = replicate.Client(api_token=token)
            prediction = client.predictions.create(
                model="kwaivgi/kling-v1.6-standard",
                input=kling_input,
            )
        except Exception as e:
            app.logger.error(f"Kling Replicate error: {e}")
            app.logger.error(f"Kling payload: {kling_input}")

            with db() as conn:
                fresh = conn.execute(
                    "SELECT unlimited_generations FROM users WHERE id = ?",
                    (user["id"],),
                ).fetchone()
                unlimited = int(fresh["unlimited_generations"]) == 1 if fresh else False

            if not unlimited:
                add_credits(user["id"], GENERATION_COST_CREDITS, "refund", reference="replicate_generation_failed")

            return jsonify({"error": "Kling Replicate request failed", "details": str(e)}), 502

        prediction_id = prediction.id

        # Store video job in SQLite for history
        try:
            with db() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO videos (user_id, job_id, prompt, model, provider, status, video_url, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["id"],
                        prediction_id,
                        prompt,
                        "kling-v1.6-standard",
                        "replicate",
                        prediction.status or "starting",
                        None,
                        iso(now_utc()),
                        iso(now_utc()),
                    ),
                )
        except Exception:
            app.logger.exception("Failed to insert Kling video job into videos table")

        return jsonify({"jobId": prediction_id})

    else:
        # Default: OpenAI Sora 2 Pro via Replicate Python client
        # We use the "openai/sora-2-pro" model slug directly instead of a
        # separate version ID, and pass only the prompt. This model returns
        # an async prediction id that we track the same way as before.

        app.logger.info(
            "Replicate Sora 2 Pro request",
            extra={
                "model": "openai/sora-2-pro",
                "prompt": prompt,
                "model_choice": model_choice,
            },
        )

        try:
            client = replicate.Client(api_token=REPLICATE_API_TOKEN)
            prediction = client.predictions.create(
                model="openai/sora-2-pro",
                input={
                    "prompt": prompt,
                },
            )
        except Exception as e:
            app.logger.error("Replicate Sora 2 Pro error: %s", e)

            # Refund on failure (if we charged credits)
            with db() as conn:
                fresh = conn.execute(
                    "SELECT unlimited_generations FROM users WHERE id = ?",
                    (user["id"],),
                ).fetchone()
                unlimited = int(fresh["unlimited_generations"]) == 1 if fresh else False

            if not unlimited:
                add_credits(user["id"], GENERATION_COST_CREDITS, "refund", reference="replicate_generation_failed")

            return jsonify({"error": "Replicate Sora 2 Pro request failed", "details": str(e)}), 502

        prediction_id = prediction.id

        # Store video job in SQLite for history
        try:
            with db() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO videos (user_id, job_id, prompt, model, provider, status, video_url, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["id"],
                        prediction_id,
                        prompt,
                        "openai/sora-2-pro",
                        "replicate",
                        prediction.status or "starting",
                        None,
                        iso(now_utc()),
                        iso(now_utc()),
                    ),
                )
        except Exception:
            # Don't break generation flow if history insert fails
            app.logger.exception("Failed to insert Sora 2 Pro video job into videos table")
        return jsonify({"jobId": prediction_id})



@app.route("/api/export-audio", methods=["POST"])
def export_audio():
    data = request.json or {}
    video_url = (data.get("video_url") or "").strip()
    if not video_url:
        return jsonify({"error": "video_url is required"}), 400

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.mp4")

            # Download source video
            r = requests.get(video_url, stream=True, timeout=60)
            r.raise_for_status()
            with open(input_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            output_name = f"audio_{uuid4().hex}.mp3"
            output_path = os.path.join(EXPORT_DIR, output_name)

            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                input_path,
                "-vn",
                "-acodec",
                "mp3",
                output_path,
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        file_url = f"{request.host_url.rstrip('/')}/static/exports/{output_name}"
        return jsonify({"url": file_url})
    except Exception as e:
        app.logger.exception("Error exporting audio from video_url=%s", video_url)
        return jsonify({"error": "Audio export failed", "details": str(e)}), 500


@app.route("/api/extract-audio", methods=["POST", "OPTIONS"])
def extract_audio():
    """Extract the audio track from a stored video asset and save as an MP3.

    Expects JSON:
      { "assetId": "<video media_files.id>" }
    Returns the new audio media asset row.
    """
    if request.method == "OPTIONS":
      return ("", 204)

    init_db()

    # Try to use the logged-in user; if none, fall back to a dev user for local usage.
    user = get_user_from_session()
    if not user:
      user = upsert_user_by_email("dev@example.com")

    data = request.json or {}
    asset_id = (data.get("assetId") or data.get("id") or "").strip()
    if not asset_id:
      return jsonify({"ok": False, "error": "assetId is required"}), 400

    with db() as conn:
      row = conn.execute(
        "SELECT * FROM media_files WHERE id = ? AND user_id = ? AND type = 'video' AND status = 'active'",
        (asset_id, user["id"]),
      ).fetchone()

    if not row:
      return jsonify({"ok": False, "error": "Video asset not found"}), 404

    # Build input and output paths on disk
    storage_key = (row["storage_key"] or "").replace("\\", "/")
    _, filename = os.path.split(storage_key)
    video_input_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(video_input_path):
      return jsonify({"ok": False, "error": "Source video file is missing on disk"}), 500

    audio_id = uuid4().hex
    audio_filename = f"{audio_id}.mp3"
    audio_storage_key = os.path.join("uploads", audio_filename)
    audio_output_path = os.path.join(UPLOAD_DIR, audio_filename)

    try:
      # Prefer MoviePy when available; fall back to ffmpeg if it's not installed
      if VideoFileClip is not None:  # type: ignore[truthy-function]
        # Use MoviePy to extract the audio track as MP3 (legacy 1.0.3 style)
        clip = VideoFileClip(video_input_path)  # type: ignore[call-arg]
        try:
          if clip.audio is None:
            return jsonify({"ok": False, "error": "Video has no audio track"}), 400
          clip.audio.write_audiofile(audio_output_path)
        finally:
          clip.close()
      else:
        # Fallback path when MoviePy is missing or broken: use ffmpeg directly
        cmd = [
          "ffmpeg",
          "-y",
          "-i",
          video_input_path,
          "-vn",
          "-acodec",
          "mp3",
          audio_output_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

      size_bytes = os.path.getsize(audio_output_path)
      mime = "audio/mpeg"
      public_url = f"{request.host_url.rstrip('/')}/static/uploads/{audio_filename}"
      now_s = iso(now_utc())

      with db() as conn:
        conn.execute(
          """
          INSERT INTO media_files (
            id, user_id, type, original_name, mime_type, size_bytes,
            storage_key, public_url, status, created_at, updated_at,
            trashed_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)
          """,
          (
            audio_id,
            user["id"],
            "audio",
            f"{os.path.splitext(row['original_name'])[0]}.mp3",
            mime,
            size_bytes,
            audio_storage_key,
            public_url,
            now_s,
            now_s,
          ),
        )
        audio_row = conn.execute(
          "SELECT * FROM media_files WHERE id = ?",
          (audio_id,),
        ).fetchone()

      return jsonify(
        {
          "ok": True,
          "status": "success",
          "file": media_row_to_dict(audio_row),
          "audio_url": public_url,
        }
      )
    except Exception as e:  # pragma: no cover - best effort
      app.logger.exception("Failed to extract audio for asset_id=%s", asset_id)
      try:
        if os.path.exists(audio_output_path):
          os.remove(audio_output_path)
      except Exception:
        app.logger.exception("Failed to clean up partial audio file for asset_id=%s", asset_id)
      return jsonify({"ok": False, "error": "Audio extraction failed", "details": str(e)}), 500


@app.route("/api/beat-sync", methods=["POST", "OPTIONS"])
def beat_sync():
    """Run beat detection on an audio asset and return beat timestamps in seconds.

    Expects JSON:
      { "audioAssetId": "<audio media_files.id>" }
    """
    if request.method == "OPTIONS":
      return ("", 204)

    init_db()

    # Try to use the logged-in user; if none, fall back to a dev user for local usage.
    user = get_user_from_session()
    if not user:
      user = upsert_user_by_email("dev@example.com")

    data = request.json or {}
    asset_id = (data.get("audioAssetId") or data.get("assetId") or "").strip()
    if not asset_id:
      return jsonify({"ok": False, "error": "audioAssetId is required"}), 400

    if librosa is None:
      return jsonify({"ok": False, "error": "librosa is not available on this server"}), 500

    with db() as conn:
      row = conn.execute(
        "SELECT * FROM media_files WHERE id = ? AND user_id = ? AND type = 'audio' AND status = 'active'",
        (asset_id, user["id"]),
      ).fetchone()

    if not row:
      return jsonify({"ok": False, "error": "Audio asset not found"}), 404

    storage_key = (row["storage_key"] or "").replace("\\", "/")
    _, filename = os.path.split(storage_key)
    audio_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(audio_path):
      return jsonify({"ok": False, "error": "Audio file is missing on disk"}), 500

    try:
      # Load audio and run beat tracking
      y, sr = librosa.load(audio_path, sr=None)  # type: ignore[call-arg]
      tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)  # type: ignore[attr-defined]
      beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()  # type: ignore[attr-defined]

      return jsonify({"ok": True, "status": "success", "tempo": float(tempo), "beats": beat_times})
    except Exception as e:  # pragma: no cover
      app.logger.exception("Beat sync failed for audio asset_id=%s", asset_id)
      return jsonify({"ok": False, "error": "Beat sync failed", "details": str(e)}), 500


@app.route("/api/export-frame", methods=["POST"])
def export_frame():
    data = request.json or {}
    video_url = (data.get("video_url") or "").strip()
    time_sec_raw = data.get("time")
    if not video_url:
        return jsonify({"error": "video_url is required"}), 400

    # Default to first frame unless a specific time (in seconds) is provided
    try:
        time_sec = float(time_sec_raw) if time_sec_raw is not None else 0.0
    except (TypeError, ValueError):
        time_sec = 0.0

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.mp4")

            # Download source video
            r = requests.get(video_url, stream=True, timeout=60)
            r.raise_for_status()
            with open(input_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            output_name = f"frame_{uuid4().hex}.jpg"
            output_path = os.path.join(EXPORT_DIR, output_name)

            cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                str(time_sec),
                "-i",
                input_path,
                "-frames:v",
                "1",
                output_path,
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        file_url = f"{request.host_url.rstrip('/')}/static/exports/{output_name}"
        return jsonify({"url": file_url})
    except Exception as e:
        app.logger.exception("Error exporting frame from video_url=%s", video_url)
        return jsonify({"error": "Frame export failed", "details": str(e)}), 500


@app.route("/api/export-timeline", methods=["POST"])
def export_timeline():
    """Export an edited timeline to a single MP4.

    Supports two payload shapes:

    Legacy (no per-clip settings):
      {
        "video_urls": ["http://.../clip1.mp4", "http://.../clip2.mp4", ...]
      }

    Structured clips (with speed + optional crossfades):
      {
        "clips": [
          {
            "url": "http://.../clip1.mp4",
            "speed": 0.5,                    # optional playback speed; 0.5 = half speed
            "crossfade": true,              # optional, crossfade into the next clip
            "crossfadeDuration": 0.5        # optional, seconds; default ~0.5s
          },
          ...
        ]
      }
    """
    data = request.json or {}
    clips_spec = data.get("clips") or []

    try:
        # Prefer the structured clips payload when MoviePy is available so we can
        # apply per-clip speed changes and transitions before export.
        use_moviepy = (
            isinstance(clips_spec, list)
            and len(clips_spec) > 0
            and VideoFileClip is not None
            and concatenate_videoclips is not None
        )

        if use_moviepy:
            with tempfile.TemporaryDirectory() as tmpdir:
                processed_clips = []
                crossfade_flags: list[bool] = []
                crossfade_durations: list[float] = []

                for idx, spec in enumerate(clips_spec):
                    if not isinstance(spec, dict):
                        continue

                    url = (
                        spec.get("url")
                        or spec.get("video_url")
                        or spec.get("src")
                        or ""
                    ).strip()
                    if not url:
                        continue

                    local_path = os.path.join(tmpdir, f"input_{idx}.mp4")

                    r = requests.get(url, stream=True, timeout=60)
                    r.raise_for_status()
                    with open(local_path, "wb") as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)

                    # Base clip
                    clip = VideoFileClip(local_path)  # type: ignore[call-arg]

                    # Optional speed modification: apply BEFORE any transitions.
                    raw_speed = spec.get("speed")
                    if raw_speed is None:
                        raw_speed = spec.get("playbackRate")
                    try:
                        speed_factor = float(raw_speed) if raw_speed is not None else 1.0
                    except (TypeError, ValueError):
                        speed_factor = 1.0

                    if speed_factor > 0 and abs(speed_factor - 1.0) > 1e-3 and speedx is not None:
                        # MoviePy speed modifier: stretch/compress this clip's timeline.
                        clip = speedx(clip, factor=speed_factor)  # type: ignore[call-arg]

                    processed_clips.append(clip)

                    # Per-join crossfade flag/duration (for this clip -> next).
                    if idx < len(clips_spec) - 1:
                        has_crossfade = bool(
                            spec.get("crossfade")
                            or spec.get("crossfadeToNext")
                            or (
                                isinstance(spec.get("transition"), str)
                                and spec.get("transition").lower() == "crossfade"
                            )
                        )

                        raw_cf = spec.get("crossfadeDuration", data.get("crossfadeDuration", 0.5))
                        try:
                            cf_duration = float(raw_cf)
                        except (TypeError, ValueError):
                            cf_duration = 0.5
                        if cf_duration < 0:
                            cf_duration = 0.0

                        crossfade_flags.append(has_crossfade and cf_duration > 0)
                        crossfade_durations.append(cf_duration if has_crossfade and cf_duration > 0 else 0.0)

                if not processed_clips:
                    return jsonify({"error": "No valid clips provided"}), 400

                output_name = f"timeline_{uuid4().hex}.mp4"
                output_path = os.path.join(EXPORT_DIR, output_name)

                # Build the final clip with safe, per-join crossfades.
                final_clip = processed_clips[0]
                for i in range(1, len(processed_clips)):
                    do_crossfade = crossfade_flags[i - 1] if i - 1 < len(crossfade_flags) else False
                    cf_duration = crossfade_durations[i - 1] if i - 1 < len(crossfade_durations) else 0.0

                    if do_crossfade and cf_duration > 0:
                        incoming = processed_clips[i]
                        # Clamp fade duration so it never exceeds the incoming clip length.
                        try:
                            max_fade = max(0.0, float(getattr(incoming, "duration", cf_duration)) * 0.9)
                        except Exception:
                            max_fade = cf_duration
                        fade = min(cf_duration, max_fade)

                        if fade > 0:
                            incoming_cf = incoming.crossfadein(fade)
                            final_clip = concatenate_videoclips(
                                [final_clip, incoming_cf],
                                method="compose",
                                padding=-fade,
                            )
                        else:
                            final_clip = concatenate_videoclips(
                                [final_clip, processed_clips[i]],
                                method="compose",
                            )
                    else:
                        final_clip = concatenate_videoclips(
                            [final_clip, processed_clips[i]],
                            method="compose",
                        )

                # Write out the combined timeline.
                final_clip.write_videofile(
                    output_path,
                    codec="libx264",
                    audio_codec="aac",
                    temp_audiofile=os.path.join(tmpdir, "temp-audio.m4a"),
                    remove_temp=True,
                )

                # Clean up clip objects.
                try:
                    final_clip.close()
                except Exception:
                    pass
                for clip in processed_clips:
                    try:
                        clip.close()
                    except Exception:
                        pass

            file_url = f"{request.host_url.rstrip('/')}/static/exports/{output_name}"
            return jsonify({"url": file_url})

        # Fallback path: legacy ffmpeg concat, or when MoviePy is unavailable.
        urls = data.get("video_urls") or []
        if (not isinstance(urls, list) or not urls) and isinstance(clips_spec, list) and clips_spec:
            # Derive URLs from structured clips if present.
            urls = []
            for spec in clips_spec:
                if not isinstance(spec, dict):
                    continue
                url = (
                    spec.get("url")
                    or spec.get("video_url")
                    or spec.get("src")
                    or ""
                ).strip()
                if url:
                    urls.append(url)

        if not isinstance(urls, list) or not urls:
            return jsonify({"error": "video_urls (non-empty list) is required"}), 400

        with tempfile.TemporaryDirectory() as tmpdir:
            input_paths = []

            # Download each clip
            for i, url in enumerate(urls):
                url = (url or "").strip()
                if not url:
                    continue
                local_path = os.path.join(tmpdir, f"input_{i}.mp4")

                r = requests.get(url, stream=True, timeout=60)
                r.raise_for_status()
                with open(local_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)

                input_paths.append(local_path)

            if not input_paths:
                return jsonify({"error": "No valid video URLs after download"}), 400

            # Build ffmpeg concat list file
            list_path = os.path.join(tmpdir, "inputs.txt")
            with open(list_path, "w", encoding="utf-8") as f:
                for path in input_paths:
                    f.write(f"file '{path}'\n")

            output_name = f"timeline_{uuid4().hex}.mp4"
            output_path = os.path.join(EXPORT_DIR, output_name)

            cmd = [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                list_path,
                "-c",
                "copy",
                output_path,
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        file_url = f"{request.host_url.rstrip('/')}/static/exports/{output_name}"
        return jsonify({"url": file_url})
    except Exception as e:
        app.logger.exception("Error exporting timeline from payload=%s", data)
        return jsonify({"error": "Timeline export failed", "details": str(e)}), 500


@app.route("/api/video-status/<job_id>", methods=["GET", "OPTIONS"])
def api_video_status(job_id: str):
    """Check status of a prediction (Replicate or Veo) and return video URL when ready."""
    if request.method == "OPTIONS":
        return ("", 204)

    # Look up provider for this job (defaults to Replicate if unknown)
    provider = "replicate"
    with db() as conn:
        row = conn.execute(
            "SELECT provider FROM videos WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        if row and row["provider"]:
            provider = row["provider"]

    def _extract_url_from_obj(obj):
        if isinstance(obj, str):
            return obj
        if isinstance(obj, dict):
            for key in ("video", "video_url", "url", "uri"):
                val = obj.get(key)
                if isinstance(val, str):
                    return val
        return None

    try:
        if provider == "veo":
            # Veo 3 Lite status polling
            if not GOOGLE_API_KEY:
                return jsonify({"error": "Missing GOOGLE_API_KEY environment variable for Veo"}), 500
            if not VEO_STATUS_URL:
                return jsonify({"error": "Missing VEO_STATUS_URL environment variable for Veo"}), 500

            r = requests.get(
                f"{VEO_STATUS_URL.rstrip('/')}/{job_id}",
                headers={"Authorization": f"Bearer {GOOGLE_API_KEY}"},
                timeout=30,
            )
            r.raise_for_status()
            body = r.json()

            app.logger.info("Veo status body for job_id=%s: %s", job_id, body)

            # Heuristic status: many async APIs expose 'status', 'state', or 'done' flags
            status = body.get("status") or body.get("state")
            if status is None and isinstance(body.get("done"), bool):
                status = "succeeded" if body["done"] else "processing"
            if status == "completed":
                status = "succeeded"

            output = body.get("output") or body.get("response") or {}
        else:
            # Default: Replicate predictions API
            if not REPLICATE_API_TOKEN:
                return jsonify({"error": "Missing REPLICATE_API_TOKEN environment variable"}), 500

            r = requests.get(
                f"{REPLICATE_API_BASE}/predictions/{job_id}",
                headers={"Authorization": f"Token {REPLICATE_API_TOKEN}"},
                timeout=30,
            )
            r.raise_for_status()
            body = r.json()

            # Log raw body for debugging stuck progress issues
            app.logger.info("Replicate status body for job_id=%s: %s", job_id, body)

            status = body.get("status") or body.get("state")  # starting | processing | succeeded | failed | canceled
            if status == "completed":
                # Some models may use "completed"; normalize to "succeeded" for the frontend
                status = "succeeded"

            output = body.get("output")

        if status in {None, "starting", "queued"}:
            status = "processing"

        # Try to extract a video URL from various possible shapes
        video_url = None

        if isinstance(output, str):
            video_url = output
        elif isinstance(output, list):
            for item in output:
                candidate = _extract_url_from_obj(item)
                if candidate:
                    video_url = candidate
                    break
        elif isinstance(output, dict):
            video_url = _extract_url_from_obj(output)

        # NOTE: We intentionally do NOT fall back to body["urls"]["get"] here,
        # because that is the Replicate API endpoint for the prediction itself,
        # not a playable media URL. We only return a videoUrl when we can
        # extract a likely media URL from the model's "output" field.

        app.logger.info(
            "Parsed status=%s video_url=%s provider=%s for job_id=%s",
            status,
            video_url,
            provider,
            job_id,
        )

        # Persist latest status / URL for this job
        try:
            with db() as conn:
                conn.execute(
                    "UPDATE videos SET status = ?, video_url = COALESCE(?, video_url), updated_at = ? WHERE job_id = ?",
                    (status, video_url, iso(now_utc()), job_id),
                )
        except Exception:
            app.logger.exception("Failed to update videos table for job_id=%s", job_id)

        return jsonify(
            {
                "status": status,
                "videoUrl": video_url,
            }
        )
    except Exception as e:
        app.logger.exception("Unexpected error in api_video_status for job_id=%s", job_id)
        return jsonify({"error": str(e)}), 500


# -------------------------
# Media asset library (upload + trash + auto-delete support)
# -------------------------


@app.route("/api/assets/upload", methods=["POST", "OPTIONS"])
def upload_asset():
    """Upload a user media file (video/image/audio) and store metadata.

    Expects multipart/form-data with:
      - file: the uploaded file
      - type: 'video' | 'image' | 'audio'
    """
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    # Try to use the logged-in user; if none, fall back to a dev user for local usage.
    user = get_user_from_session()
    if not user:
        user = upsert_user_by_email("dev@example.com")

    file = request.files.get("file")
    media_type = (request.form.get("type") or "").strip().lower()

    if not file or file.filename == "":
        return jsonify({"error": "No file uploaded"}), 400

    if media_type not in {"video", "image", "audio"}:
        return jsonify({"error": "Invalid or missing type. Use 'video', 'image', or 'audio'."}), 400

    mime = (file.mimetype or "").lower()
    if media_type == "video" and not mime.startswith("video/"):
        return jsonify({"error": "Uploaded file is not a video"}), 400
    if media_type == "image" and not mime.startswith("image/"):
        return jsonify({"error": "Uploaded file is not an image"}), 400
    if media_type == "audio" and not mime.startswith("audio/"):
        return jsonify({"error": "Uploaded file is not audio"}), 400

    original_name = file.filename

    # Determine per-type max size (fallback to global MAX_UPLOAD_BYTES)
    if media_type == "video":
      max_bytes = MAX_VIDEO_UPLOAD_BYTES
    elif media_type == "image":
      max_bytes = MAX_IMAGE_UPLOAD_BYTES
    else:  # audio
      max_bytes = MAX_AUDIO_UPLOAD_BYTES

    # Generate a safe unique filename, preserve extension if present
    ext = os.path.splitext(original_name)[1]
    safe_ext = ext if ext and len(ext) <= 8 else ""
    file_id = uuid4().hex
    filename = f"{file_id}{safe_ext}"
    storage_key = os.path.join("uploads", filename)
    output_path = os.path.join(UPLOAD_DIR, filename)

    try:
        file.save(output_path)
        size_bytes = os.path.getsize(output_path)
        if size_bytes > max_bytes:
            # Clean up and reject oversize uploads
            try:
                os.remove(output_path)
            except Exception:
                app.logger.exception("Failed to remove oversized uploaded file")
            max_mb = max_bytes // (1024 * 1024)
            return jsonify({"error": f"File too large. Maximum size for {media_type} is {max_mb} MB."}), 413

        # For videos, also enforce a maximum duration (e.g. 60 seconds)
        if media_type == "video":
            try:
                # Use ffprobe to read duration in seconds
                result = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        output_path,
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=True,
                )
                duration_s = float(result.stdout.strip() or 0.0)
                if duration_s > MAX_VIDEO_DURATION_SECONDS:
                    try:
                        os.remove(output_path)
                    except Exception:
                        app.logger.exception("Failed to remove over-duration uploaded video")
                    return jsonify({"error": f"Video too long. Maximum duration is {MAX_VIDEO_DURATION_SECONDS} seconds."}), 413
            except Exception:
                # If ffprobe fails, we don't reject purely on that basis; just log.
                app.logger.exception("Failed to inspect video duration for uploaded asset")
    except Exception as e:
        app.logger.exception("Failed to save uploaded media file")
        return jsonify({"error": "Failed to save file", "details": str(e)}), 500

    public_url = f"{request.host_url.rstrip('/')}/static/uploads/{filename}"
    now = iso(now_utc())

    with db() as conn:
        conn.execute(
            """
            INSERT INTO media_files (
              id, user_id, type, original_name, mime_type, size_bytes,
              storage_key, public_url, status, created_at, updated_at,
              trashed_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            """,
            (
                file_id,
                user["id"],
                media_type,
                original_name,
                mime,
                size_bytes,
                storage_key,
                public_url,
                "active",
                now,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM media_files WHERE id = ?",
            (file_id,),
        ).fetchone()

    return jsonify({"ok": True, "file": media_row_to_dict(row)})


@app.route("/api/assets", methods=["GET", "OPTIONS"])
def list_assets():
    """List media assets for the current user, optionally filtered by type.

    Query params:
      - type: 'video' | 'image' | 'audio' (optional)
      - includeTrash: 'true' | 'false' (default false)

    This route always returns a JSON payload, even on error, so the
    frontend never sees an HTML 404/500 when loading the sidebar.
    """
    if request.method == "OPTIONS":
        return ("", 204)

        init_db()

    # Try to use the logged-in user; if none, fall back to a dev user for local usage.
    user = get_user_from_session()
    if not user:
        user = upsert_user_by_email("dev@example.com")

    media_type = (request.args.get("type") or "").strip().lower() or None
    include_trash_raw = (request.args.get("includeTrash") or "false").strip().lower()
    include_trash = include_trash_raw in {"1", "true", "yes"}

    params: list[object] = [user["id"]]
    where_clauses = ["user_id = ?"]

    if media_type in {"video", "image", "audio"}:
        where_clauses.append("type = ?")
        params.append(media_type)

    if include_trash:
        where_clauses.append("status IN ('active','trashed')")
    else:
        where_clauses.append("status = 'active'")

    where_sql = " AND ".join(where_clauses)

    with db() as conn:
        rows = conn.execute(
            f"SELECT * FROM media_files WHERE {where_sql} ORDER BY created_at DESC",
            tuple(params),
        ).fetchall()

    files_payload = [media_row_to_dict(r) for r in rows]
    # Provide both "files" (what the frontend expects) and "assets" for
    # compatibility with simpler clients.
    return jsonify({"ok": True, "files": files_payload, "assets": files_payload})




@app.route("/api/assets/<file_id>/trash", methods=["POST", "OPTIONS"])
def trash_asset(file_id: str):
    """Soft delete: move a media file to Trash (status=trashed)."""
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    # Try to use the logged-in user; if none, fall back to a dev user for local usage.

    user = get_user_from_session()
    if not user:
        user = upsert_user_by_email("dev@example.com")

    now = iso(now_utc())

    with db() as conn:
        cur = conn.execute(
            """
            UPDATE media_files
               SET status = 'trashed', trashed_at = ?, updated_at = ?
             WHERE id = ? AND user_id = ? AND status = 'active'
            """,
            (now, now, file_id, user["id"]),
        )
        if cur.rowcount == 0:
            return jsonify({"error": "File not found or already trashed"}), 404

    return jsonify({"ok": True})


@app.route("/api/assets/<file_id>/restore", methods=["POST", "OPTIONS"])
def restore_asset(file_id: str):
    """Restore a trashed media file back to active."""
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    # Try to use the logged-in user; if none, fall back to a dev user for local usage.

    user = get_user_from_session()
    if not user:
        user = upsert_user_by_email("dev@example.com")

    now = iso(now_utc())

    with db() as conn:
        cur = conn.execute(
            """
            UPDATE media_files
               SET status = 'active', trashed_at = NULL, updated_at = ?
             WHERE id = ? AND user_id = ? AND status = 'trashed'
            """,
            (now, file_id, user["id"]),
        )
        if cur.rowcount == 0:
            return jsonify({"error": "File not found or not trashed"}), 404

    return jsonify({"ok": True})


@app.route("/api/assets/<file_id>", methods=["DELETE", "OPTIONS"])
def delete_asset(file_id: str):
    """Hard delete: remove file from disk and mark as deleted.

    Typically called by a scheduled cleanup (for items >30 days in trash)
    or by a "Delete forever" button in the Trash UI.
    """
    if request.method == "OPTIONS":
        return ("", 204)

    init_db()

    try:
        user = require_user()
    except PermissionError:
        return jsonify({"error": "Not authenticated"}), 401

    with db() as conn:
        row = conn.execute(
            "SELECT * FROM media_files WHERE id = ? AND user_id = ? AND status != 'deleted'",
            (file_id, user["id"]),
        ).fetchone()
        if not row:
            return jsonify({"error": "File not found"}), 404

        storage_key = row["storage_key"]

        # Attempt to remove from local disk if it lives under our UPLOAD_DIR
        try:
            # storage_key is typically 'uploads/filename.ext'
            rel_path = storage_key.replace("\\", "/")
            _, name = os.path.split(rel_path)
            disk_path = os.path.join(UPLOAD_DIR, name)
            if os.path.commonpath([os.path.abspath(disk_path), os.path.abspath(UPLOAD_DIR)]) == os.path.abspath(UPLOAD_DIR):
                if os.path.exists(disk_path):
                    os.remove(disk_path)
        except Exception:
            app.logger.exception("Failed to remove media file from disk for id=%s", file_id)

        now = iso(now_utc())
        conn.execute(
            """
            UPDATE media_files
               SET status = 'deleted', deleted_at = ?, updated_at = ?
             WHERE id = ? AND user_id = ?
            """,
            (now, now, file_id, user["id"]),
        )

    return jsonify({"ok": True})


def cleanup_trashed_media_older_than(days: int = 30) -> int:
    """Delete media files that have been in trash longer than `days`.

    Returns the number of records marked as deleted.
    """
    cutoff = now_utc() - timedelta(days=days)
    cutoff_iso = iso(cutoff)

    deleted_count = 0

    with db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM media_files
             WHERE status = 'trashed'
               AND trashed_at IS NOT NULL
               AND trashed_at <= ?
            """,
            (cutoff_iso,),
        ).fetchall()

        for row in rows:
            file_id = row["id"]
            storage_key = row["storage_key"]

            try:
                rel_path = storage_key.replace("\\", "/")
                _, name = os.path.split(rel_path)
                disk_path = os.path.join(UPLOAD_DIR, name)
                if os.path.commonpath([os.path.abspath(disk_path), os.path.abspath(UPLOAD_DIR)]) == os.path.abspath(UPLOAD_DIR):
                    if os.path.exists(disk_path):
                        os.remove(disk_path)
            except Exception:
                app.logger.exception("Failed to remove trashed media file from disk for id=%s", file_id)

            now_s = iso(now_utc())
            conn.execute(
                """
                UPDATE media_files
                   SET status = 'deleted', deleted_at = ?, updated_at = ?
                 WHERE id = ?
                """,
                (now_s, now_s, file_id),
            )
            deleted_count += 1

    return deleted_count


@app.route("/admin/cleanup-media", methods=["POST", "OPTIONS"])
def trigger_cleanup_media():
    """Trigger cleanup of trashed media older than 30 days.

    In production, call this from a cron job or scheduler once per day.
    """
    if request.method == "OPTIONS":
        return ("", 204)

    # NOTE: You may want to protect this route with an admin token or IP allowlist.
    deleted = cleanup_trashed_media_older_than(days=30)
    return jsonify({"ok": True, "deleted": deleted})


@app.route("/trim-video", methods=["POST", "OPTIONS"])
def trim_video():
    """Receive trim start/end times from the frontend.

    Expects JSON like: {"start_time": 1.23, "end_time": 4.56}
    """
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.json or {}
    start_time = data.get("start_time")
    end_time = data.get("end_time")

    print("--- Received Trim Request ---")
    print(f"Start Time: {start_time} seconds")
    print(f"End Time: {end_time} seconds")

    app.logger.info("--- Received Trim Request --- start=%s end=%s", start_time, end_time)

    # TODO: Add your actual video slicing logic here (e.g. using ffmpeg or MoviePy)
    return jsonify(
        {
            "status": "success",
            "message": f"Received clip from {start_time}s to {end_time}s",
        }
    ), 200


# Placeholder routes (your converter UI uses these; implement later if needed)
@app.route("/convert", methods=["POST"])
def convert():
    return "Shorts to YouTube conversion route"


@app.route("/convert_shorts", methods=["POST"])
def convert_shorts():
    return "YouTube to Shorts conversion route"


@app.route("/format_convert", methods=["POST"])
def format_convert():
    return "Video to MP4 conversion route"


if __name__ == "__main__":
    # Local/dev entrypoint. Railway and other production environments should
    # run this app via gunicorn (e.g. `gunicorn app:app`) and will inject the
    # PORT environment variable dynamically.
    #
    # For local development we default to port 5001 so that the Next.js
    # dev proxy in ai-studio-frontend/next.config.js can route /api/*
    # traffic to this Flask app (Option A).
    init_db()
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)