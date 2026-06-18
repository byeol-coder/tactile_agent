# Tactile Graphic Agent · 촉각 그래픽 에이전트

> 시각 정보를 **촉각 학습 경험으로 번역**하는 독립형(standalone) 접근성 전문 에이전트.
> 이미지 변환기가 아니라, 시각장애인 학습자가 DotPad 양각·음각 촉각 출력과 음성 안내로
> 이해할 수 있도록 그래픽을 **재설계**합니다.

이 앱은 TIB 등 외부 플랫폼에 종속되지 않는 독립 에이전트입니다.

## 핵심 원칙

- 원본 이미지를 **복제하지 않음** — 촉각으로 이해 가능한 구조로 재설계
- 배경·색상·그림자·장식은 **제거**, 핵심 외곽선·구조·위치 관계·탐색 순서만 **유지**
- 복잡한 이미지는 여러 촉각 슬라이드로 **분할 권장**
- 모든 AI 출력은 **JSON Schema 기반 structured output**으로 관리
- 결과를 **SVG · DotPad Matrix JSON · Audio Guide JSON · QA Report JSON**으로 export

## 아키텍처

```
이미지 업로드
   │
   ▼
[1] Image Understanding Agent   (Claude vision · structured output)
   │   └ title / category / image_analysis / essential·removable 요소
   ▼
[2] Tactile Design Agent        (정규화된 촉각 Scene Graph 생성)
   │   └ primitives(0~1 좌표) / patterns / exploration_order / split
   ▼
[3] SVG Generation Agent ───┐   (Scene Graph로부터 결정론적 렌더)
[4] DotPad Matrix Agent ────┤   60×40 · 96×64 binary matrix + RLE
   │                        │
   ▼                        │
[5] Audio Guide Agent       │   탐색 순서에 동기화된 음성 스크립트
   ▼                        │
[6] QA Agent ◄──────────────┘   래스터/설계로부터 결정론적 접근성 채점
   │
   ▼
[7] Human Review Editor         촉각 요소 직접 수정 → 재렌더·재검수
   │
   ▼
Export: tactile_spec.json / tactile.svg / dotpad_60x40.json /
        dotpad_96x64.json / audio_guide.json / qa_report.json
```

**핵심 설계 결정:** AI는 픽셀/마크업이 아니라 **정규화된 촉각 Scene Graph**(단위 정사각형
[0,1] 좌표의 기하 프리미티브 + 촉각 의미)를 생성합니다. SVG와 DotPad 매트릭스는 이 Scene
Graph의 **결정론적 함수**이므로 두 출력이 항상 일치하고, LLM이 깨진 마크업을 만들 위험이 없습니다.

## 기술 스택

- **Frontend:** React 18 + Vite (8개 화면, 접근성 고려한 UI)
- **Backend:** FastAPI (Python)
- **AI:** Anthropic Claude (`claude-opus-4-8`), structured outputs (`output_config.format`)
- **Rendering:** SVG + DotPad Matrix Renderer (순수 Python, Bresenham 래스터)
- **Storage:** 로컬 파일 시스템 + SQLite
- **Deployment:** Docker / docker-compose

## 엔진 (프로바이더) 선택

`TGA_PROVIDER` 또는 키 존재 여부로 자동 선택됩니다 (우선순위: `TGA_PROVIDER` > Gemini키 > Claude키 > mock).

| 프로바이더 | 키 필요 | 비용 | 실제 이미지 분석 | 의미 이해(제목·라벨·음성) |
|---|---|---|---|---|
| `cv` (로컬 OpenCV) | ❌ | 무료·오프라인 | ✅ 외곽선/윤곽 추출 | 휴리스틱 |
| `gemini` (Gemini Flash) | Google AI Studio 무료키 | 무료 등급 | ✅ | ✅ LLM |
| `anthropic` (Claude) | 유료키 | 유료 | ✅ | ✅ LLM |
| `mock` | ❌ | 무료 | ❌ (고정 결과) | 고정 |

- **무료로 실제 변환:** `TGA_PROVIDER=cv` (키 불필요). 업로드 이미지의 윤곽을 실제로 추출합니다.
- **무료 LLM 비전:** `GEMINI_API_KEY=AIza...` (https://aistudio.google.com/apikey, 카드 불필요).
- 강제 목업: `TGA_FORCE_MOCK=1`.

> QA Agent는 의도적으로 **결정론적**입니다. 실제 래스터화된 매트릭스와 Scene Graph에서
> 요소 간격·점 밀도·선 연속성·미세 디테일 수·배경 제거·핵심 의미 유지·음성↔촉각 일치·
> 초급 이해 가능성을 직접 계산하므로 재현 가능하고 신뢰할 수 있습니다.

## 로컬 실행

### 1) Docker (권장)

```bash
cp .env.example .env        # 필요하면 ANTHROPIC_API_KEY 입력
docker compose up --build
# 프런트엔드: http://localhost:8080
# 백엔드 API 문서: http://localhost:8000/docs
```

### 2) 직접 실행

**백엔드**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...      # 생략 시 목업 모드
uvicorn app.main:app --reload     # http://localhost:8000
```

**프런트엔드**
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (/api 는 8000으로 프록시)
```

## 화면 (필수 8종)

1. 이미지 업로드 2. 이미지 분석 결과 3. 촉각 설계안(휴먼 리뷰 에디터)
4. SVG Preview 5. DotPad 60×40 Preview 6. 음성 안내 미리보기
7. QA 리포트 8. Export

## API 요약

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/jobs` | 이미지 업로드 → 파이프라인 실행 → 전체 번들 반환 |
| `GET`  | `/api/jobs` | 작업 목록 |
| `GET`  | `/api/jobs/{id}` | 단일 작업 번들 |
| `PUT`  | `/api/jobs/{id}/spec` | 휴먼 리뷰: 수정된 TactileSpec 저장 → 재렌더·재검수 |
| `GET`  | `/api/jobs/{id}/export/{name}` | 산출물 개별 다운로드 |
| `GET`  | `/api/jobs/{id}/export.zip` | 산출물 일괄 ZIP |

## 산출물 스키마 (TactileSpec 필드)

`title · category · target_user · target_device · image_analysis ·
essential_elements · removable_elements · tactile_design · tactile_patterns ·
exploration_order · split_required · audio_guide · qa`

## 라이선스

데모/연구용 스캐폴드.
