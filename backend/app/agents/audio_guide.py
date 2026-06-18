"""Agent 5 — Audio Guide.

Writes the spoken narration that accompanies tactile exploration: an intro that
orients the learner, one segment per exploration step (kept in sync with the
scene graph element ids), and a closing summary.
"""
from __future__ import annotations

import json

from .. import config
from ..schemas import AUDIO_SCHEMA
from .base import SYSTEM

_PROMPT = (
    "Title: {title}\nCategory: {category}\n\n"
    "Tactile design (scene graph): {design}\n\n"
    "Exploration order: {order}\n\n"
    "Write a Korean audio guide for a blind learner exploring this tactile graphic.\n"
    "- intro: orient the learner — overall layout, how many elements, where to start.\n"
    "- one segment per exploration step, each tied to its element_id, describing what "
    "the finger should feel and what it means. Speak plainly and encouragingly.\n"
    "- outro: a one-sentence summary of the whole picture.\n"
    "Keep each segment short enough to listen to while feeling one element."
)


def run(spec_partial: dict) -> dict:
    if not config.LLM_ENABLED:
        return _mock(spec_partial)

    from .. import llm

    prompt = _PROMPT.format(
        title=spec_partial.get("title", ""),
        category=spec_partial.get("category", ""),
        design=json.dumps(spec_partial.get("tactile_design", {}), ensure_ascii=False),
        order=json.dumps(spec_partial.get("exploration_order", []), ensure_ascii=False),
    )
    return llm.call_structured(SYSTEM, prompt, AUDIO_SCHEMA)


def _mock(spec_partial: dict) -> dict:
    order = spec_partial.get("exploration_order", [])
    title = spec_partial.get("title", "촉각 그래픽")
    segments = [
        {
            "element_id": step["element_id"],
            "text": step["instruction"],
            "duration_hint_sec": 5.0,
        }
        for step in sorted(order, key=lambda s: s.get("order", 0))
    ]
    return {
        "language": "ko",
        "intro": (
            f"'{title}' 촉각 그래픽입니다. 모두 {len(segments)}개의 요소로 이루어져 있습니다. "
            "왼손으로 화면 가장자리를 잡고, 오른손 검지로 안내에 따라 차례대로 탐색해 보세요."
        ),
        "segments": segments,
        "outro": "전체를 종합하면, 지면 위에 집이 있고 그 우측 상단에 태양이 있는 장면입니다.",
    }
