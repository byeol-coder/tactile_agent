"""Agent-based orchestration pipeline.

Wires the seven modules together:
  1. Image Understanding  → analysis + element triage
  2. Tactile Design       → normalized scene graph + exploration order
  3. SVG Generation       → tactile.svg (deterministic)
  4. DotPad Matrix        → 60x40 + 96x64 binary matrices + RLE (deterministic)
  5. Audio Guide          → spoken narration synced to elements
  6. QA                   → deterministic accessibility scoring
The Human Review Editor (module 7) lives in the API layer and calls `rerender`.
"""
from __future__ import annotations

from .. import config
from ..models import TactileDesign, TactileSpec
from . import (
    audio_guide,
    base,
    dotpad_matrix,
    image_understanding,
    qa,
    svg_generation,
    tactile_design,
)


def _assemble_spec(
    understanding: dict, design_out: dict, audio: dict, qa_report: dict
) -> TactileSpec:
    td = design_out["tactile_design"]
    return TactileSpec(
        title=understanding["title"],
        category=understanding["category"],
        image_analysis=understanding["image_analysis"],
        essential_elements=understanding.get("essential_elements", []),
        removable_elements=understanding.get("removable_elements", []),
        tactile_design=td,
        tactile_patterns=design_out.get("tactile_patterns", []),
        exploration_order=design_out.get("exploration_order", []),
        split_required=design_out.get("split_required", False),
        split_reason=design_out.get("split_reason", ""),
        audio_guide=audio,
        qa=qa_report,
    )


def _render_all(design: TactileDesign, understanding: dict, design_out: dict) -> dict:
    svg = svg_generation.run(design)
    matrices = dotpad_matrix.run(design)
    spec_partial = {
        "title": understanding["title"],
        "category": understanding["category"],
        "tactile_design": design_out["tactile_design"],
        "exploration_order": design_out.get("exploration_order", []),
    }
    audio = audio_guide.run(spec_partial)
    qa_report = qa.run(design, matrices["dotpad_60x40"], audio, understanding)
    return {"svg": svg, "matrices": matrices, "audio": audio, "qa": qa_report}


def run_pipeline(b64: str, media_type: str, filename: str, width: int, height: int) -> dict:
    stages: list[dict] = []
    aspect = base.aspect_for(width, height)

    if config.PROVIDER == "cv":
        # Local computer-vision path: real pixel processing, no LLM, no key.
        from . import cv_vision

        understanding, design_out = cv_vision.extract(b64, media_type, filename, width, height)
        stages.append({"agent": "Image Understanding (Local CV)", "status": "done",
                       "summary": understanding["image_analysis"]["summary"]})
        stages.append({"agent": "Tactile Design (Local CV)", "status": "done",
                       "summary": f"{len(design_out['tactile_design']['primitives'])}개 윤곽 추출"})
    else:
        understanding = image_understanding.run(b64, media_type, filename)
        stages.append({"agent": "Image Understanding", "status": "done",
                       "summary": understanding["image_analysis"]["summary"]})
        design_out = tactile_design.run(understanding, 60, 40, aspect)
        stages.append({"agent": "Tactile Design", "status": "done",
                       "summary": f"{len(design_out['tactile_design']['primitives'])}개 촉각 요소 설계"
                                  + (" · 분할 필요" if design_out.get("split_required") else "")})

    design = TactileDesign(**design_out["tactile_design"])

    rendered = _render_all(design, understanding, design_out)
    stages.append({"agent": "SVG Generation", "status": "done", "summary": "tactile.svg 생성"})
    stages.append({"agent": "DotPad Matrix", "status": "done",
                   "summary": f"60x40 점 {rendered['matrices']['dotpad_60x40']['dot_count']}개"})
    stages.append({"agent": "Audio Guide", "status": "done",
                   "summary": f"{len(rendered['audio']['segments'])}개 음성 세그먼트"})
    stages.append({"agent": "QA", "status": "done",
                   "summary": f"종합 점수 {rendered['qa']['overall_score']}/100"})

    spec = _assemble_spec(understanding, design_out, rendered["audio"], rendered["qa"])
    return _bundle(spec, rendered, stages)


def rerender(spec_dict: dict) -> dict:
    """Re-run rendering + QA after a human edits the tactile design (module 7)."""
    design = TactileDesign(**spec_dict["tactile_design"])
    understanding = {
        "title": spec_dict["title"],
        "category": spec_dict["category"],
        "image_analysis": spec_dict["image_analysis"],
        "essential_elements": spec_dict.get("essential_elements", []),
        "removable_elements": spec_dict.get("removable_elements", []),
    }
    design_out = {
        "tactile_design": spec_dict["tactile_design"],
        "tactile_patterns": spec_dict.get("tactile_patterns", []),
        "exploration_order": spec_dict.get("exploration_order", []),
        "split_required": spec_dict.get("split_required", False),
        "split_reason": spec_dict.get("split_reason", ""),
    }
    matrices = dotpad_matrix.run(design)
    svg = svg_generation.run(design)
    # Keep the (possibly hand-edited) audio guide; re-score against new geometry.
    audio = spec_dict.get("audio_guide") or audio_guide.run({
        "title": spec_dict["title"], "category": spec_dict["category"],
        "tactile_design": spec_dict["tactile_design"],
        "exploration_order": design_out["exploration_order"],
    })
    qa_report = qa.run(design, matrices["dotpad_60x40"], audio, understanding)
    spec = _assemble_spec(understanding, design_out, audio, qa_report)
    return _bundle(spec, {"svg": svg, "matrices": matrices, "audio": audio, "qa": qa_report}, [])


def _bundle(spec: TactileSpec, rendered: dict, stages: list[dict]) -> dict:
    spec_dict = spec.model_dump()
    return {
        "stages": stages,
        "tactile_spec": spec_dict,
        "tactile_svg": rendered["svg"],
        "dotpad_60x40": rendered["matrices"]["dotpad_60x40"],
        "dotpad_96x64": rendered["matrices"]["dotpad_96x64"],
        "audio_guide": spec_dict["audio_guide"],
        "qa_report": spec_dict["qa"],
    }
