"""Agent 4 — DotPad Matrix.

Deterministic rasterization of the tactile scene graph onto DotPad pin grids.
Produces both the standard 60x40 panel and a higher-resolution 96x64 panel,
each with a full binary matrix and an RLE encoding.
"""
from __future__ import annotations

from .. import config
from ..models import TactileDesign
from ..rendering.dotpad_renderer import render_matrix


def run(design: TactileDesign) -> dict[str, dict]:
    return {
        "dotpad_60x40": render_matrix(design, *config.DOTPAD_60x40),
        "dotpad_96x64": render_matrix(design, *config.DOTPAD_96x64),
    }
