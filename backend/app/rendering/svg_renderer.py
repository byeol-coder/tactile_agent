"""Render a tactile scene graph to a clean, high-contrast SVG.

The SVG is the *visual proxy* of the tactile graphic for sighted reviewers and
embossers: bold black outlines for raised (양각) elements, and a distinct
patterned stroke for recessed (음각) elements. No photographic detail, color,
shadow, or fill is ever produced — only structure.
"""
from __future__ import annotations

from ..models import Primitive, TactileDesign

_SIZE = 600
_MARGIN = 40
_RAISED = "#000000"
_RECESSED = "#444444"


def _aspect_dims(aspect: str) -> tuple[int, int]:
    if aspect == "landscape":
        return _SIZE, int(_SIZE * 0.7)
    if aspect == "portrait":
        return int(_SIZE * 0.7), _SIZE
    return _SIZE, _SIZE


def _sx(x: float, w: int) -> float:
    return _MARGIN + x * (w - 2 * _MARGIN)


def _sy(y: float, h: int) -> float:
    return _MARGIN + y * (h - 2 * _MARGIN)


def _dash(style: str) -> str:
    if style == "dashed":
        return ' stroke-dasharray="12 8"'
    if style == "dotted":
        return ' stroke-dasharray="2 8" stroke-linecap="round"'
    return ""


def _stroke_w(level: str) -> int:
    return 5 if level == "raised" else 3


def _render_primitive(p: Primitive, w: int, h: int) -> str:
    color = _RAISED if p.level == "raised" else _RECESSED
    sw = _stroke_w(p.level)
    dash = _dash(p.line_style if p.level == "raised" else "dashed")
    common = f'stroke="{color}" stroke-width="{sw}" fill="none"{dash}'

    if p.kind in ("polyline", "polygon") and p.points:
        pts = " ".join(f"{_sx(x, w):.1f},{_sy(y, h):.1f}" for x, y in p.points)
        tag = "polygon" if p.kind == "polygon" else "polyline"
        return f'<{tag} points="{pts}" {common} stroke-linejoin="round" />'

    if p.kind == "circle" and p.center and p.radius is not None:
        cx, cy = _sx(p.center[0], w), _sy(p.center[1], h)
        r = p.radius * (w - 2 * _MARGIN)
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" {common} />'

    if p.kind == "rect" and len(p.points) >= 2:
        (x0, y0), (x1, y1) = p.points[0], p.points[1]
        x, y = _sx(min(x0, x1), w), _sy(min(y0, y1), h)
        rw = abs(_sx(x1, w) - _sx(x0, w))
        rh = abs(_sy(y1, h) - _sy(y0, h))
        return f'<rect x="{x:.1f}" y="{y:.1f}" width="{rw:.1f}" height="{rh:.1f}" {common} />'

    if p.kind == "point" and p.center:
        cx, cy = _sx(p.center[0], w), _sy(p.center[1], h)
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="6" fill="{color}" stroke="none" />'

    if p.kind == "label" and p.center:
        cx, cy = _sx(p.center[0], w), _sy(p.center[1], h)
        txt = (p.label or p.role or "").replace("&", "&amp;").replace("<", "&lt;")
        return (
            f'<g><circle cx="{cx:.1f}" cy="{cy:.1f}" r="4" fill="{color}" />'
            f'<text x="{cx + 8:.1f}" y="{cy + 4:.1f}" font-family="sans-serif" '
            f'font-size="16" fill="{color}">{txt}</text></g>'
        )
    return ""


def render_svg(design: TactileDesign) -> str:
    w, h = _aspect_dims(design.canvas_aspect)
    body = "\n  ".join(
        s for p in design.primitives if (s := _render_primitive(p, w, h))
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img">\n'
        f'  <rect x="0" y="0" width="{w}" height="{h}" fill="#ffffff" />\n'
        f'  {body}\n'
        f'</svg>\n'
    )
