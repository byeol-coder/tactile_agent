"""Thin Anthropic wrapper used by every agent.

Provides one entry point, `call_structured`, that runs a Claude request with a
JSON-Schema-constrained response (structured outputs). When no API key is
configured the caller falls back to its own deterministic mock, so this module
is only imported on the real path.
"""
from __future__ import annotations

import json
from typing import Any

from . import config

_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic  # imported lazily so mock-only installs stay light

        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def image_block(b64_data: str, media_type: str) -> dict:
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": b64_data},
    }


def call_structured(
    system: str,
    user_content: list[dict] | str,
    schema: dict,
    *,
    max_tokens: int = 16000,
) -> dict[str, Any]:
    """Run Claude with an output schema and return the parsed JSON object."""
    if isinstance(user_content, str):
        user_content = [{"type": "text", "text": user_content}]

    resp = _get_client().messages.create(
        model=config.MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )

    # With structured outputs the response is a single text block of JSON.
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return json.loads(text)
