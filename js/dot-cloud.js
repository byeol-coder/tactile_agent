// ============================================================
// dot-cloud.js — 임시 닷 클라우드 (localStorage 기반, 실제 Dot Cloud 구조 미러링)
//
// 실제 Dot Cloud API 와 동일한 개념/필드명을 사용해, 나중에 통합 시
// 아래 `dotCloud` 드라이버 내부만 실제 API 호출로 교체하면 됩니다.
//   실제 API 대응:
//     list()       → GET /drive-app/v1/dtms/groups   (DRIVER_KIND, PARENT_GROUP_NO, PAGE_NO, PAGE_SIZE)
//     getPath()    → GET /drive-app/v1/dtms/group/path (DTM_GROUP_NO, DRIVER_KIND)
//     saveFile()   → POST 업로드 (미확정)
//     createFolder / remove / rename → CRUD (미확정)
//   DRIVER_KIND: "P"=개인(Personal), "D"=공용(Public)
//   해상도(WIDTH×HEIGHT)=점자 셀, TAG=언어, 확장자 .dtms/.dtmx
// ============================================================
const KEY = "dotcloud:v2";
const PAGE_SIZE = 18;

function db() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function saveDb(d) { localStorage.setItem(KEY, JSON.stringify(d)); }

// 최초 1회 시드: 공용 드라이브(D)에 실제와 같은 샘플 폴더 구성
function ensureSeed() {
  let d = db();
  if (d) return d;
  const now = Date.now();
  const pub = [
    ["Art", 72], ["BRA", 14], ["Language", 100],
    ["Life Skills", 18], ["Literature", 40], ["Mathematics", 123],
  ].map(([name, cnt], i) => ({
    DTM_GROUP_NO: "D" + (i + 1), GROUP_NAME: name, PARENT_GROUP_NO: "ROOT",
    DRIVER_KIND: "D", ITEM_COUNT: cnt, REG_DATE: now, MOD_DATE: now, seed: true,
  }));
  d = { P: { groups: [], files: [] }, D: { groups: pub, files: [] } };
  saveDb(d);
  return d;
}

function side(kind) { const d = ensureSeed(); return d[kind === "D" ? "D" : "P"]; }
function commit() { /* side() returns live ref of db(); persist whole */ }
function persist(d) { saveDb(d); }

// 폴더 하위 항목 수 (시드 폴더는 표시용 ITEM_COUNT 사용)
function countOf(kind, groupNo, folder) {
  if (folder && folder.seed && folder.ITEM_COUNT != null) return folder.ITEM_COUNT;
  const s = side(kind);
  return s.groups.filter((g) => g.PARENT_GROUP_NO === groupNo).length +
         s.files.filter((f) => f.PARENT_GROUP_NO === groupNo).length;
}

