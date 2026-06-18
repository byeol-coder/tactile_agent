"""Local computer-vision extractor (no API key, fully offline).

Replaces the Image Understanding + Tactile Design agents when PROVIDER == "cv".
It actually processes the uploaded pixels: Canny edge detection → contour
extraction → polygon simplification → a normalized tactile scene graph. The
geometry is real (the actual image's structure); semantic labels and audio are
heuristic, since no language model is involved.
"""
from __future__ import annotations

import base64

import cv2
import numpy as np

_MAX_CONTOURS = 8          # tactile readability cap
_MIN_AREA_RATIO = 0.004    # ignore contours smaller than 0.4% of the image
_MARGIN = 0.05             # keep geometry within [0.05, 0.95]


def _decode_gray(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError("이미지를 디코딩할 수 없습니다.")
    return img


def _extract_contours(gray: np.ndarray):
    h, w = gray.shape
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blur, 50, 150)
    # Light close to bridge tiny gaps without merging separate shapes.
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    # RETR_LIST keeps inner shapes (e.g. individual bars) too, not just the
    # outermost silhouette.
    found, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    img_area = h * w
    scored = []
    for c in found:
        area = cv2.contourArea(c)
        if area < _MIN_AREA_RATIO * img_area:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.012 * peri, True)
        if len(approx) < 2:
            continue
        M = cv2.moments(c)
        cx = M["m10"] / M["m00"] if M["m00"] else float(approx[:, 0, 0].mean())
        cy = M["m01"] / M["m00"] if M["m00"] else float(approx[:, 0, 1].mean())
        scored.append((area, approx.reshape(-1, 2), cx, cy))

    scored.sort(key=lambda t: t[0], reverse=True)

    # Edge contours come as near-duplicate inner/outer pairs around each stroke;
    # keep only one per (centroid, area) cluster.
    deduped: list[tuple] = []
    for area, pts, cx, cy in scored:
        dup = False
        for a2, _p2, cx2, cy2 in deduped:
            close = abs(cx - cx2) < 0.02 * w and abs(cy - cy2) < 0.02 * h
            similar = a2 and abs(area - a2) / a2 < 0.25
            if close and similar:
                dup = True
                break
        if not dup:
            deduped.append((area, pts, cx, cy))
    return [(a, p) for a, p, _cx, _cy in deduped], (w, h)


def _normalizer(all_pts: np.ndarray):
    """Fit all points into the [0.05,0.95] box, preserving aspect ratio."""
    minx, miny = all_pts.min(axis=0)
    maxx, maxy = all_pts.max(axis=0)
    span = max(maxx - minx, maxy - miny, 1)
    dw, dh = (maxx - minx) / span, (maxy - miny) / span
    padx, pady = (1 - dw) / 2, (1 - dh) / 2

    def nrm(x, y):
        fx = padx + (x - minx) / span
        fy = pady + (y - miny) / span
        return [round(_MARGIN + (1 - 2 * _MARGIN) * fx, 3),
                round(_MARGIN + (1 - 2 * _MARGIN) * fy, 3)]

    return nrm


def _position_label(cx: float, cy: float) -> str:
    v = "상단" if cy < 0.4 else "하단" if cy > 0.6 else "중앙"
    h = "좌측" if cx < 0.4 else "우측" if cx > 0.6 else "중앙"
    return f"{v} {h}".replace("중앙 중앙", "중앙")


def extract(b64: str, media_type: str, filename: str, width: int, height: int):
    gray = _decode_gray(b64)
    scored, (w, h) = _extract_contours(gray)
    total_found = len(scored)
    kept = scored[:_MAX_CONTOURS]

    if not kept:
        # Blank / no salient edges — emit a framing rectangle so output is valid.
        prims = [{
            "id": "e1", "kind": "rect", "level": "raised", "line_style": "solid",
            "points": [[0.1, 0.1], [0.9, 0.9]], "center": None, "radius": None,
            "label": "외곽 틀", "role": "frame",
        }]
        kept_meta = [("외곽 틀", 0.5, 0.5)]
    else:
        all_pts = np.vstack([pts for _, pts in kept]).astype(float)
        nrm = _normalizer(all_pts)
        prims, kept_meta = [], []
        for i, (area, pts) in enumerate(kept):
            npts = [nrm(float(x), float(y)) for x, y in pts]
            cx = sum(p[0] for p in npts) / len(npts)
            cy = sum(p[1] for p in npts) / len(npts)
            pos = _position_label(cx, cy)
            label = f"윤곽 {i + 1} ({pos})"
            prims.append({
                "id": f"e{i + 1}",
                "kind": "polygon",
                "level": "raised" if i < 3 else "recessed",
                "line_style": "solid",
                "points": npts,
                "center": None,
                "radius": None,
                "label": label,
                "role": f"contour_{i + 1}",
            })
            kept_meta.append((label, cx, cy))

    n = len(prims)
    complexity = "low" if total_found <= 4 else "medium" if total_found <= 10 else "high"
    stem = filename.rsplit(".", 1)[0]

    understanding = {
        "title": f"{stem} — 로컬 CV 윤곽 추출",
        "category": "윤곽 추출 (로컬 컴퓨터비전)",
        "image_analysis": {
            "summary": (
                f"로컬 컴퓨터비전(Canny 엣지 + 컨투어)으로 실제 이미지({w}×{h})를 분석해 "
                f"주요 윤곽 {total_found}개를 찾았고, 촉각 가독성을 위해 상위 {n}개를 유지했습니다. "
                "색·배경·미세 노이즈는 제거되었습니다."
            ),
            "scene_type": "edge/contour extraction",
            "detected_objects": [m[0] for m in kept_meta],
            "spatial_relations": [
                f"{m[0]}은(는) 화면 {_position_label(m[1], m[2])}에 위치" for m in kept_meta
            ],
            "text_in_image": [],
            "complexity": complexity,
        },
        "essential_elements": [
            {"name": m[0], "reason": "이미지의 주요 윤곽 구조"} for m in kept_meta
        ],
        "removable_elements": [
            {"name": "배경/색상", "reason": "촉각으로 표현 불가하며 의미 없음"},
            {"name": "미세 에지 노이즈", "reason": "점 밀도를 높여 가독성 저하"},
            {"name": f"작은 윤곽 {max(total_found - n, 0)}개", "reason": "촉각 혼잡을 피하기 위해 제외"},
        ],
    }

    design_out = {
        "tactile_design": {
            "canvas_aspect": "landscape" if w > h * 1.2 else "portrait" if h > w * 1.2 else "square",
            "primitives": prims,
            "design_notes": [
                "로컬 컴퓨터비전으로 실제 업로드 이미지에서 외곽선을 직접 추출했습니다.",
                "면적이 큰 상위 윤곽은 양각, 보조 윤곽은 음각으로 구분했습니다.",
            ],
        },
        "tactile_patterns": [
            {"element_id": p["id"], "pattern": "양각 실선 윤곽" if p["level"] == "raised" else "음각 실선 윤곽",
             "level": p["level"]}
            for p in prims
        ],
        "exploration_order": [
            {"order": i + 1, "element_id": p["id"],
             "instruction": f"{p['label']}을(를) 손끝으로 따라 윤곽을 확인하세요."}
            for i, p in enumerate(prims)
        ],
        "split_required": total_found > _MAX_CONTOURS,
        "split_reason": (
            f"윤곽이 {total_found}개로 많아 상위 {n}개만 표시했습니다. "
            "전체를 전달하려면 여러 촉각 슬라이드로 분할을 권장합니다."
        ) if total_found > _MAX_CONTOURS else "",
    }
    return understanding, design_out
