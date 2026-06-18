"""Runtime configuration for the Tactile Graphic Agent backend."""
from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    """Minimal .env loader (no dependency). Looks at backend/.env and repo-root
    .env; existing environment variables always win. Keeps secrets out of chat
    and out of git (.env is gitignored)."""
    here = Path(__file__).resolve().parent.parent
    for candidate in (here / ".env", here.parent / ".env"):
        if not candidate.is_file():
            continue
        for raw in candidate.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


_load_dotenv()

# Repository / data layout -------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
DATA_DIR = Path(os.environ.get("TGA_DATA_DIR", BASE_DIR / "data"))
STORAGE_DIR = DATA_DIR / "jobs"                            # per-job artifacts
DB_PATH = Path(os.environ.get("TGA_DB_PATH", DATA_DIR / "tga.sqlite3"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# AI engine ----------------------------------------------------------------
# Two providers are supported; pick by which key is present (Gemini first since
# it has a free tier). Force one with TGA_PROVIDER=gemini|anthropic|mock.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

MODEL = os.environ.get("TGA_MODEL", "claude-opus-4-8")          # Anthropic model
GEMINI_MODEL = os.environ.get("TGA_GEMINI_MODEL", "gemini-2.0-flash")  # free-tier vision


def _resolve_provider() -> str:
    if os.environ.get("TGA_FORCE_MOCK") == "1":
        return "mock"
    forced = os.environ.get("TGA_PROVIDER", "").strip().lower()
    if forced in ("gemini", "anthropic", "mock", "cv"):
        return forced
    if GEMINI_API_KEY:
        return "gemini"
    if ANTHROPIC_API_KEY:
        return "anthropic"
    return "mock"


PROVIDER = _resolve_provider()
# When no key is present the pipeline runs entirely on the rule-based mock so
# the whole app stays demoable offline.
USE_MOCK = PROVIDER == "mock"
# Only these providers call a language model; "cv" and "mock" use the
# deterministic/heuristic paths in the text agents.
LLM_ENABLED = PROVIDER in ("gemini", "anthropic")


def active_model() -> str:
    return {
        "gemini": GEMINI_MODEL,
        "anthropic": MODEL,
        "cv": "local-cv (OpenCV)",
        "mock": "mock",
    }[PROVIDER]

# Tactile device geometry --------------------------------------------------
# DotPad standard panel is 60 columns x 40 rows of pins (2400 cells).
DOTPAD_60x40 = (60, 40)
DOTPAD_96x64 = (96, 64)

# CORS ---------------------------------------------------------------------
ALLOWED_ORIGINS = os.environ.get(
    "TGA_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
