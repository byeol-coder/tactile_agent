"""Agent 2 — Tactile Design.

Turns the image analysis into a normalized tactile scene graph: primitives,
tactile patterns (raised/recessed), a finger-exploration order, and a split
decision for complex scenes.
"""
from __future__ import annotations

import json

from .. import config
from ..schemas import DESIGN_SCHEMA
from .base import SYSTEM

_PROMPT = (
    "Here is the structured analysis of an image:\n\n{analysis}\n\n"
    "Redesign it as a tactile scene graph for a DotPad {w}x{h} display.\n"
    "Rules:\n"
    "- Use at most 10 primitives. Keep elements clearly separated (avoid lines "
    "closer than ~3 pin cells).\n"
    "- Each primitive needs a stable id (e1, e2, ...), a kind, a tactile level "
    "(raised for main subjects, recessed for context/secondary), a line_style, "
    "and a short Korean label/role.\n"
    "- Provide tactile_patterns (how each element should feel), an exploration_order "
    "(logical finger path, usually whole→parts, top→bottom or left→right), and set "
    "split_required=true with a reason if the scene cannot be read clearly at this "
    "resolution.\n"
    "- Keep coordinates within [0.05, 0.95]. Respond only via the schema."
)


def run(understanding: dict, width: int, height: int, aspect: str) -> dict:
    if not config.LLM_ENABLED:
        return _mock(aspect)

    from .. import llm

    prompt = _PROMPT.format(
        analysis=json.dumps(understanding, ensure_ascii=False, indent=2),
        w=width,
        h=height,
    )
    design = llm.call_structured(SYSTEM, prompt, DESIGN_SCHEMA)
    design.setdefault("tactile_design", {}).setdefault("canvas_aspect", aspect)
    return design


def _mock(aspect: str) -> dict:
    primitives = [
        {"id": "e1", "kind": "polyline", "level": "recessed", "line_style": "dashed",
         "points": [[0.05, 0.75], [0.95, 0.75]], "center": None, "radius": None,
         "label": "지면", "role": "horizon"},
        {"id": "e2", "kind": "rect", "level": "raised", "line_style": "solid",
         "points": [[0.30, 0.45], [0.60, 0.75]], "center": None, "radius": None,
         "label": "집 몸체", "role": "house_body"},
        {"id": "e3", "kind": "polygon", "level": "raised", "line_style": "solid",
         "points": [[0.28, 0.45], [0.45, 0.30], [0.62, 0.45]], "center": None,
         "radius": None, "label": "지붕", "role": "roof"},
        {"id": "e4", "kind": "rect", "level": "raised", "line_style": "solid",
         "points": [[0.41, 0.60], [0.49, 0.75]], "center": None, "radius": None,
         "label": "문", "role": "door"},
        {"id": "e5", "kind": "circle", "level": "raised", "line_style": "solid",
         "points": [], "center": [0.80, 0.22], "radius": 0.08,
         "label": "태양", "role": "sun"},
    ]
    return {
        "tactile_design": {
            "canvas_aspect": aspect,
            "primitives": primitives,
            "design_notes": [
                "주요 대상(집·태양)은 양각, 배경 기준선(지면)은 음각 점선으로 구분",
                "요소 간 간격을 충분히 확보해 손가락 탐색이 가능하도록 배치",
            ],
        },
        "tactile_patterns": [
            {"element_id": "e1", "pattern": "음각 점선 (기준선)", "level": "recessed"},
            {"element_id": "e2", "pattern": "양각 실선 사각형", "level": "raised"},
            {"element_id": "e3", "pattern": "양각 실선 삼각형", "level": "raised"},
            {"element_id": "e4", "pattern": "양각 실선 작은 사각형", "level": "raised"},
            {"element_id": "e5", "pattern": "양각 실선 원", "level": "raised"},
        ],
        "exploration_order": [
            {"order": 1, "element_id": "e1", "instruction": "먼저 화면을 가로지르는 지면 선을 따라가 전체 방향을 파악하세요."},
            {"order": 2, "element_id": "e2", "instruction": "중앙 하단의 사각형(집 몸체)을 손끝으로 따라 그려보세요."},
            {"order": 3, "element_id": "e3", "instruction": "집 위의 삼각형(지붕)을 만져 집의 윗부분을 확인하세요."},
            {"order": 4, "element_id": "e4", "instruction": "집 가운데 아래의 작은 사각형(문)을 찾아보세요."},
            {"order": 5, "element_id": "e5", "instruction": "우측 상단의 원(태양)을 만져 위치 관계를 이해하세요."},
        ],
        "split_required": False,
        "split_reason": "",
    }
