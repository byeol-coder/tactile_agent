# Dot Fossil Studio — 촉각그래픽 변환기

이미지를 DotPad 60×40 촉각그래픽 HEX로 변환하고 바로 전송할 수 있는 단독 웹 도구입니다.

## 사용 방법

`index.html`을 브라우저에서 열거나 정적 웹 서버로 서빙합니다.  
Web Bluetooth가 필요하므로 **Chrome / Edge + HTTPS 또는 localhost** 환경에서 사용하세요.

## 기능

- 이미지 드래그 앤 드롭 업로드 → DotPad HEX 즉시 변환
- 카테고리별 프리셋: 🦕 공룡 / 🦴 화석 / 🔧 도구 / 🧑‍🔬 탐험가 / ⭐ 내 프리셋
- 커스텀 프리셋 저장 (localStorage)
- BLE로 DotPad에 직접 전송
- 자동 전송 / 수동 전송 / 전체 핀 올리기·내리기
- 점 보기 / DotPad 느낌 두 가지 미리보기 모드
- TypeScript 코드 복사 (`id: 'HEX'` 형식)

## 파일 구조

```
index.html              # 메인 앱 (단일 파일)
DotPadSDK-3_0_0.js     # Dot Inc. DotPad Web SDK
assets/
  dinosaurs/            # 공룡 프리셋 이미지 (10종)
  icons/fossils/        # 화석 아이콘 (14종)
  icons/tools/          # 발굴 도구 아이콘 (10종)
  characters/           # 탐험가 캐릭터 (6종)
```

## 인코딩 규격

60×40핀 = 10행×30열 셀, 셀당 2×4핀 column-major  
(bit0~3 왼쪽 열, bit4~7 오른쪽 열) — Dot Fossil 게임과 동일한 HEX 포맷
