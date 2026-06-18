"""Agent 1 — Image Understanding.

Looks at the uploaded image (Claude vision) and produces a structured analysis:
title, category, scene description, and a triage of essential vs. removable
elements. Falls back to a deterministic mock when no API key is present.
"""
from __future__ import annotations

from .. import config
from ..schemas import UNDERSTANDING_SCHEMA
from .base import SYSTEM

_PROMPT = (
    "Analyze this image for tactile redesign. Identify the title, a category "
    "(e.g. diagram, map, chart, illustration, photo), the scene type, the key "
    "objects, their spatial relationships, any embedded text, and the overall "
    "complexity. Then split elements into ESSENTIAL (must survive as tactile "
    "structure) and REMOVABLE (background/color/decoration that should be dropped). "
    "Think like a teacher of blind students: what does the learner truly need to "
    "understand the concept?"
)


def run(b64_data: str, media_type: str, filename: str) -> dict:
    if config.USE_MOCK:
        return _mock(filename)

    from .. import llm

    content = [llm.image_block(b64_data, media_type), {"type": "text", "text": _PROMPT}]
    return llm.call_structured(SYSTEM, content, UNDERSTANDING_SCHEMA)


def _mock(filename: str) -> dict:
    return {
        "title": f"촉각 그래픽 데모 ({filename})",
        "category": "illustration",
        "image_analysis": {
            "summary": (
                "데모 모드: API 키가 없어 규칙 기반 목업 분석을 사용합니다. "
                "단순한 풍경(집·태양·지면)을 대표 구조로 가정합니다."
            ),
            "scene_type": "illustration",
            "detected_objects": ["집", "태양", "지면 선", "문"],
            "spatial_relations": [
                "태양은 화면 우측 상단에 있다",
                "집은 화면 중앙 하단에 있다",
                "지면 선이 화면을 가로지른다",
            ],
            "text_in_image": [],
            "complexity": "medium",
        },
        "essential_elements": [
            {"name": "집 외곽선", "reason": "장면의 핵심 대상으로 형태 인지가 필요"},
            {"name": "지붕", "reason": "집을 식별하는 결정적 형태"},
            {"name": "태양", "reason": "위치 관계(상단)를 전달하는 핵심 요소"},
            {"name": "지면 선", "reason": "공간의 기준선이 되어 방향감을 제공"},
        ],
        "removable_elements": [
            {"name": "하늘 색상", "reason": "촉각으로 표현 불가하며 의미 없음"},
            {"name": "그림자", "reason": "장식 요소로 촉각 혼란 유발"},
            {"name": "질감/패턴 채움", "reason": "점 밀도를 높여 가독성 저하"},
        ],
    }
