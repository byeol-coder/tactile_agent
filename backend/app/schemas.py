"""JSON Schemas for Claude structured outputs (output_config.format).

One schema per AI agent slice. These follow the structured-output constraints:
every object sets additionalProperties:false and lists all properties in
`required` (optional semantics are expressed with nullable/empty defaults
handled downstream). Numeric/length constraints are avoided per the API rules.
"""
from __future__ import annotations

_LEVEL = {"type": "string", "enum": ["raised", "recessed"]}
_LINE_STYLE = {"type": "string", "enum": ["solid", "dashed", "dotted"]}


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": required if required is not None else list(props.keys()),
        "additionalProperties": False,
    }


# 1. Image Understanding ----------------------------------------------------
UNDERSTANDING_SCHEMA = _obj(
    {
        "title": {"type": "string"},
        "category": {"type": "string"},
        "image_analysis": _obj(
            {
                "summary": {"type": "string"},
                "scene_type": {"type": "string"},
                "detected_objects": {"type": "array", "items": {"type": "string"}},
                "spatial_relations": {"type": "array", "items": {"type": "string"}},
                "text_in_image": {"type": "array", "items": {"type": "string"}},
                "complexity": {"type": "string", "enum": ["low", "medium", "high"]},
            }
        ),
        "essential_elements": {
            "type": "array",
            "items": _obj({"name": {"type": "string"}, "reason": {"type": "string"}}),
        },
        "removable_elements": {
            "type": "array",
            "items": _obj({"name": {"type": "string"}, "reason": {"type": "string"}}),
        },
    }
)

# 2. Tactile Design ---------------------------------------------------------
_PRIMITIVE = _obj(
    {
        "id": {"type": "string"},
        "kind": {
            "type": "string",
            "enum": ["polyline", "polygon", "circle", "rect", "point", "label"],
        },
        "level": _LEVEL,
        "line_style": _LINE_STYLE,
        "points": {
            "type": "array",
            "items": {"type": "array", "items": {"type": "number"}},
        },
        "center": {"type": "array", "items": {"type": "number"}},
        "radius": {"type": "number"},
        "label": {"type": "string"},
        "role": {"type": "string"},
    }
)

DESIGN_SCHEMA = _obj(
    {
        "tactile_design": _obj(
            {
                "canvas_aspect": {
                    "type": "string",
                    "enum": ["square", "landscape", "portrait"],
                },
                "primitives": {"type": "array", "items": _PRIMITIVE},
                "design_notes": {"type": "array", "items": {"type": "string"}},
            }
        ),
        "tactile_patterns": {
            "type": "array",
            "items": _obj(
                {
                    "element_id": {"type": "string"},
                    "pattern": {"type": "string"},
                    "level": _LEVEL,
                }
            ),
        },
        "exploration_order": {
            "type": "array",
            "items": _obj(
                {
                    "order": {"type": "integer"},
                    "element_id": {"type": "string"},
                    "instruction": {"type": "string"},
                }
            ),
        },
        "split_required": {"type": "boolean"},
        "split_reason": {"type": "string"},
    }
)

# 3. Audio Guide ------------------------------------------------------------
AUDIO_SCHEMA = _obj(
    {
        "language": {"type": "string"},
        "intro": {"type": "string"},
        "segments": {
            "type": "array",
            "items": _obj(
                {
                    "element_id": {"type": "string"},
                    "text": {"type": "string"},
                    "duration_hint_sec": {"type": "number"},
                }
            ),
        },
        "outro": {"type": "string"},
    }
)

# 4. QA ---------------------------------------------------------------------
QA_SCHEMA = _obj(
    {
        "overall_score": {"type": "integer"},
        "passed": {"type": "boolean"},
        "criteria": {
            "type": "array",
            "items": _obj(
                {
                    "name": {"type": "string"},
                    "passed": {"type": "boolean"},
                    "score": {"type": "integer"},
                    "comment": {"type": "string"},
                }
            ),
        },
        "recommendations": {"type": "array", "items": {"type": "string"}},
    }
)