export const dotCloud = {
  PAGE_SIZE,

  // 폴더+파일 목록 (폴더 먼저), 페이지네이션 + 이름 검색
  async list({ driverKind = "P", parentGroupNo = "ROOT", pageNo = 1, query = "" } = {}) {
    const s = side(driverKind);
    const q = query.trim().toLowerCase();
    let folders = s.groups.filter((g) => g.PARENT_GROUP_NO === parentGroupNo);
    let files = s.files.filter((f) => f.PARENT_GROUP_NO === parentGroupNo);
    if (q) {
      folders = folders.filter((g) => g.GROUP_NAME.toLowerCase().includes(q));
      files = files.filter((f) => f.FILE_NAME.toLowerCase().includes(q));
    }
    const items = [
      ...folders.sort((a, b) => a.GROUP_NAME.localeCompare(b.GROUP_NAME))
        .map((g) => ({ type: "folder", no: g.DTM_GROUP_NO, name: g.GROUP_NAME,
          count: countOf(driverKind, g.DTM_GROUP_NO, g), modDate: g.MOD_DATE, seed: !!g.seed })),
      ...files.sort((a, b) => (b.MOD_DATE || 0) - (a.MOD_DATE || 0))
        .map((f) => ({ type: "file", no: f.DTM_FILE_NO, name: f.FILE_NAME, ext: f.FILE_EXT,
          width: f.WIDTH, height: f.HEIGHT, tag: f.TAG, thumb: f.thumb, modDate: f.MOD_DATE })),
    ];
    const totalPage = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const cur = Math.min(Math.max(1, pageNo), totalPage);
    return { items: items.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE), totalPage, currentPage: cur, total: items.length };
  },

  // 브레드크럼 경로 (ROOT → 현재)
  async getPath({ driverKind = "P", groupNo = "ROOT" } = {}) {
    const s = side(driverKind);
    const path = [{ no: "ROOT", name: driverKind === "D" ? "공용 드라이브" : "내 드라이브" }];
    let cur = groupNo;
    const chain = [];
    while (cur && cur !== "ROOT") {
      const g = s.groups.find((x) => x.DTM_GROUP_NO === cur);
      if (!g) break;
      chain.unshift({ no: g.DTM_GROUP_NO, name: g.GROUP_NAME });
      cur = g.PARENT_GROUP_NO;
    }
    return path.concat(chain);
  },

  async createFolder({ driverKind = "P", parentGroupNo = "ROOT", name }) {
    const d = ensureSeed();
    const now = Date.now();
    d[driverKind].groups.push({
      DTM_GROUP_NO: "g" + now, GROUP_NAME: name, PARENT_GROUP_NO: parentGroupNo,
      DRIVER_KIND: driverKind, ITEM_COUNT: 0, REG_DATE: now, MOD_DATE: now,
    });
    persist(d);
  },

  // 파일 저장 (같은 폴더에 같은 이름이면 덮어쓰기)
  async saveFile({ driverKind = "P", parentGroupNo = "ROOT", name, dtms, thumb, width, height, tag }) {
    const d = ensureSeed();
    const now = Date.now();
    const base = name.replace(/\.(dtms|dtmx|dtm)$/i, "");
    const ext = (name.match(/\.(dtms|dtmx|dtm)$/i)?.[1] || "dtms").toLowerCase();
    const fname = base + "." + ext;
    const files = d[driverKind].files;
    const found = files.find((f) => f.FILE_NAME === fname && f.PARENT_GROUP_NO === parentGroupNo);
    if (found) Object.assign(found, { dtms, thumb, WIDTH: width, HEIGHT: height, TAG: tag, MOD_DATE: now });
    else files.push({
      DTM_FILE_NO: "f" + now, FILE_NAME: fname, FILE_EXT: ext, WIDTH: width, HEIGHT: height,
      TAG: tag, PARENT_GROUP_NO: parentGroupNo, DRIVER_KIND: driverKind,
      dtms, thumb, REG_DATE: now, MOD_DATE: now,
    });
    persist(d);
  },

  async load({ driverKind = "P", fileNo }) {
    return side(driverKind).files.find((f) => f.DTM_FILE_NO === fileNo)?.dtms ?? null;
  },

  async remove({ driverKind = "P", no, type }) {
    const d = ensureSeed();
    if (type === "folder") {
      d[driverKind].groups = d[driverKind].groups.filter((g) => g.DTM_GROUP_NO !== no);
      // 하위 항목도 정리
      d[driverKind].groups = d[driverKind].groups.filter((g) => g.PARENT_GROUP_NO !== no);
      d[driverKind].files = d[driverKind].files.filter((f) => f.PARENT_GROUP_NO !== no);
    } else {
      d[driverKind].files = d[driverKind].files.filter((f) => f.DTM_FILE_NO !== no);
    }
    persist(d);
  },

  async rename({ driverKind = "P", no, type, name }) {
    const d = ensureSeed();
    if (type === "folder") {
      const g = d[driverKind].groups.find((x) => x.DTM_GROUP_NO === no);
      if (g) g.GROUP_NAME = name;
    } else {
      const f = d[driverKind].files.find((x) => x.DTM_FILE_NO === no);
      if (f) { const ext = f.FILE_EXT; f.FILE_NAME = name.replace(/\.(dtms|dtmx|dtm)$/i, "") + "." + ext; }
    }
    persist(d);
  },
};

