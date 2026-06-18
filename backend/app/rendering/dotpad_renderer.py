"""Rasterize a tactile scene graph onto a DotPad binary pin matrix.

A DotPad cell is either a raised pin (1) or flat (0). We rasterize the same
normalized scene graph the SVG uses, so the two previews always agree. Output
includes the full binary matrix *and* a run-length encoding (RLE) for compact
transmission to the device.
"""
from __future__ import annotations

from ..models import Primitive, TactileDesign


def _blank(w: int, h: int) -> list[list[int]]:
    return [[0] * w for _ in range(h)]


def _plot(grid, x: int, y: int, w: int, h: int) -> None:
    if 0 <= x < w and 0 <= y < h:
        grid[y][x] = 1


def _line(grid, x0, y0, x1, y1, w, h) -> None:
    """Bresenham line raster."""
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    while True:
        _plot(grid, x0, y0, w, h)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x0 += sx
        if e2 < dx:
            err += dx
            y0 += sy


def _circle(grid, cx, cy, r, w, h) -> None:
    """Midpoint circle outline."""
    if r <= 0:
        _plot(grid, cx, cy, w, h)
        return
    x, y, d = r, 0, 1 - r
    while x >= y:
        for px, py in (
            (cx + x, cy + y), (cx - x, cy + y), (cx + x, cy - y), (cx - x, cy - y),
            (cx + y, cy + x), (cx - y, cy + x), (cx + y, cy - x), (cx - y, cy - x),
        ):
            _plot(grid, px, py, w, h)
        y += 1
        if d < 0:
            d += 2 * y + 1
        else:
            x -= 1
            d += 2 * (y - x) + 1


def _to_cell(x: float, y: float, w: int, h: int) -> tuple[int, int]:
    return round(max(0.0, min(1.0, x)) * (w - 1)), round(max(0.0, min(1.0, y)) * (h - 1))


def _draw(grid, p: Primitive, w: int, h: int) -> None:
    if p.kind in ("polyline", "polygon") and len(p.points) >= 2:
        cells = [_to_cell(x, y, w, h) for x, y in p.points]
        seq = cells + [cells[0]] if p.kind == "polygon" else cells
        for (x0, y0), (x1, y1) in zip(seq, seq[1:]):
            _line(grid, x0, y0, x1, y1, w, h)
    elif p.kind == "circle" and p.center and p.radius is not None:
        cx, cy = _to_cell(p.center[0], p.center[1], w, h)
        _circle(grid, cx, cy, round(p.radius * (w - 1)), w, h)
    elif p.kind == "rect" and len(p.points) >= 2:
        (x0, y0), (x1, y1) = p.points[0], p.points[1]
        c0, c1 = _to_cell(x0, y0, w, h), _to_cell(x1, y1, w, h)
        corners = [(c0[0], c0[1]), (c1[0], c0[1]), (c1[0], c1[1]), (c0[0], c1[1])]
        for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
            _line(grid, ax, ay, bx, by, w, h)
    elif p.kind in ("point", "label") and p.center:
        cx, cy = _to_cell(p.center[0], p.center[1], w, h)
        _plot(grid, cx, cy, w, h)


def _rle(flat: list[int]) -> list[list[int]]:
    """Run-length encode a flat bit list into [value, count] pairs."""
    runs: list[list[int]] = []
    for bit in flat:
        if runs and runs[-1][0] == bit:
            runs[-1][1] += 1
        else:
            runs.append([bit, 1])
    return runs


def render_matrix(design: TactileDesign, width: int, height: int) -> dict:
    grid = _blank(width, height)
    for p in design.primitives:
        _draw(grid, p, width, height)

    flat = [c for row in grid for c in row]
    dot_count = sum(flat)
    return {
        "device": f"DotPad {width}x{height}",
        "width": width,
        "height": height,
        "cell_count": width * height,
        "dot_count": dot_count,
        "density": round(dot_count / (width * height), 4),
        "matrix": ["".join(str(c) for c in row) for row in grid],
        "rle": _rle(flat),
    }
