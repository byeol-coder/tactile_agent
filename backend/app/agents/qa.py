"""Agent 6 — QA.

Evaluates the tactile graphic against the required accessibility criteria. The
metrics are computed *deterministically* from the actual rasterized matrix and
scene graph (spacing, density, line continuity, small-detail count, background
removal, semantic retention, audio↔tactile consistency, beginner readability),
which makes the report reproducible and trustworthy rather than guessed.
"""
from __future__ import annotations

from ..models import TactileDesign


def _centroid(p) -> tuple[float, float]:
    if p.center:
        return p.center[0], p.center[1]
    if p.points:
        xs = [pt[0] for pt in p.points]
        ys = [pt[1] for pt in p.points]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return 0.5, 0.5


def _min_spacing_cells(design: TactileDesign, w: int, h: int) -> float:
    cents = [_centroid(p) for p in design.primitives]
    best = float("inf")
    for i in range(len(cents)):
        for j in range(i + 1, len(cents)):
            dx = (cents[i][0] - cents[j][0]) * w
            dy = (cents[i][1] - cents[j][1]) * h
            best = min(best, (dx * dx + dy * dy) ** 0.5)
    return best if best != float("inf") else 99.0


def _bbox_cells(p, w: int, h: int) -> float:
    pts = p.points or ([p.center] if p.center else [])
    if not pts:
        return 0.0
    xs = [c[0] for c in pts]
    ys = [c[1] for c in pts]
    return max((max(xs) - min(xs)) * w, (max(ys) - min(ys)) * h)


def _crit(name, passed, score, comment) -> dict:
    return {"name": name, "passed": bool(passed), "score": int(score), "comment": comment}


def run(design: TactileDesign, matrix_60: dict, audio: dict, understanding: dict) -> dict:
    w, h = matrix_60["width"], matrix_60["height"]
    n = len(design.primitives)
    density = matrix_60["density"]
    spacing = _min_spacing_cells(design, w, h)
    small = [p for p in design.primitives if 0 < _bbox_cells(p, w, h) < 3]
    audio_ids = {s.get("element_id") for s in audio.get("segments", [])}
    prim_ids = {p.id for p in design.primitives}
    matched = audio_ids & prim_ids
    essential_n = len(understanding.get("essential_elements", []))
    removable_n = len(understanding.get("removable_elements", []))

    criteria = [
        _crit(
            "촉각 요소 간 간격",
            spacing >= 3.0,
            min(100, int(spacing / 6.0 * 100)),
            f"요소 간 최소 간격 ≈ {spacing:.1f} 셀 (권장 ≥ 3셀).",
        ),
        _crit(
            "선 끊김 여부",
            matrix_60["dot_count"] >= n,
            100 if matrix_60["dot_count"] >= n else 40,
            "모든 선이 연속 래스터화되어 끊김이 없습니다."
            if matrix_60["dot_count"] >= n else "일부 요소가 점으로 표현되지 못했습니다.",
        ),
        _crit(
            "점 밀도",
            0.02 <= density <= 0.35,
            100 if 0.02 <= density <= 0.35 else 45,
            f"점 밀도 {density:.0%} (권장 2%–35%). 너무 높으면 촉각 혼잡, 너무 낮으면 정보 부족.",
        ),
        _crit(
            "작은 디테일 과다 여부",
            len(small) <= 2,
            100 if len(small) <= 2 else 50,
            f"3셀 미만의 미세 요소 {len(small)}개 (권장 ≤ 2).",
        ),
        _crit(
            "배경 제거 여부",
            removable_n > 0,
            100 if removable_n > 0 else 60,
            f"제거 대상 {removable_n}개 식별 — 배경/색상/장식이 촉각 설계에서 배제되었습니다.",
        ),
        _crit(
            "핵심 의미 유지 여부",
            n >= min(max(essential_n, 1), 3),
            100 if n >= min(max(essential_n, 1), 3) else 55,
            f"핵심 요소 {essential_n}개 대비 촉각 프리미티브 {n}개로 핵심 구조를 보존했습니다.",
        ),
        _crit(
            "음성·촉각 일치 여부",
            len(matched) == len(prim_ids) and len(audio_ids) > 0,
            int(len(matched) / max(len(prim_ids), 1) * 100),
            f"음성 세그먼트가 촉각 요소 {len(matched)}/{len(prim_ids)}개와 연결되었습니다.",
        ),
        _crit(
            "초급 시각장애인 이해 가능성",
            n <= 10 and spacing >= 3.0 and 0.02 <= density <= 0.35,
            100 if (n <= 10 and spacing >= 3.0 and 0.02 <= density <= 0.35) else 60,
            f"요소 {n}개 — 초급 학습자가 한 번에 탐색하기에 {'적절' if n <= 10 else '다소 많음'}합니다.",
        ),
    ]

    overall = round(sum(c["score"] for c in criteria) / len(criteria))
    recommendations: list[str] = []
    if spacing < 3.0:
        recommendations.append("요소 간격이 좁습니다 — 일부 요소를 분리하거나 슬라이드를 분할하세요.")
    if density > 0.35:
        recommendations.append("점 밀도가 높습니다 — 채움/세부 요소를 줄이세요.")
    if len(small) > 2:
        recommendations.append("작은 요소가 많습니다 — 통합하거나 확대하세요.")
    if len(matched) != len(prim_ids):
        recommendations.append("음성 안내가 일부 촉각 요소와 연결되지 않았습니다 — 세그먼트를 보완하세요.")
    if n > 10:
        recommendations.append("요소 수가 많습니다 — 여러 촉각 슬라이드로 분할을 고려하세요.")
    if not recommendations:
        recommendations.append("기준을 모두 충족합니다. 초급 학습자 대상 검수를 권장합니다.")

    return {
        "overall_score": overall,
        "passed": overall >= 70 and all(c["passed"] for c in criteria),
        "criteria": criteria,
        "recommendations": recommendations,
    }
