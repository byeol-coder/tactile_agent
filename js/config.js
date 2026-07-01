// ============================================================
// config.js — 환경 설정 (Supabase 프로젝트 정보만 바꾸면 됩니다)
// Supabase 대시보드 → Project Settings → API 에서 복사
// anon key는 공개되어도 되는 키입니다(RLS로 보호). service_role 키는 절대 넣지 마세요.
// ============================================================
export const SUPABASE_URL = "https://rahkzsmbkuuqamziionk.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_0KLrEESPFQetXXRDXAEgFg__Zs5YmmS";

// Storage 버킷 이름 (setup.sql에서 동일하게 생성)
export const BUCKET = "dtms";

// 게스트(비로그인) 모드 허용 여부 — true면 로그인 없이 로컬 저장만 사용
export const ALLOW_GUEST = true;

// 로그인/클라우드 UI 표시 여부
//  - false: 텍타일월드가 로그인을 담당 → 여기선 [로그인] 버튼 숨김 (게스트 모드)
//  - true : Dot Canvas 자체 로그인 카드 + Supabase 클라우드 저장 사용 (단독 배포 / 나중에 SSO)
export const ENABLE_AUTH_UI = false;

// Tactile Library의 로컬 My Library 사용 여부
//  - true : 로그인 없이 브라우저(localStorage)에 저장하는 My Library + Library 화면
//           실제 백엔드 통합 시 js/dot-cloud.js 의 dotCloud 내부만 교체
//  - false: 임시 클라우드 끔 (파일 내보내기만)
export const ENABLE_DOT_CLOUD_TEMP = true;
