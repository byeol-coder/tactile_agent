"""Runtime configuration for the Tactile Graphic Agent backend."""
from __future__ import annotations

import os
from pathlib import Path

# Repository / data layout -------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
DATA_DIR = Path(os.environ.get("TGA_DATA_DIR", BASE_DIR / "data"))
STORAGE_DIR = DATA_DIR / "jobs"                            # per-job artifacts
DB_PATH = Path(os.environ.get("TGA_DB_PATH", DATA_DIR / "tga.sqlite3"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# AI engine ----------------------------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
# claude-api skill: default to Opus 4.8 unless the operator overrides it.
MODEL = os.environ.get("TGA_MODEL", "claude-opus-4-8")
# When no key is present the pipeline runs entirely on the rule-based mock so
# the whole app stays demoable offline.
USE_MOCK = not bool(ANTHROPIC_API_KEY) or os.environ.get("TGA_FORCE_MOCK") == "1"

# Tactile device geometry --------------------------------------------------
# DotPad standard panel is 60 columns x 40 rows of pins (2400 cells).
DOTPAD_60x40 = (60, 40)
DOTPAD_96x64 = (96, 64)

# CORS ---------------------------------------------------------------------
ALLOWED_ORIGINS = os.environ.get(
    "TGA_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
