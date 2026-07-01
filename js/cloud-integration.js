// ============================================================
// cloud-integration.js
// app.js를 수정하지 않고 기존 UI(저장/DTMS 내보내기/.dtms 열기 파일입력)에
// Supabase 로그인·클라우드 저장/열기를 연결합니다.
//
// 동작 요약
//  - 헤더에 [로그인] [☁ 클라우드] [설치] 버튼을 동적으로 추가
//  - DTMS 다운로드(<a download="*.dtms">)를 가로채 로그인 상태면 클라우드에도 업로드
//  - 클라우드 파일 선택 시 기존 #tactileFileInput 에 주입 → app.js의 열기 로직 재사용
// ============================================================
import { getUser, signInWithPassword, signUp, signInWithGoogle, signOut, onAuthChange } from "./auth.js";
import { saveDtms, listDtms, loadDtms } from "./storage.js";
import { ENABLE_AUTH_UI, ENABLE_DOT_CLOUD_TEMP } from "./config.js";
import { dotCloud, openDotCloudUI, grabThumb, grabMeta } from "./dot-cloud.js";

// ---- 공통: 토스트(앱의 #toast 재사용, 없으면 alert) ----
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.classList.add("show", "ok");
  setTimeout(() => t.classList.remove("show", "ok"), 1900);
}

// ---- 헤더에 버튼 주입 ----
function injectUI() {
  const right = document.querySelector(".hd-right");
  if (!right) return null;
  const saveBtn = right.querySelector("#saveBtn");

  // 설치(PWA) 버튼은 항상 표시
  const installBtn = document.createElement("button");
  installBtn.className = "hd-btn ghost";
  installBtn.id = "install-btn"; // pwa-register.js가 제어
  installBtn.hidden = true;
  installBtn.textContent = "설치";
  right.insertBefore(installBtn, saveBtn);

  // 임시 닷 클라우드 드라이브 버튼 (로그인 불필요)
  let driveBtn = null;
  if (ENABLE_DOT_CLOUD_TEMP) {
    driveBtn = document.createElement("button");
    driveBtn.className = "hd-btn ghost";
    driveBtn.id = "dotCloudBtn";
    driveBtn.title = "닷 클라우드 열기";
    driveBtn.innerHTML = "<span>☁ 닷 클라우드</span>";
    driveBtn.addEventListener("click", () =>
      openDotCloudUI({ onOpen: (text, name) => loadIntoApp(text, name) })
    );
    right.insertBefore(driveBtn, saveBtn);
  }

  // 게스트 모드(ENABLE_AUTH_UI=false)면 로그인/Supabase 클라우드 버튼은 만들지 않음
  if (!ENABLE_AUTH_UI) return { cloudBtn: null, authBtn: null };

  const cloudBtn = document.createElement("button");
  cloudBtn.className = "hd-btn ghost";
  cloudBtn.id = "cloudOpenBtn";
  cloudBtn.title = "클라우드에서 열기";
  cloudBtn.innerHTML = "<span>☁ 클라우드</span>";

  const authBtn = document.createElement("button");
  authBtn.className = "hd-btn ghost";
  authBtn.id = "authBtn";
  authBtn.textContent = "로그인";

  right.insertBefore(cloudBtn, saveBtn);
  right.insertBefore(authBtn, saveBtn);
  return { cloudBtn, authBtn };
}

// ---- 로그인/로그아웃 ----
async function handleAuth() {
  const user = await getUser();
  if (user) {
    if (confirm(`${user.email}\n로그아웃할까요?`)) { await signOut(); toast("로그아웃됐어요"); }
    return;
  }
  openAuthModal();
}

