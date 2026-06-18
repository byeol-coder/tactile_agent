"""HTTP API: upload, pipeline run, retrieval, human review, and export."""
from __future__ import annotations

import base64
import io
import zipfile

from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from .. import config, db
from ..agents import pipeline

router = APIRouter(prefix="/api", tags=["jobs"])

_MEDIA = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
    "image/gif": ".gif", "image/webp": ".webp",
}


def _image_meta(raw: bytes, content_type: str | None) -> tuple[str, str, int, int]:
    """Return (media_type, ext, width, height) using Pillow for robustness."""
    from PIL import Image

    media_type = (content_type or "").lower()
    width, height = 600, 600
    try:
        img = Image.open(io.BytesIO(raw))
        width, height = img.size
        fmt = (img.format or "").lower()
        media_type = {"jpeg": "image/jpeg", "png": "image/png",
                      "gif": "image/gif", "webp": "image/webp"}.get(fmt, media_type)
    except Exception:
        pass
    if media_type not in _MEDIA:
        media_type = "image/png"
    return media_type, _MEDIA[media_type], width, height


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "provider": config.PROVIDER,
        "model": config.active_model(),
        "mock_mode": config.USE_MOCK,
    }


@router.post("/jobs")
async def create_job(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "빈 파일입니다.")
    media_type, ext, width, height = _image_meta(raw, file.content_type)

    job_id = db.create_job(file.filename or "image")
    db.save_source(job_id, raw, ext)
    try:
        b64 = base64.b64encode(raw).decode()
        bundle = pipeline.run_pipeline(b64, media_type, file.filename or "image", width, height)
        db.save_bundle(job_id, bundle)
        db.complete_job(job_id, bundle["tactile_spec"]["title"],
                        bundle["qa_report"]["overall_score"])
    except Exception as exc:  # surface the failure rather than hiding it
        db.fail_job(job_id, str(exc))
        raise HTTPException(500, f"파이프라인 처리 실패: {exc}") from exc

    return {"job_id": job_id, "meta": db.get_job(job_id), **bundle}


@router.get("/jobs")
def list_jobs() -> dict:
    return {"jobs": db.list_jobs()}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    meta = db.get_job(job_id)
    bundle = db.load_bundle(job_id)
    if not meta or not bundle:
        raise HTTPException(404, "작업을 찾을 수 없습니다.")
    return {"job_id": job_id, "meta": meta, **bundle}


@router.put("/jobs/{job_id}/spec")
def update_spec(job_id: str, spec: dict = Body(..., embed=True)) -> dict:
    """Human Review Editor: persist an edited TactileSpec, then re-render + re-QA."""
    if not db.get_job(job_id):
        raise HTTPException(404, "작업을 찾을 수 없습니다.")
    try:
        bundle = pipeline.rerender(spec)
    except Exception as exc:
        raise HTTPException(400, f"유효하지 않은 설계안입니다: {exc}") from exc
    db.save_bundle(job_id, bundle)
    db.complete_job(job_id, bundle["tactile_spec"]["title"],
                    bundle["qa_report"]["overall_score"])
    return {"job_id": job_id, "meta": db.get_job(job_id), **bundle}


@router.get("/jobs/{job_id}/export/{name}")
def export_artifact(job_id: str, name: str):
    path = db.artifact_path(job_id, name)
    if not path:
        raise HTTPException(404, "산출물을 찾을 수 없습니다.")
    media = "image/svg+xml" if name == "tactile_svg" else "application/json"
    return FileResponse(path, media_type=media, filename=path.name)


@router.get("/jobs/{job_id}/export.zip")
def export_zip(job_id: str):
    bundle = db.load_bundle(job_id)
    if not bundle:
        raise HTTPException(404, "작업을 찾을 수 없습니다.")
    d = db.job_dir(job_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in ("tactile_spec.json", "tactile.svg", "dotpad_60x40.json",
                      "dotpad_96x64.json", "audio_guide.json", "qa_report.json"):
            fpath = d / fname
            if fpath.exists():
                zf.write(fpath, fname)
    buf.seek(0)
    return Response(
        buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="tactile_{job_id}.zip"'},
    )
