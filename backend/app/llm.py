"""Provider-agnostic structured-output wrapper used by every agent.

Exposes one entry point, `call_structured(system, content, schema)`, that routes
to the configured provider:
  - "gemini"    → Google Gemini (free tier), REST + responseMimeType JSON
  - "anthropic" → Claude, structured outputs (output_config.format)
The internal content representation is Anthropic-style block dicts
(`{"type": "text"|"image", ...}`); the Gemini adapter translates them. When no
key is configured the agents use their own deterministic mock and never reach
this module.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from . import config

_anthropic_client = None


def image_block(b64_data: str, media_type: str) -> dict:
    """Neutral image block (Anthropic shape); adapters convert as needed."""
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
    if isinstance(user_content, str):
        user_content = [{"type": "text", "text": user_content}]
    if config.PROVIDER == "gemini":
        return _gemini(system, user_content, schema, max_tokens)
    return _anthropic(system, user_content, schema, max_tokens)


# --------------------------------------------------------------------------
# Gemini (free tier)
# --------------------------------------------------------------------------
def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


def _gemini(system: str, content: list[dict], schema: dict, max_tokens: int) -> dict:
    parts: list[dict] = []
    for b in content:
        if b.get("type") == "image":
            src = b["source"]
            parts.append({"inline_data": {"mime_type": src["media_type"], "data": src["data"]}})
        else:
            parts.append({"text": b.get("text", "")})
    parts.append({
        "text": "\n반드시 아래 JSON 스키마에 정확히 부합하는 JSON 객체 하나만 출력하세요. "
        "설명·주석·마크다운 코드펜스를 절대 포함하지 마세요.\n"
        + json.dumps(schema, ensure_ascii=False)
    })

    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": min(max_tokens, 8192),
            "temperature": 0.4,
        },
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{config.GEMINI_MODEL}:generateContent?key={config.GEMINI_API_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"Gemini API {e.code}: {detail}") from e

    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Gemini 응답에 candidates 없음: {json.dumps(data)[:400]}")
    text = "".join(p.get("text", "") for p in candidates[0]["content"]["parts"])
    return _extract_json(text)


# --------------------------------------------------------------------------
# Anthropic Claude
# --------------------------------------------------------------------------
def _get_anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic

        _anthropic_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _anthropic_client


def _anthropic(system: str, content: list[dict], schema: dict, max_tokens: int) -> dict:
    resp = _get_anthropic().messages.create(
        model=config.MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return json.loads(text)