// ---- 로그인/회원가입 카드 모달 (이미지 디자인) ----
let _authStyleInjected = false;
function injectAuthStyles() {
  if (_authStyleInjected) return;
  _authStyleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
  .auth-bg{position:fixed;inset:0;background:rgba(28,28,30,.5);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:400;padding:24px}
  .auth-card{background:var(--surface,#fff);border-radius:20px;max-width:380px;width:100%;
    padding:28px;box-shadow:0 12px 48px rgba(0,0,0,.2);animation:auth-in .16s ease}
  @keyframes auth-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .auth-title{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:800;
    color:var(--ink,#1c1c1e);margin-bottom:20px}
  .auth-title svg{width:22px;height:22px;stroke:var(--accent,#FF4D00);fill:none;stroke-width:2;
    stroke-linecap:round;stroke-linejoin:round}
  .auth-google{width:100%;height:48px;border:1px solid var(--border,#e5e5ea);border-radius:12px;
    background:var(--surface,#fff);display:flex;align-items:center;justify-content:center;gap:10px;
    font-size:14px;font-weight:700;color:var(--ink,#1c1c1e);transition:.12s;cursor:pointer}
  .auth-google:hover{background:var(--surface2,#f2f2f4)}
  .auth-google svg{width:18px;height:18px}
  .auth-or{display:flex;align-items:center;gap:12px;margin:18px 0;color:var(--hint,#aeaeb2);font-size:12px;font-weight:600}
  .auth-or::before,.auth-or::after{content:"";flex:1;height:1px;background:var(--border,#e5e5ea)}
  .auth-field{margin-bottom:14px}
  .auth-field label{display:block;font-size:12px;font-weight:700;color:var(--text,#3a3a3c);margin-bottom:6px}
  .auth-field input{width:100%;height:48px;border:1px solid var(--border,#e5e5ea);border-radius:12px;
    padding:0 14px;font-size:14px;color:var(--ink,#1c1c1e);background:var(--surface,#fff);transition:.12s}
  .auth-field input:focus{border-color:var(--accent,#FF4D00);box-shadow:0 0 0 3px rgba(255,77,0,.12);outline:none}
  .auth-submit{width:100%;height:52px;border:none;border-radius:14px;background:var(--accent,#FF4D00);
    color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;
    cursor:pointer;transition:.12s;margin-top:4px}
  .auth-submit:hover{background:var(--accent-d,#E34400)}
  .auth-submit:disabled{opacity:.5;cursor:not-allowed}
  .auth-submit svg{width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .auth-foot{text-align:center;font-size:13px;color:var(--sub,#6c6c70);margin-top:16px}
  .auth-foot a{color:var(--accent,#FF4D00);font-weight:800;cursor:pointer;text-decoration:none}
  .auth-close{position:absolute;top:18px;right:20px;font-size:22px;color:var(--hint,#aeaeb2);cursor:pointer;line-height:1}
  .auth-msg{font-size:12px;color:var(--red,#FF3B30);min-height:16px;margin-top:6px;text-align:center}
  `;
  document.head.appendChild(s);
}

function openAuthModal() {
  injectAuthStyles();
  let mode = "login"; // "login" | "signup"

  const bg = document.createElement("div");
  bg.className = "auth-bg";
  const card = document.createElement("div");
  card.className = "auth-card";
  card.style.position = "relative";
  bg.appendChild(card);
  document.body.appendChild(bg);

  const gIcon = `<svg viewBox="0 0 48 48"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.6 27.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 16.1 2 19 2 22.9s.8 6.8 2.3 9.8l7.3-5.6z"/><path fill="#EA4335" d="M24 9.9c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 3.4 30 1.5 24 1.5 15.4 1.5 7.9 6.4 4.3 13.1l7.3 5.7C13.3 13.8 18.2 9.9 24 9.9z"/></svg>`;

  function render() {
    const isLogin = mode === "login";
    card.innerHTML = `
      <div class="auth-close" data-act="close">×</div>
      <div class="auth-title">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${isLogin ? "로그인" : "회원가입"}
      </div>
      <button class="auth-google" data-act="google">${gIcon}<span>Google로 계속하기</span></button>
      <div class="auth-or">또는</div>
      <div class="auth-field">
        <label>이메일</label>
        <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email"/>
      </div>
      <div class="auth-field">
        <label>비밀번호</label>
        <input type="password" id="authPw" placeholder="6자 이상" autocomplete="${isLogin ? "current-password" : "new-password"}"/>
      </div>
      <button class="auth-submit" data-act="submit">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${isLogin ? "로그인" : "회원가입"}
      </button>
      <div class="auth-msg" id="authMsg"></div>
      <div class="auth-foot">
        ${isLogin
          ? `처음이세요? <a data-act="toggle">회원가입</a>`
          : `이미 계정이 있으세요? <a data-act="toggle">로그인</a>`}
      </div>`;
  }
  render();

  const close = () => bg.remove();
  const setMsg = (m) => { const el = card.querySelector("#authMsg"); if (el) el.textContent = m || ""; };

  bg.addEventListener("click", async (e) => {
    if (e.target === bg) return close();
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;

    if (act === "close") return close();
    if (act === "toggle") { mode = mode === "login" ? "signup" : "login"; render(); return; }

    if (act === "google") {
      try { await signInWithGoogle(); } // 페이지 리다이렉트
      catch (err) { setMsg("Google 로그인 오류: " + (err.message || err)); }
      return;
    }

    if (act === "submit") {
      const email = card.querySelector("#authEmail").value.trim();
      const pw = card.querySelector("#authPw").value;
      if (!email || !pw) { setMsg("이메일과 비밀번호를 입력하세요"); return; }
      if (pw.length < 6) { setMsg("비밀번호는 6자 이상이어야 해요"); return; }
      const btn = card.querySelector('[data-act="submit"]');
      btn.disabled = true; setMsg("");
      try {
        if (mode === "login") {
          await signInWithPassword(email, pw);
          close(); toast("로그인됐어요");
        } else {
          const { needsConfirm } = await signUp(email, pw);
          if (needsConfirm) { setMsg(""); close(); toast("확인 메일을 보냈어요 ✉ 메일의 링크를 눌러주세요"); }
          else { close(); toast("가입하고 로그인됐어요"); }
        }
      } catch (err) {
        btn.disabled = false;
        const msg = (err.message || "" ) + "";
        if (/Invalid login/i.test(msg)) setMsg("이메일 또는 비밀번호가 올바르지 않아요");
        else if (/already registered/i.test(msg)) setMsg("이미 가입된 이메일이에요. 로그인해 주세요");
        else setMsg(msg || "오류가 발생했어요");
      }
    }
  });

  // Enter 키 제출
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); card.querySelector('[data-act="submit"]').click(); }
  });
  setTimeout(() => card.querySelector("#authEmail")?.focus(), 50);
}

// ---- 클라우드 파일 선택 모달 ----
function pickFile(files) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg"; bg.style.display = "flex";
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = "<h2>클라우드에서 열기</h2>";
    if (!files.length) m.innerHTML += "<p>저장된 파일이 없어요.</p>";
    const wrap = document.createElement("div");
    wrap.className = "modal-btns";
    files.forEach((f) => {
      const b = document.createElement("button");
      b.textContent = f.name + (f.local ? "  (로컬)" : "");
      b.onclick = () => { bg.remove(); resolve(f); };
      wrap.appendChild(b);
    });
    const cancel = document.createElement("button");
    cancel.textContent = "취소";
    cancel.onclick = () => { bg.remove(); resolve(null); };
    wrap.appendChild(cancel);
    m.appendChild(wrap); bg.appendChild(m); document.body.appendChild(bg);
    bg.addEventListener("click", (e) => { if (e.target === bg) { bg.remove(); resolve(null); } });
  });
}

// ---- 불러온 DTMS 텍스트를 기존 파일입력으로 주입 → app.js가 처리 ----
function loadIntoApp(text, name) {
  const input = document.getElementById("tactileFileInput");
  if (!input) { toast("불러오기 입력을 찾을 수 없어요"); return; }
  const file = new File([text], name, { type: "application/json" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  toast("클라우드 파일을 불러왔어요");
}

// ---- 저장 가로채기 ----
// app.js의 저장 버튼들은 export.js의 exportDtms()를 호출해 Blob을 만들어 내려받습니다.
// 다운로드 방식(.click() / dispatchEvent)과 무관하도록, Blob이 생성되는 순간을
// URL.createObjectURL 단계에서 가로채 클라우드에 업로드합니다.
const SAVE_IDS = new Set(["saveBtn", "dtmsBtn", "miniDtmsBtn", "guardSave"]);

const _createObjURL = URL.createObjectURL.bind(URL);
let _blobResolver = null;
URL.createObjectURL = function (obj) {
  if (_blobResolver && obj instanceof Blob) { const r = _blobResolver; _blobResolver = null; r(obj); }
  return _createObjURL(obj);
};
// 다음에 생성되는 Blob 하나를 받아오는 Promise (timeout 내)
function nextBlob(timeout = 1500) {
  return new Promise((res) => {
    _blobResolver = res;
    setTimeout(() => { if (_blobResolver) { _blobResolver = null; res(null); } }, timeout);
  });
}

// 캡처 단계에서 저장 버튼 클릭을 먼저 감지 → exportDtms 실행 전에 Blob 캡처를 무장
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("button,[role=button]");
  if (!btn || !SAVE_IDS.has(btn.id)) return;
  const blobP = nextBlob();      // ← 동기적으로 무장 (await 전에)
  consumeSaveBlob(blobP);
}, true);

async function consumeSaveBlob(blobP) {
  const blob = await blobP;
  if (!blob) return;
  try {
    const text = await blob.text();
    const name = (document.getElementById("fname")?.value || "무제").trim();

    // 1) 임시 닷 클라우드(localStorage)에 저장 — 로그인 불필요, 개인 드라이브 최상위
    if (ENABLE_DOT_CLOUD_TEMP) {
      const meta = grabMeta();
      await dotCloud.saveFile({
        driverKind: "P", parentGroupNo: "ROOT", name,
        dtms: text, thumb: grabThumb(), width: meta.width, height: meta.height, tag: meta.tag,
      });
      toast("닷 클라우드에 저장됨 ☁");
      return;
    }
    // 2) (선택) Supabase 클라우드 — 로그인 상태일 때만
    if (ENABLE_AUTH_UI) {
      const user = await getUser();
      if (!user) return;
      await saveDtms(name, text);
      toast("클라우드에도 저장됐어요 ☁");
    }
  } catch (e) { console.warn("클라우드 저장 실패:", e); }
}

// ---- 초기화 ----
window.addEventListener("DOMContentLoaded", async () => {
  const ui = injectUI();
  if (!ui) return;

  // 게스트 모드(ENABLE_AUTH_UI=false)면 로그인/클라우드 버튼이 없으므로 여기서 종료
  if (!ui.authBtn || !ui.cloudBtn) return;

  ui.authBtn.addEventListener("click", handleAuth);
  ui.cloudBtn.addEventListener("click", async () => {
    let files = [];
    try { files = await listDtms(); } catch (e) { toast("목록 조회 오류"); }
    const f = await pickFile(files);
    if (!f) return;
    try { loadIntoApp(await loadDtms(f.path), f.name); }
    catch (e) { toast("불러오기 오류: " + (e.message || e)); }
  });

  const setLabel = (u) => { ui.authBtn.textContent = u ? u.email.split("@")[0] : "로그인"; };
  onAuthChange(setLabel);
  setLabel(await getUser());
});
