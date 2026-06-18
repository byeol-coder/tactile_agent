"""Pydantic models describing the TactileSpec and its building blocks.

The pipeline never reproduces the source image. Instead the AI agents emit a
normalized *tactile scene graph* — a small set of geometric primitives with
coordinates in the unit square [0,1] plus tactile semantics (raised vs.
recessed, line style, label). Both the SVG renderer and the DotPad matrix
rasterizer are deterministic functions of this scene graph, which keeps the
two outputs perfectly consistent and keeps the LLM out of pixel/markup space.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Tactile scene primitives
# --------------------------------------------------------------------------
TactileLevel = Literal["raised", "recessed"]          # 양각 / 음각
LineStyle = Literal["solid", "dashed", "dotted"]
PrimitiveKind = Literal[
    "polyline",   # open path — outlines, routes
    "polygon",    # closed outline of a key object
    "circle",
    "rect",
    "point",      # a single landmark dot
    "label",      # text anchor (rendered as braille/print caption guide)
]


class Primitive(BaseModel):
    """A single tactile element in normalized [0,1] coordinates."""

    id: str = Field(..., description="Stable id, e.g. 'e1', referenced by audio/exploration order")
    kind: PrimitiveKind
    level: TactileLevel = "raised"
    line_style: LineStyle = "solid"
    # Geometry — usage depends on `kind`:
    #   polyline/polygon: points = [[x,y], ...]
    #   circle:           center=[x,y], radius=r
    #   rect:             points = [[x0,y0],[x1,y1]] (opposite corners)
    #   point/label:      center=[x,y]
    points: List[List[float]] = Field(default_factory=list)
    center: Optional[List[float]] = None
    radius: Optional[float] = None
    label: Optional[str] = Field(None, description="Short caption / braille label")
    role: Optional[str] = Field(None, description="Semantic role, e.g. 'sun', 'horizon', 'door'")


class ImageAnalysis(BaseModel):
    summary: str
    scene_type: str = Field(..., description="e.g. diagram, photo, map, chart, illustration")
    detected_objects: List[str] = Field(default_factory=list)
    spatial_relations: List[str] = Field(default_factory=list)
    text_in_image: List[str] = Field(default_factory=list)
    complexity: Literal["low", "medium", "high"] = "medium"


class TactileElement(BaseModel):
    name: str
    reason: str = Field(..., description="Why it is essential / why it can be removed")


class TactileDesign(BaseModel):
    canvas_aspect: Literal["square", "landscape", "portrait"] = "square"
    primitives: List[Primitive] = Field(default_factory=list)
    design_notes: List[str] = Field(default_factory=list)


class TactilePattern(BaseModel):
    element_id: str
    pattern: str = Field(..., description="e.g. 'solid outline', 'dotted fill', 'single point'")
    level: TactileLevel = "raised"


class ExplorationStep(BaseModel):
    order: int
    element_id: str
    instruction: str = Field(..., description="Where to move the finger and what to feel")


class AudioSegment(BaseModel):
    element_id: Optional[str] = None
    text: str
    duration_hint_sec: float = 4.0


class AudioGuide(BaseModel):
    language: str = "ko"
    intro: str
    segments: List[AudioSegment] = Field(default_factory=list)
    outro: str = ""


class QACriterion(BaseModel):
    name: str
    passed: bool
    score: int = Field(..., ge=0, le=100)
    comment: str


class QAReport(BaseModel):
    overall_score: int = Field(..., ge=0, le=100)
    passed: bool
    criteria: List[QACriterion] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class TactileSpec(BaseModel):
    """The complete specification produced by the agent pipeline."""

    title: str
    category: str
    target_user: str = "초급 시각장애인 학습자"
    target_device: str = "DotPad 60x40 (refreshable tactile display)"
    image_analysis: ImageAnalysis
    essential_elements: List[TactileElement] = Field(default_factory=list)
    removable_elements: List[TactileElement] = Field(default_factory=list)
    tactile_design: TactileDesign
    tactile_patterns: List[TactilePattern] = Field(default_factory=list)
    exploration_order: List[ExplorationStep] = Field(default_factory=list)
    split_required: bool = False
    split_reason: str = ""
    audio_guide: AudioGuide
    qa: QAReport
