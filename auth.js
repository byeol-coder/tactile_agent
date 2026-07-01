// ============================================================
// auth.js — 로그인/회원가입 (이메일·비밀번호 + Google OAuth)
// ============================================================
import { supabase } from "./supabaseClient.js";

// 현재 로그인 사용자 (없으면 null)
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

// 이메일·비밀번호 로그인
export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return true;
}

// 이메일·비밀번호 회원가입
// 반환 needsConfirm=true 면 "메일 인증 필요" 안내.
// (Supabase → Authentication → Providers → Email 에서 'Confirm email' 을 끄면 즉시 로그인)
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  const needsConfirm = !data?.session; // 세션이 없으면 이메일 인증 대기 상태
  return { needsConfirm };
}

// (선택) 이메일 매직링크 로그인 — 비밀번호 없이
export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) throw error;
  return true;
}

// Google 계정 로그인 (Supabase 대시보드에서 Google provider 활성화 필요)
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// 로그인 상태 변화 구독 (헤더 UI 갱신 등에 사용)
//   onAuthChange(user => { ...버튼/이름 갱신... })
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
