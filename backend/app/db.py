"""SQLite job store + filesystem artifact storage.

The DB holds job metadata; the six required output files plus the source image
and a combined bundle live under data/jobs/<job_id>/.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from . import config

_ARTIFACT_FILES = {
    "tactile_spec": "tactile_spec.json",
    "dotpad_60x40": "dotpad_60x40.json",
    "dotpad_96x64": "dotpad_96x64.json",
    "audio_guide": "audio_guide.json",
    "qa_report": "qa_report.json",
}


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                filename TEXT,
                title TEXT,
                status TEXT,
                model_used TEXT,
                mock INTEGER,
                overall_score INTEGER,
                created_at REAL,
                updated_at REAL,
                error TEXT
            )
            """
        )


def job_dir(job_id: str) -> Path:
    d = config.STORAGE_DIR / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def create_job(filename: str) -> str:
    job_id = uuid.uuid4().hex[:12]
    now = time.time()
    with _conn() as c:
        c.execute(
            "INSERT INTO jobs (id, filename, status, model_used, mock, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (job_id, filename, "processing", config.MODEL, int(config.USE_MOCK), now, now),
        )
    job_dir(job_id)
    return job_id


def save_source(job_id: str, raw: bytes, ext: str) -> None:
    (job_dir(job_id) / f"source{ext}").write_bytes(raw)


def save_bundle(job_id: str, bundle: dict[str, Any]) -> None:
    d = job_dir(job_id)
    (d / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2))
    (d / "tactile.svg").write_text(bundle["tactile_svg"])
    for key, fname in _ARTIFACT_FILES.items():
        (d / fname).write_text(json.dumps(bundle[key], ensure_ascii=False, indent=2))


def complete_job(job_id: str, title: str, overall_score: int) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE jobs SET status=?, title=?, overall_score=?, updated_at=? WHERE id=?",
            ("done", title, overall_score, time.time(), job_id),
        )


def fail_job(job_id: str, error: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE jobs SET status=?, error=?, updated_at=? WHERE id=?",
            ("error", error, time.time(), job_id),
        )


def load_bundle(job_id: str) -> Optional[dict]:
    path = job_dir(job_id) / "bundle.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def get_job(job_id: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return dict(row) if row else None


def list_jobs() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def artifact_path(job_id: str, name: str) -> Optional[Path]:
    fname = {"tactile_svg": "tactile.svg", "bundle": "bundle.json", **_ARTIFACT_FILES}.get(name)
    if not fname:
        return None
    path = job_dir(job_id) / fname
    return path if path.exists() else None