// ---- 스타일 ----
let _styleInjected = false;
function injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
  .dc-bg{position:fixed;inset:0;background:rgba(28,28,30,.5);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:400;padding:24px}
  .dc-panel{background:var(--surface,#fff);border-radius:20px;width:100%;max-width:760px;height:80vh;max-height:680px;
    display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.22);overflow:hidden;animation:dc-in .16s ease}
  @keyframes dc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .dc-tabs{display:flex;align-items:center;gap:4px;padding:14px 18px 0}
  .dc-tab{height:34px;padding:0 14px;border:none;background:none;font-size:13px;font-weight:700;color:var(--sub,#6c6c70);
    border-radius:8px 8px 0 0;cursor:pointer}
  .dc-tab.active{color:var(--accent,#FF4D00);background:var(--accent-bg,#FFF3EE)}
  .dc-close{margin-left:auto;font-size:22px;color:var(--hint,#aeaeb2);cursor:pointer;background:none;border:none;line-height:1}
  .dc-bar{display:flex;align-items:center;gap:8px;padding:12px 18px;border-bottom:1px solid var(--border,#e5e5ea)}
  .dc-nav{width:30px;height:30px;border:1px solid var(--border,#e5e5ea);border-radius:8px;background:var(--surface2,#f2f2f4);
    color:var(--sub,#6c6c70);font-size:14px;cursor:pointer;display:grid;place-items:center}
  .dc-nav:disabled{opacity:.4;cursor:not-allowed}
  .dc-crumb{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--sub,#6c6c70);flex:1;min-width:0;overflow:hidden;white-space:nowrap}
  .dc-crumb a{color:var(--sub,#6c6c70);cursor:pointer;text-decoration:none;padding:2px 4px;border-radius:5px}
  .dc-crumb a:hover{background:var(--surface2,#f2f2f4);color:var(--ink,#1c1c1e)}
  .dc-crumb b{color:var(--ink,#1c1c1e)}
  .dc-search{height:30px;border:1px solid var(--border,#e5e5ea);border-radius:8px;padding:0 10px;font-size:12px;width:150px;background:var(--surface,#fff)}
  .dc-view{display:flex;gap:2px}
  .dc-vbtn{width:30px;height:30px;border:1px solid var(--border,#e5e5ea);background:var(--surface2,#f2f2f4);color:var(--sub,#6c6c70);
    cursor:pointer;display:grid;place-items:center;font-size:14px}
  .dc-vbtn:first-child{border-radius:8px 0 0 8px} .dc-vbtn:last-child{border-radius:0 8px 8px 0}
  .dc-vbtn.active{background:var(--accent,#FF4D00);border-color:var(--accent,#FF4D00);color:#fff}
  .dc-body{flex:1;overflow-y:auto;padding:16px 18px;position:relative}
  .dc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px}
  .dc-card{border:1px solid var(--border,#e5e5ea);border-radius:14px;overflow:hidden;background:var(--surface,#fff);
    display:flex;flex-direction:column;transition:.12s;cursor:pointer}
  .dc-card:hover{border-color:var(--accent,#FF4D00);box-shadow:0 4px 14px rgba(0,0,0,.08)}
  .dc-thumb{aspect-ratio:3/2;background:#EEEBE0;display:grid;place-items:center;overflow:hidden;color:var(--hint,#aeaeb2)}
  .dc-thumb img{width:100%;height:100%;object-fit:contain}
  .dc-ico{stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
  .dc-folder-ico{color:var(--amber,#FF9F0A);display:grid;place-items:center}
  .dc-meta{padding:8px 10px;min-width:0}
  .dc-name{font-size:12px;font-weight:700;color:var(--ink,#1c1c1e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dc-sub{font-size:10px;color:var(--hint,#aeaeb2);margin-top:3px;display:flex;gap:5px;flex-wrap:wrap}
  .dc-pill{background:var(--surface2,#f2f2f4);border-radius:999px;padding:1px 6px;color:var(--sub,#6c6c70);font-weight:700}
  .dc-actions{display:flex;border-top:1px solid var(--border,#e5e5ea)}
  .dc-actions button{flex:1;height:32px;font-size:11px;font-weight:700;background:none;border:none;cursor:pointer;color:var(--text,#3a3a3c)}
  .dc-actions button+button{border-left:1px solid var(--border,#e5e5ea)}
  .dc-actions button:hover{background:var(--surface2,#f2f2f4)}
  .dc-actions button.del:hover{background:var(--red-bg,#FFF2F1);color:var(--red,#FF3B30)}
  /* list view */
  .dc-list{display:flex;flex-direction:column}
  .dc-row{display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border,#e5e5ea);cursor:pointer}
  .dc-row:hover{background:var(--surface2,#f2f2f4)}
  .dc-row .ic{width:22px;text-align:center;font-size:18px}
  .dc-row .nm{flex:1;font-size:12px;font-weight:600;color:var(--ink,#1c1c1e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dc-row .mt{font-size:10px;color:var(--hint,#aeaeb2);white-space:nowrap}
  .dc-row .rm{border:none;background:none;color:var(--hint,#aeaeb2);cursor:pointer;font-size:14px;padding:2px 6px}
  .dc-row .rm:hover{color:var(--red,#FF3B30)}
  .dc-empty{text-align:center;color:var(--sub,#6c6c70);font-size:13px;padding:44px 0;line-height:1.9}
  .dc-loading,.dc-error{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--sub,#6c6c70);font-size:13px;padding:52px 0}
  .dc-spin{width:22px;height:22px;border:2.5px solid var(--border,#e5e5ea);border-top-color:var(--accent,#FF4D00);border-radius:50%;animation:dc-spin .7s linear infinite}
  @keyframes dc-spin{to{transform:rotate(360deg)}}
  .dc-error button{border:1px solid var(--border,#e5e5ea);background:var(--surface2,#f2f2f4);border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;color:var(--text,#3a3a3c)}
  .dc-search-wrap{position:relative;display:flex;align-items:center}
  .dc-search-wrap .dc-ico{position:absolute;left:8px;color:var(--hint,#aeaeb2);pointer-events:none}
  .dc-search-wrap input{padding-left:28px}
  .dc-foot{display:flex;align-items:center;justify-content:center;gap:4px;padding:10px;border-top:1px solid var(--border,#e5e5ea)}
  .dc-pg{min-width:28px;height:28px;border:1px solid var(--border,#e5e5ea);border-radius:7px;background:var(--surface2,#f2f2f4);
    color:var(--sub,#6c6c70);font-size:11px;font-weight:700;cursor:pointer;padding:0 6px}
  .dc-pg.active{background:var(--accent,#FF4D00);border-color:var(--accent,#FF4D00);color:#fff}
  .dc-pg:disabled{opacity:.4;cursor:not-allowed}
  .dc-fab{position:absolute;right:18px;bottom:18px;width:46px;height:46px;border-radius:50%;background:var(--accent,#FF4D00);
    color:#fff;font-size:24px;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(255,77,0,.4);display:grid;place-items:center;z-index:5}
  .dc-fab-menu{position:absolute;right:18px;bottom:72px;background:var(--surface,#fff);border:1px solid var(--border,#e5e5ea);
    border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:5px;display:none;flex-direction:column;gap:1px;z-index:6}
  .dc-fab-menu.show{display:flex}
  .dc-fab-menu button{height:36px;padding:0 14px;border:none;background:none;text-align:left;font-size:12px;font-weight:600;
    color:var(--text,#3a3a3c);border-radius:8px;cursor:pointer;white-space:nowrap}
  .dc-fab-menu button:hover{background:var(--surface2,#f2f2f4)}
  `;
  document.head.appendChild(s);
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---- 2D 플랫 SVG 아이콘 (Studio와 동일한 stroke 스타일, 이모지 미사용) ----
const ICONS = {
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
};
function ic(name, size = 16) {
  return `<svg class="dc-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// openDotCloudUI({ onOpen(dtmsText, name), startKind })
export async function openDotCloudUI({ onOpen, startKind = "P" } = {}) {
  injectStyles();
  const st = { kind: startKind, parent: "ROOT", page: 1, view: "grid", query: "" };

  const bg = document.createElement("div");
  bg.className = "dc-bg";
  bg.innerHTML = `
    <div class="dc-panel" role="dialog" aria-label="닷 클라우드">
      <div class="dc-tabs">
        <button class="dc-tab" data-act="tab" data-kind="P">내 드라이브</button>
        <button class="dc-tab" data-act="tab" data-kind="D">공용 드라이브</button>
        <button class="dc-close" data-act="close" aria-label="닫기">${ic("x", 18)}</button>
      </div>
      <div class="dc-bar">
        <button class="dc-nav" data-act="up" title="상위 폴더" aria-label="상위 폴더">${ic("up", 16)}</button>
        <div class="dc-crumb" id="dcCrumb"></div>
        <span class="dc-search-wrap">${ic("search", 15)}<input class="dc-search" id="dcSearch" placeholder="검색" value=""></span>
        <div class="dc-view">
          <button class="dc-vbtn" data-act="view" data-v="grid" title="그리드" aria-label="그리드 보기">${ic("grid", 15)}</button>
          <button class="dc-vbtn" data-act="view" data-v="list" title="리스트" aria-label="리스트 보기">${ic("list", 15)}</button>
        </div>
      </div>
      <div class="dc-body" id="dcBody"></div>
      <div class="dc-foot" id="dcFoot"></div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();

  const readOnly = () => st.kind === "D"; // 공용 드라이브는 데모상 읽기 전용

  async function render() {
    // tabs
    bg.querySelectorAll(".dc-tab").forEach((t) => t.classList.toggle("active", t.dataset.kind === st.kind));
    bg.querySelectorAll(".dc-vbtn").forEach((v) => v.classList.toggle("active", v.dataset.v === st.view));

    const body = bg.querySelector("#dcBody");
    const foot = bg.querySelector("#dcFoot");

    // 로딩 상태 (실제 클라우드 API 연결 시 네트워크 대기 동안 노출)
    body.innerHTML = `<div class="dc-loading"><span class="dc-spin"></span><span>불러오는 중…</span></div>`;
    foot.innerHTML = "";

    // 데이터 조회 (실패 시 우아하게 오류+재시도)
    let path, items, totalPage, currentPage, total;
    try {
      path = await dotCloud.getPath({ driverKind: st.kind, groupNo: st.parent });
      ({ items, totalPage, currentPage, total } = await dotCloud.list({
        driverKind: st.kind, parentGroupNo: st.parent, pageNo: st.page, query: st.query,
      }));
    } catch (err) {
      console.warn("닷 클라우드 조회 실패:", err);
      body.innerHTML = `<div class="dc-error"><span>클라우드를 불러오지 못했어요.<br>준비 중이거나 일시적인 문제일 수 있어요.</span><button data-act="retry">다시 시도</button></div>`;
      return;
    }
    st.page = currentPage;

    // breadcrumb
    bg.querySelector("#dcCrumb").innerHTML = path.map((p, i) =>
      i === path.length - 1 ? `<b>${esc(p.name)}</b>`
        : `<a data-act="crumb" data-no="${p.no}">${esc(p.name)}</a> <span>/</span>`
    ).join(" ");
    bg.querySelector(".dc-nav[data-act='up']").disabled = st.parent === "ROOT";

    if (!total) {
      body.innerHTML = `<div class="dc-empty">${st.query ? "검색 결과가 없어요." :
        (readOnly() ? "이 폴더는 비어 있어요." : "아직 저장된 항목이 없어요.<br>상단 <b>저장</b>을 누르거나 + 로 폴더를 만들어보세요.")}</div>`;
    } else if (st.view === "grid") {
      body.innerHTML = `<div class="dc-grid">` + items.map((it) => it.type === "folder"
        ? `<div class="dc-card" data-act="open-folder" data-no="${it.no}" data-name="${esc(it.name)}">
             <div class="dc-thumb"><span class="dc-folder-ico">${ic("folder", 40)}</span></div>
             <div class="dc-meta"><div class="dc-name" title="${esc(it.name)}">${esc(it.name)}</div>
               <div class="dc-sub"><span>${it.count}개 항목</span></div></div>
             ${readOnly() ? "" : `<div class="dc-actions">
               <button data-act="rename" data-type="folder" data-no="${it.no}">이름변경</button>
               <button class="del" data-act="delete" data-type="folder" data-no="${it.no}">삭제</button></div>`}
           </div>`
        : `<div class="dc-card" data-act="open-file" data-no="${it.no}" data-name="${esc(it.name)}">
             <div class="dc-thumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : ic("image", 34)}</div>
             <div class="dc-meta"><div class="dc-name" title="${esc(it.name)}">${esc(it.name)}</div>
               <div class="dc-sub">
                 ${it.width ? `<span class="dc-pill">${it.width}×${it.height}</span>` : ""}
                 ${it.tag ? `<span class="dc-pill">${esc(it.tag)}</span>` : ""}
               </div>
               <div class="dc-sub"><span>${fmtDate(it.modDate)}</span></div></div>
             ${readOnly() ? "" : `<div class="dc-actions">
               <button data-act="open-file" data-no="${it.no}" data-name="${esc(it.name)}">열기</button>
               <button class="del" data-act="delete" data-type="file" data-no="${it.no}">삭제</button></div>`}
           </div>`
      ).join("") + `</div>`;
    } else {
      body.innerHTML = `<div class="dc-list">` + items.map((it) => it.type === "folder"
        ? `<div class="dc-row" data-act="open-folder" data-no="${it.no}" data-name="${esc(it.name)}">
             <span class="ic" style="color:var(--amber,#FF9F0A)">${ic("folder", 18)}</span><span class="nm">${esc(it.name)}</span>
             <span class="mt">${it.count}개</span>
             ${readOnly() ? "" : `<button class="rm" data-act="delete" data-type="folder" data-no="${it.no}" title="삭제" aria-label="삭제">${ic("x", 14)}</button>`}</div>`
        : `<div class="dc-row" data-act="open-file" data-no="${it.no}" data-name="${esc(it.name)}">
             <span class="ic">${ic("image", 18)}</span><span class="nm">${esc(it.name)}</span>
             <span class="mt">${it.width ? it.width + "×" + it.height + " · " : ""}${fmtDate(it.modDate)}</span>
             ${readOnly() ? "" : `<button class="rm" data-act="delete" data-type="file" data-no="${it.no}" title="삭제" aria-label="삭제">${ic("x", 14)}</button>`}</div>`
      ).join("") + `</div>`;
    }

    // FAB (개인 드라이브에서만)
    if (!readOnly()) {
      body.insertAdjacentHTML("beforeend",
        `<button class="dc-fab" data-act="fab" title="새로 만들기" aria-label="새로 만들기">${ic("plus", 22)}</button>
         <div class="dc-fab-menu" id="dcFab">
           <button data-act="new-folder">새 폴더</button>
           <button data-act="upload">파일 올리기(.dtms)</button>
         </div>`);
    }

    // pagination
    if (totalPage <= 1) { foot.innerHTML = ""; }
    else {
      let html = `<button class="dc-pg" data-act="page" data-p="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="이전">${ic("left", 14)}</button>`;
      for (let i = 1; i <= totalPage; i++)
        html += `<button class="dc-pg ${i === currentPage ? "active" : ""}" data-act="page" data-p="${i}">${i}</button>`;
      html += `<button class="dc-pg" data-act="page" data-p="${currentPage + 1}" ${currentPage === totalPage ? "disabled" : ""} aria-label="다음">${ic("right", 14)}</button>`;
      foot.innerHTML = html;
    }
  }
  await render();

  // 검색 입력
  bg.querySelector("#dcSearch").addEventListener("input", (e) => {
    st.query = e.target.value; st.page = 1; render();
  });

  // 델리게이션
  bg.addEventListener("click", async (e) => {
    if (e.target === bg) return close();
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;

    if (act === "close") return close();
    if (act === "retry") return render();
    if (act === "tab") { st.kind = el.dataset.kind; st.parent = "ROOT"; st.page = 1; st.query = ""; bg.querySelector("#dcSearch").value = ""; return render(); }
    if (act === "view") { st.view = el.dataset.v; return render(); }
    if (act === "crumb") { st.parent = el.dataset.no; st.page = 1; return render(); }
    if (act === "up") {
      const path = await dotCloud.getPath({ driverKind: st.kind, groupNo: st.parent });
      st.parent = path.length >= 2 ? path[path.length - 2].no : "ROOT"; st.page = 1; return render();
    }
    if (act === "page") { st.page = +el.dataset.p; return render(); }
    if (act === "open-folder") { st.parent = el.dataset.no; st.page = 1; st.query = ""; bg.querySelector("#dcSearch").value = ""; return render(); }

    if (act === "open-file") {
      e.stopPropagation();
      const dtms = await dotCloud.load({ driverKind: st.kind, fileNo: el.dataset.no });
      if (dtms != null && onOpen) {
        let name = el.dataset.name || "무제.dtms";
        close(); onOpen(dtms, name);
      }
      return;
    }
    if (act === "delete") {
      e.stopPropagation();
      if (confirm("삭제할까요?")) { await dotCloud.remove({ driverKind: st.kind, no: el.dataset.no, type: el.dataset.type }); render(); }
      return;
    }
    if (act === "rename") {
      e.stopPropagation();
      const nm = prompt("새 이름을 입력하세요");
      if (nm) { await dotCloud.rename({ driverKind: st.kind, no: el.dataset.no, type: el.dataset.type, name: nm.trim() }); render(); }
      return;
    }
    if (act === "fab") { e.stopPropagation(); bg.querySelector("#dcFab")?.classList.toggle("show"); return; }
    if (act === "new-folder") {
      const nm = prompt("새 폴더 이름"); if (nm) { await dotCloud.createFolder({ driverKind: st.kind, parentGroupNo: st.parent, name: nm.trim() }); render(); }
      return;
    }
    if (act === "upload") {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".dtms,.dtmx,.dtm,.json";
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return;
        const text = await file.text();
        await dotCloud.saveFile({ driverKind: st.kind, parentGroupNo: st.parent, name: file.name, dtms: text, thumb: null, tag: "korean" });
        render();
      };
      inp.click();
      return;
    }
  });
}

// 캔버스(#pad)에서 작은 썸네일(PNG dataURL) 추출
export function grabThumb() {
  const c = document.getElementById("pad");
  if (!c || !c.width) return null;
  try {
    const w = 220, h = Math.max(1, Math.round(220 * (c.height / c.width)));
    const t = document.createElement("canvas");
    t.width = w; t.height = h;
    t.getContext("2d").drawImage(c, 0, 0, w, h);
    return t.toDataURL("image/png");
  } catch { return null; }
}

// 헤더에서 현재 해상도/언어 메타 읽기 (없으면 기본값)
export function grabMeta() {
  const res = document.getElementById("resChip")?.textContent?.trim() || "";
  const m = res.match(/(\d+)\s*[×xX]\s*(\d+)/);
  const langEn = document.querySelector(".hd-lang .lang-btn.active")?.dataset?.lang === "en";
  return { width: m ? +m[1] : null, height: m ? +m[2] : null, tag: langEn ? "english" : "korean" };
}
