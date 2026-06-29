# Dot Canvas AI — 촉각그래픽 제작 스튜디오

이미지를 DotPad 촉각그래픽(HEX)으로 변환·편집하고, Web Bluetooth로 기기에 직접 보낼 수 있는 단일 파일 웹 도구입니다. 60×40핀과 96×64핀 해상도를 지원합니다.

## 사용 방법

`index.html`을 브라우저에서 열거나 정적 웹 서버로 서빙합니다.
Web Bluetooth가 필요하므로 **Chrome / Edge + HTTPS 또는 localhost** 환경에서 사용하세요.
기기가 없어도 화면 미리보기로 변환·편집·내보내기를 모두 사용할 수 있습니다.

## 임베드 배포

다른 서비스 안에 iframe으로 넣을 때는 `?embed=1` 또는 `embed.html`을 사용합니다.

```html
<iframe
  src="https://byeol-coder.github.io/tactile_agent/?embed=1"
  title="Dot Canvas AI tactile graphic editor"
  width="100%"
  height="760"
  style="border:0; border-radius:16px; overflow:hidden;"
  allow="clipboard-read; clipboard-write"
></iframe>
```

권장 iframe 높이는 720~800px입니다. 모바일 컨테이너에서는 `height: 100vh` 또는 최소 680px 이상을 권장합니다.
자세한 query parameter와 postMessage 연동은 `EMBED_GUIDE.md`를 확인하세요.

## 기능

- 이미지 드래그 앤 드롭(PNG·JPG·WEBP·SVG) → DotPad HEX 자동 변환
- 이미지 유형 자동 판별(투명 PNG · 선화/아이콘 · 저대비 · 사진)에 따른 임계값·반전·외곽선 자동 추천
- 점 농도(임계값) 슬라이더, 외곽선 모드(없음/1줄/2줄)
- 명령 입력: **헤더 프롬프트** 또는 명령 칩으로 `단순하게 · 외곽선 · 점 정리 · 반전 · 자동`
- 펜·지우개 편집(1–3핀, 고급 4·5핀), Bresenham 보간, 페이지별 실행 취소/다시 실행
- DTM·DTMS 불러오기/저장: 원본 핀 데이터를 손상 없이 보존, 다중 페이지 지원
- BLE 실시간 반영(100ms 디바운스 + 동일 HEX 중복 방지 + last-wins), 전체 핀 올림/내림/반전
- 내보내기: DTM·DTMS · PNG · HEX 복사 · JSON
- 한국어 / English 전환

## 파일 구조

```
index.html              # 메인 앱 (단일 파일, DotPad Web SDK 인라인 포함)
embed.html              # iframe 삽입 전용 진입점 (?embed=1 자동 적용)
manifest.json           # 웹앱/임베드 메타데이터
EMBED_GUIDE.md          # iframe 및 postMessage 연동 가이드
editor.html             # index.html로 가는 리다이렉트
DotPadSDK-3_0_0.js      # 참고용 원본 SDK (앱에는 이미 인라인되어 있어 실행에는 불필요)
assets/                 # 예시/레거시 이미지 (앱 실행에 필수 아님)
server/                 # (선택) 텍스트→이미지 생성·고품질 변환 레퍼런스 백엔드
```

> **참고:** `server/`(FLUX 생성 + OpenCV 변환)는 레퍼런스 구현이며, 현재 프런트엔드(`index.html`)에는 기본적으로 연결되어 있지 않습니다. 생성 기능을 쓰려면 `index.html`에 `?api=` 파라미터 읽기와 `/generate` 호출 배선을 추가해야 합니다. 자세한 내용은 `server/README.md` 참고.

## 인코딩 규격

60×40핀 = 10행×30열 셀, 셀당 2×4핀 column-major
(bit0~3 왼쪽 열, bit4~7 오른쪽 열) — Dot Fossil / DTM·DTMS와 동일한 HEX 포맷.
96×64핀은 16행×48열(1536자 HEX)로 동일 매핑을 사용합니다.
