"""
Dot Tactile Studio — 생성·변환 백엔드 (레퍼런스 구현)

생성 엔진 : Diffusers + FLUX.1-schnell
변환 엔진 : OpenCV + scikit-image
자동 추천 : Otsu / Sauvola / Adaptive 후보 + 외곽선 1·2줄 후보 → 촉각 품질 점수로 Best 선택
출력 포맷 : 60×40 = 10행×30열 셀, 셀당 2×4핀 column-major (bit0-3 왼쪽열, bit4-7 오른쪽열)
            — tactile_agent / Dot Fossil 및 editor.html(JS)와 동일

실행:
  pip install -r requirements.txt
  uvicorn app:app --host 0.0.0.0 --port 8000
프런트엔드에서:
  https://<editor>/editor.html?api=http://localhost:8000
"""
import base64
import io

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from skimage.filters import threshold_sauvola

app = FastAPI(title="Dot Tactile Studio backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

DOT_COLS, DOT_ROWS = 60, 40          # 핀 격자
CELL_COLS, CELL_ROWS = 30, 10        # 셀 격자 (셀 = 2×4 핀)

# ── FLUX.1-schnell (지연 로딩: 첫 /generate 호출 때 한 번만) ───────────────
_pipe = None


def _load_pipe():
    global _pipe
    if _pipe is None:
        import torch
        from diffusers import FluxPipeline

        _pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16
        )
        _pipe.enable_model_cpu_offload()   # VRAM 절약. GPU 충분하면 .to("cuda")
    return _pipe


# ── 인코딩: 60×40 비트맵 → column-major HEX ──────────────────────────────
# (x in {0,1}, y in {0,1,2,3}) → bit = x*4 + y   (왼쪽열 0-3, 오른쪽열 4-7)
def grid_to_hex(binary: np.ndarray) -> str:
    out = []
    for cy in range(CELL_ROWS):
        for cx in range(CELL_COLS):
            b = 0
            for lx in range(2):
                for ly in range(4):
                    if binary[cy * 4 + ly, cx * 2 + lx]:
                        b |= 1 << (lx * 4 + ly)
            out.append(f"{b:02X}")
    return "".join(out)


# ── 형태학 + 촉각 품질 점수 (editor.html JS와 동일 로직) ──────────────────
def _boundary(b):
    k = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], np.uint8)
    n4 = cv2.filter2D(b, -1, k, borderType=cv2.BORDER_CONSTANT)
    return ((b == 1) & (n4 < 4)).astype(np.uint8)


def _dilate1(b):
    return cv2.dilate(b, np.ones((3, 3), np.uint8))


def outline_of(b, thickness):
    o = _boundary(b)
    return _dilate1(o) if thickness >= 2 else o


def tactile_score(b: np.ndarray) -> float:
    on = int(b.sum())
    if on < 8:
        return 0.0
    k8 = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], np.uint8)
    k4 = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], np.uint8)
    n8 = cv2.filter2D(b, -1, k8, borderType=cv2.BORDER_CONSTANT)
    n4 = cv2.filter2D(b, -1, k4, borderType=cv2.BORDER_CONSTANT)
    iso = int(((b == 1) & (n8 < 2)).sum())
    solid = int(((b == 1) & (n4 == 4)).sum())
    d = on / (DOT_COLS * DOT_ROWS)
    density = np.exp(-(((d - 0.18) / 0.14) ** 2))
    noise = 1 - min(1.0, (iso / on) * 4)
    blob = 1 - min(1.0, (solid / on) * 1.3)
    cc, _ = cv2.connectedComponents(b)
    cc -= 1  # 배경 제외
    conn = 1 / (1 + max(0, cc - 14) / 14)
    return 0.40 * density + 0.25 * noise + 0.20 * blob + 0.15 * conn


def _candidates(gray: np.ndarray, polarity: bool):
    g = gray
    # Otsu (전역) — 어두운 곳을 핀으로
    _, otsu = cv2.threshold(g, 0, 1, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    # Adaptive (지역 평균)
    adap = cv2.adaptiveThreshold(
        g, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 9, 8
    )
    # Sauvola (scikit-image)
    T = threshold_sauvola(g, window_size=15, k=0.2)
    sau = (g <= T).astype(np.uint8)

    cands = {
        "Otsu · 채움": otsu,
        "적응형 · 채움": adap,
        "Sauvola · 채움": sau,
        "Otsu · 외곽선 1줄": outline_of(otsu, 1),
        "Otsu · 외곽선 2줄": outline_of(otsu, 2),
        "Sauvola · 외곽선 1줄": outline_of(sau, 1),
    }
    if polarity:
        cands = {k: (1 - v).astype(np.uint8) for k, v in cands.items()}
    return cands


def auto_convert(pil: Image.Image, polarity: bool):
    gray = np.array(pil.convert("L").resize((DOT_COLS, DOT_ROWS)), np.uint8)
    best_name, best_b, best_s = None, None, -1.0
    for name, b in _candidates(gray, polarity).items():
        s = tactile_score(b)
        if s > best_s:
            best_name, best_b, best_s = name, b, s
    return grid_to_hex(best_b), best_name, round(float(best_s), 3)


# ── API ──────────────────────────────────────────────────────────────────
class GenReq(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    steps: int = 4


class ConvReq(BaseModel):
    image_b64: str
    polarity: bool = False


@app.post("/generate")
def generate(req: GenReq):
    pipe = _load_pipe()
    img = pipe(
        req.prompt,
        guidance_scale=0.0,                       # schnell
        num_inference_steps=req.steps,
        max_sequence_length=256,
        width=req.width,
        height=req.height,
    ).images[0]
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return {"image_b64": base64.b64encode(buf.getvalue()).decode()}


@app.post("/convert")
def convert(req: ConvReq):
    raw = base64.b64decode(req.image_b64.split(",")[-1])
    pil = Image.open(io.BytesIO(raw))
    hex_str, method, score = auto_convert(pil, req.polarity)
    return {"hex": hex_str, "method": method, "score": score,
            "width": DOT_COLS, "height": DOT_ROWS}


@app.get("/health")
def health():
    return {"ok": True}
