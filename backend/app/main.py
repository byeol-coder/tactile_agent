"""FastAPI entrypoint for the Tactile Graphic Agent."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, db
from .routers import jobs

app = FastAPI(
    title="Tactile Graphic Agent",
    description="시각 정보를 촉각 학습 경험으로 번역하는 독립형 접근성 전문 에이전트",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router)

# Idempotent — ensure the schema exists whenever the app module is imported
# (covers both `uvicorn` startup and embedded/TestClient use).
db.init_db()


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


@app.get("/")
def root() -> dict:
    return {"service": "tactile-graphic-agent", "docs": "/docs", "health": "/api/health"}
