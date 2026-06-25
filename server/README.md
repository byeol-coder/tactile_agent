# Dot Tactile Studio — 생성·변환 백엔드

`editor.html`의 "텍스트 → 이미지 생성"과 고품질 변환을 담당하는 레퍼런스 서버입니다.

- **생성**: Diffusers + FLUX.1-schnell (`POST /generate`)
- **변환/자동추천**: OpenCV + scikit-image — Otsu / Sauvola / Adaptive + 외곽선 1·2줄 후보를
  생성하고 촉각 품질 점수로 Best 선택 (`POST /convert`)
- 출력 HEX는 `editor.html`·`index.html`·Dot Fossil과 동일한 60×40 column-major 포맷

## 실행
```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```
FLUX.1-schnell은 첫 `/generate` 호출 때 로드됩니다(GPU 권장, 모델 접근 권한 필요).

## 프런트엔드 연결
에디터를 `?api=` 파라미터로 열면 생성이 활성화됩니다.
```
https://byeol-coder.github.io/tactile_agent/editor.html?api=http://localhost:8000
```
> GitHub Pages(HTTPS)에서 `http://localhost` 호출은 브라우저 혼합콘텐츠 정책에 막힐 수 있습니다.
> 로컬은 에디터도 localhost로 서빙하거나, 서버를 HTTPS로 노출(예: Cloudflare Tunnel)하세요.

## 엔드포인트
| 메서드 | 경로 | 입력 | 출력 |
|---|---|---|---|
| POST | `/generate` | `{prompt,width,height,steps}` | `{image_b64}` |
| POST | `/convert` | `{image_b64, polarity}` | `{hex, method, score, width, height}` |
| GET | `/health` | — | `{ok:true}` |

## 클라이언트와의 관계
`editor.html`은 동일한 Otsu/Sauvola/Adaptive·외곽선·촉각 점수 로직을 **JS로 재구현**해
서버 없이도 업로드 이미지의 "자동으로 맞추기"가 동작합니다. 서버를 연결하면 텍스트 생성이 추가되고,
원하면 `/convert`로 변환을 서버 측(OpenCV/skimage)에서 처리하도록 교체할 수 있습니다.
