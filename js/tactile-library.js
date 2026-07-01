// ============================================================
// tactile-library.js — Tactile World Library MVP
// Accessible tactile-graphics archive UI with local saved DTMS items.
// ============================================================
import { dotCloud } from "./dot-cloud.js";

const SAVED_KEY = "tactile-library:saved:v1";
const HISTORY_KEY = "tactile-library:history:v1";
const AGENT_ACTIONS = [
  "Simplify for 60×40 DotPad",
  "Generate tactile description",
  "Convert to classroom worksheet",
  "Reduce visual clutter",
  "Create braille/voice explanation",
  "Check tactile readability",
  "Generate alternate version for blind children",
  "Generate low-complexity version",
];

const CATEGORIES = ["Education", "Science", "Math", "Maps", "Culture", "Games", "Daily Life", "Art", "Tactile Agent", "DotPad Ready"];
const COLLECTIONS = ["Recently Added", "DotPad 60×40 Ready", "Teacher Resources", "Tactile Agent Generated", "Verified Tactile Graphics"];
const FOLDERS = ["Class Materials", "DotPad Tests", "Game Assets", "Tactile Studio Drafts", "Verified Graphics"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function savedIds() { return new Set(readJson(SAVED_KEY, [])); }
function setSavedIds(ids) { writeJson(SAVED_KEY, [...ids]); }
function history() { return readJson(HISTORY_KEY, { recent: [], sent: [], downloads: [] }); }
function pushHistory(kind, item) {
  const h = history();
  const arr = h[kind] || [];
  h[kind] = [{ id: item.id, title: item.title, at: Date.now() }, ...arr.filter((x) => x.id !== item.id)].slice(0, 12);
  writeJson(HISTORY_KEY, h);
}
function announce(text) {
  const live = document.getElementById("liveRegion");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => { live.textContent = text; }, 40);
}
function toast(text) {
  const t = document.getElementById("toast");
  if (t) {
    t.textContent = text;
    t.classList.add("show", "ok");
    setTimeout(() => t.classList.remove("show", "ok"), 1800);
  }
  announce(text);
}
function svgUrl(title, category, kind = "visual") {
  const bg = kind === "tactile" ? "#fff8ec" : "#f7f3eb";
  const ink = kind === "tactile" ? "#1c1c1e" : "#3a3a3c";
  const accent = kind === "tactile" ? "#ff4d00" : "#0a84ff";
  const dots = Array.from({ length: 54 }, (_, i) => {
    const x = 22 + (i % 9) * 24;
    const y = 34 + Math.floor(i / 9) * 22;
    const on = (i + title.length + category.length) % 4 !== 0;
    return `<circle cx="${x}" cy="${y}" r="${on ? 4 : 2}" fill="${on ? ink : "#d8d1c3"}" opacity="${on ? 0.92 : 0.55}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 170">
    <rect width="260" height="170" rx="14" fill="${bg}"/>
    <rect x="12" y="12" width="236" height="146" rx="10" fill="#fff" stroke="#e5ded0"/>
    ${kind === "tactile" ? dots : `<path d="M34 122c26-46 42-58 63-35 18 19 26 12 43-25 17-38 42-28 70 20" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/><circle cx="80" cy="68" r="18" fill="${accent}" opacity=".9"/><rect x="142" y="42" width="54" height="42" rx="8" fill="${ink}" opacity=".86"/>`}
    <text x="22" y="146" font-family="Inter,Arial" font-size="13" font-weight="700" fill="${ink}">${esc(title).slice(0, 26)}</text>
    <text x="22" y="28" font-family="Inter,Arial" font-size="10" font-weight="700" fill="${accent}">${esc(kind === "tactile" ? "TACTILE PREVIEW" : category.toUpperCase())}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function patternHex(cols, rows, seed = 1) {
  const bytes = (cols / 2) * (rows / 4);
  let out = "";
  for (let i = 0; i < bytes; i++) out += (((i * 37 + seed * 19) % 255) & 0xff).toString(16).padStart(2, "0");
  return out;
}
function dtmsFor(asset) {
  const [cols, rows] = asset.resolutionSupport.includes("60×40") ? [60, 40] : [96, 64];
  return JSON.stringify({
    title: asset.title,
    resolution: { cols, rows },
    items: [{
      title: asset.title,
      graphic: { data: patternHex(cols, rows, asset.id.length) },
      text: { plain: asset.screenReaderSummary },
    }],
  }, null, 2);
}

const ASSETS = [
  ["world-map-60", "World Continents Map", "Maps", ["continents", "geography", "classroom"], "Tactile World", "Good", "60×40", true, "Low"],
  ["cell-diagram", "Plant Cell Diagram", "Science", ["cell", "biology", "worksheet"], "Tactile World", "Good", "96×64", true, "Medium"],
  ["fraction-bars", "Fraction Bars Set", "Math", ["fractions", "numbers", "teacher"], "Tactile Agent", "Good", "60×40", true, "Low"],
  ["solar-system", "Solar System Orbits", "Science", ["space", "orbits", "planets"], "Tactile World", "Complex", "96×64", false, "High"],
  ["braille-maze", "Braille Maze Game", "Games", ["maze", "braille", "children"], "Tactile Agent", "Good", "60×40", true, "Low"],
  ["korean-palace", "Korean Palace Layout", "Culture", ["heritage", "architecture", "history"], "Tactile World", "Needs Review", "96×64", false, "Medium"],
  ["daily-route", "Daily Route Map", "Daily Life", ["mobility", "orientation", "route"], "Tactile Agent", "Good", "60×40", true, "Low"],
  ["coordinate-plane", "Coordinate Plane", "Math", ["graph", "x-axis", "y-axis"], "Tactile World", "Good", "60×40", true, "Low"],
  ["animal-tracks", "Animal Tracks Comparison", "Education", ["animals", "comparison", "science"], "Tactile Agent", "Needs Review", "60×40", false, "Medium"],
  ["water-cycle", "Water Cycle", "Science", ["weather", "cycle", "arrows"], "Tactile World", "Good", "96×64", true, "Medium"],
  ["art-patterns", "Raised Pattern Sampler", "Art", ["texture", "pattern", "design"], "Tactile Agent", "Good", "60×40", true, "Low"],
  ["clock-face", "Analog Clock Face", "Education", ["time", "clock", "daily life"], "Tactile World", "Good", "60×40", true, "Low"],
  ["city-block", "City Block Mobility Map", "Maps", ["streets", "crosswalk", "mobility"], "Tactile World", "Needs Review", "96×64", true, "Medium"],
  ["music-notes", "Music Notes Primer", "Art", ["music", "symbols", "education"], "Tactile Agent", "Needs Review", "60×40", false, "Medium"],
  ["shape-sort", "Shape Sorting Worksheet", "Education", ["shapes", "worksheet", "children"], "Tactile Agent", "Good", "60×40", true, "Low"],
  ["dinosaur-bone", "Dinosaur Bone Field", "Games", ["dinosaur", "fossil", "exploration"], "Tactile Agent", "Complex", "96×64", false, "High"],
].map(([id, title, category, tags, source, readinessScore, dotPadResolution, verified, complexity], i) => ({
  id, title, category, tags, source,
  thumbnailUrl: svgUrl(title, category, "visual"),
  tactilePreviewUrl: svgUrl(title, category, "tactile"),
  description: `${title} is a tactile-ready resource for ${category.toLowerCase()} learning, designed with clear outlines and structured exploration.`,
  tactileGuide: "Start at the top-left anchor, trace the outer boundary, then move through the raised landmarks in reading order.",
  landmarks: tags.concat(category, dotPadResolution).slice(0, 6),
  resolutionSupport: dotPadResolution === "96×64" ? ["60×40", "96×64"] : ["60×40"],
  formats: i % 4 === 0 ? ["SVG", "PNG", "PDF", "DOTPAD", "STL"] : i % 3 === 0 ? ["SVG", "PNG", "PDF"] : ["PNG", "DOTPAD"],
  complexity,
  readinessScore,
  verified,
  createdBy: source === "Tactile Agent" ? "Tactile Agent" : "Tactile World Studio",
  updatedAt: `2026-06-${String(10 + i).padStart(2, "0")}`,
  recommendedUse: i % 2 ? "Small group lesson and DotPad preview." : "Classroom demonstration and independent tactile reading.",
  ageLevel: i % 3 === 0 ? "Grades 3-5" : i % 3 === 1 ? "Grades 6-8" : "All ages",
  license: verified ? "Shareable for education" : "Review before redistribution",
  saved: false,
  dotPadTested: verified,
  altText: `${title}, ${category} tactile graphic with ${tags.slice(0, 3).join(", ")} landmarks.`,
  screenReaderSummary: `${title}. Source ${source}. ${readinessScore} tactile readiness. DotPad ${dotPadResolution}.`,
  folder: FOLDERS[i % FOLDERS.length],
}));

let _styleInjected = false;
function injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
  .tl-bg{position:fixed;inset:0;background:rgba(28,28,30,.52);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:410;padding:18px}
  .tl-panel{width:min(1180px,100%);height:min(88vh,780px);background:var(--surface,#fff);border-radius:18px;box-shadow:0 16px 58px rgba(0,0,0,.24);display:flex;flex-direction:column;overflow:hidden;color:var(--ink,#1c1c1e)}
  .tl-top{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border,#e5e5ea)}
  .tl-mark{width:34px;height:34px;border-radius:10px;background:var(--ink,#1c1c1e);display:grid;place-items:center;color:#fff}
  .tl-title h2{font-size:18px;line-height:1.1;margin:0}.tl-title p{font-size:12px;color:var(--sub,#6c6c70);margin-top:3px}
  .tl-close{margin-left:auto;width:34px;height:34px;border-radius:9px;border:1px solid var(--border,#e5e5ea);background:var(--surface,#fff);display:grid;place-items:center}
  .tl-close:hover{background:var(--surface2,#f2f2f4)}
  .tl-body{display:grid;grid-template-columns:230px minmax(0,1fr) 292px;min-height:0;flex:1;background:#fbfaf7}
  .tl-side{border-right:1px solid #e6dfd3;background:#fffdf8;padding:14px;overflow:auto}
  .tl-main{min-width:0;overflow:auto;padding:16px}
  .tl-agent{border-left:1px solid #e6dfd3;background:#fff;padding:14px;overflow:auto}
  .tl-tabs{display:grid;gap:6px;margin-bottom:14px}.tl-tab{height:34px;text-align:left;padding:0 10px;border-radius:8px;font-size:12px;font-weight:800;color:var(--text,#3a3a3c);border:1px solid transparent}
  .tl-tab.active{background:var(--accent-bg,#fff3ee);border-color:rgba(255,77,0,.25);color:var(--accent,#ff4d00)}
  .tl-filter-title{font-size:11px;font-weight:900;color:var(--sub,#6c6c70);letter-spacing:.04em;text-transform:uppercase;margin:13px 0 7px}
  .tl-select{width:100%;height:34px;border:1px solid #e2dacd;border-radius:8px;background:#fff;padding:0 9px;font-size:12px;color:var(--text,#3a3a3c)}
  .tl-folder{display:flex;justify-content:space-between;gap:8px;width:100%;min-height:32px;border-radius:8px;padding:7px 8px;text-align:left;color:var(--text,#3a3a3c);font-size:12px}
  .tl-folder:hover,.tl-folder.active{background:#f4efe6}.tl-folder span:last-child{color:var(--hint,#aeaeb2);font-weight:800}
  .tl-hero{background:#fff;border:1px solid #e6dfd3;border-radius:12px;padding:16px;margin-bottom:12px}
  .tl-hero h1{font-size:24px;line-height:1.1;margin-bottom:5px}.tl-hero p{font-size:13px;color:var(--sub,#6c6c70);max-width:720px}
  .tl-search{display:flex;align-items:center;gap:8px;margin-top:14px;height:42px;border:1px solid #ded6c8;border-radius:10px;background:#fff;padding:0 12px}
  .tl-search input{border:0;background:transparent;flex:1;min-width:0;font-size:14px;color:var(--ink,#1c1c1e)}
  .tl-chip-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.tl-chip,.tl-collection{min-height:30px;border-radius:999px;border:1px solid #e2dacd;background:#fff;padding:5px 10px;font-size:12px;font-weight:800;color:var(--text,#3a3a3c)}
  .tl-chip.active,.tl-collection.active{border-color:rgba(255,77,0,.36);background:var(--accent-bg,#fff3ee);color:var(--accent,#ff4d00)}
  .tl-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 10px}.tl-section-head h3{font-size:14px}.tl-count{font-size:12px;color:var(--sub,#6c6c70)}
  .tl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:12px}
  .tl-card{background:#fff;border:1px solid #e6dfd3;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
  .tl-card:focus-within,.tl-card:hover{border-color:rgba(255,77,0,.45);box-shadow:0 5px 18px rgba(70,42,15,.08)}
  .tl-previews{display:grid;grid-template-columns:1fr 96px;gap:1px;background:#e6dfd3}.tl-previews img{width:100%;height:126px;object-fit:cover;background:#fff}.tl-previews img:last-child{height:126px;object-fit:cover}
  .tl-card-body{padding:10px}.tl-card-title{font-size:13px;font-weight:900;line-height:1.25;margin-bottom:7px}
  .tl-badges{display:flex;flex-wrap:wrap;gap:5px}.tl-badge{border-radius:999px;background:#f5f1e9;color:#5b5448;padding:2px 7px;font-size:10px;font-weight:900}.tl-badge.ok{background:#edf8ef;color:#27723a}.tl-badge.warn{background:#fff8ec;color:#9b6100}.tl-badge.hot{background:#fff3ee;color:#d24100}
  .tl-actions{display:grid;grid-template-columns:1fr 1fr;gap:1px;border-top:1px solid #e6dfd3;background:#e6dfd3;margin-top:auto}.tl-actions button{height:34px;background:#fff;font-size:11px;font-weight:900;color:var(--text,#3a3a3c)}.tl-actions button:hover{background:#f7f3eb}.tl-actions .primary{color:var(--accent,#ff4d00)}
  .tl-empty,.tl-loading,.tl-error{display:grid;place-items:center;text-align:center;min-height:220px;color:var(--sub,#6c6c70);line-height:1.8;background:#fff;border:1px solid #e6dfd3;border-radius:10px;padding:24px}
  .tl-spin{width:24px;height:24px;border-radius:50%;border:3px solid #e6dfd3;border-top-color:var(--accent,#ff4d00);animation:tl-spin .75s linear infinite;margin:0 auto 10px}@keyframes tl-spin{to{transform:rotate(360deg)}}
  .tl-detail{display:grid;gap:12px}.tl-detail-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,.8fr);gap:12px}.tl-box{background:#fff;border:1px solid #e6dfd3;border-radius:10px;padding:12px}.tl-box h3{font-size:13px;margin-bottom:8px}.tl-box p,.tl-box li{font-size:12px;color:var(--text,#3a3a3c)}.tl-box ul{padding-left:18px}
  .tl-big-preview{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:8px;border:1px solid #e6dfd3;background:#fff}.tl-preview-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.tl-preview-row img{width:100%;aspect-ratio:3/2;object-fit:cover;border:1px solid #e6dfd3;border-radius:8px}
  .tl-meta{display:grid;grid-template-columns:1fr 1fr;gap:7px}.tl-meta div{background:#faf7f0;border:1px solid #ede5d8;border-radius:8px;padding:7px}.tl-meta b{display:block;font-size:10px;color:var(--sub,#6c6c70);text-transform:uppercase}.tl-meta span{font-size:12px;font-weight:800}
  .tl-detail-actions{display:flex;flex-wrap:wrap;gap:7px}.tl-btn{min-height:34px;border-radius:8px;border:1px solid #e2dacd;background:#fff;padding:7px 10px;font-size:12px;font-weight:900;color:var(--text,#3a3a3c)}.tl-btn.primary{background:var(--accent,#ff4d00);border-color:var(--accent,#ff4d00);color:#fff}.tl-btn:hover{filter:brightness(.98)}
  .tl-agent h3{font-size:14px;margin-bottom:8px}.tl-agent p{font-size:12px;color:var(--sub,#6c6c70);margin-bottom:10px}.tl-agent-list{display:grid;gap:6px}.tl-agent-list button{min-height:34px;text-align:left;border:1px solid #e2dacd;border-radius:8px;background:#fff;padding:7px 9px;font-size:12px;font-weight:800}
  .tl-agent-list button:hover,.tl-agent-list button.active{background:var(--accent-bg,#fff3ee);border-color:rgba(255,77,0,.35);color:var(--accent,#ff4d00)}
  .tl-agent-result{margin-top:12px;border:1px solid #e6dfd3;border-radius:10px;padding:10px;background:#fffdf8}.tl-agent-result h4{font-size:12px;margin-bottom:7px}.tl-before-after{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}.tl-before-after div{background:#fff;border:1px solid #ede5d8;border-radius:8px;padding:7px;font-size:11px;color:var(--text,#3a3a3c)}
  .tl-local-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e6dfd3;border-radius:10px;padding:10px;margin-bottom:8px}.tl-local-row img{width:74px;height:50px;object-fit:contain;background:#f7f3eb;border-radius:7px}.tl-local-row div{min-width:0;flex:1}.tl-local-row b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tl-local-row span{font-size:11px;color:var(--sub,#6c6c70)}
  @media (max-width:980px){.tl-body{grid-template-columns:1fr}.tl-side,.tl-agent{border:0;border-bottom:1px solid #e6dfd3}.tl-agent{display:none}.tl-detail-hero{grid-template-columns:1fr}.tl-panel{height:94vh}.tl-previews{grid-template-columns:1fr 84px}}
  `;
  document.head.appendChild(s);
}

function iconCloud() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
}
function collectionMatch(asset, collection) {
  if (!collection) return true;
  if (collection === "Recently Added") return true;
  if (collection === "DotPad 60×40 Ready") return asset.resolutionSupport.includes("60×40") && asset.readinessScore === "Good";
  if (collection === "Teacher Resources") return /teacher|worksheet|classroom|lesson/i.test(asset.tags.join(" ") + asset.recommendedUse);
  if (collection === "Tactile Agent Generated") return asset.source === "Tactile Agent";
  if (collection === "Verified Tactile Graphics") return asset.verified;
  return true;
}
function scoreClass(score) {
  if (score === "Good") return "ok";
  if (score === "Needs Review") return "warn";
  return "hot";
}
function formatAsset(asset, ids) {
  const saved = ids.has(asset.id);
  return `<article class="tl-card" aria-labelledby="asset-${asset.id}">
    <div class="tl-previews">
      <img src="${asset.thumbnailUrl}" alt="${esc(asset.altText)}">
      <img src="${asset.tactilePreviewUrl}" alt="${esc(asset.title)} 60 by 40 tactile preview thumbnail">
    </div>
    <div class="tl-card-body">
      <div class="tl-card-title" id="asset-${asset.id}">${esc(asset.title)}</div>
      <div class="tl-badges">
        <span class="tl-badge">${esc(asset.category)}</span>
        <span class="tl-badge">${esc(asset.source)}</span>
        <span class="tl-badge ${scoreClass(asset.readinessScore)}">${esc(asset.readinessScore)}</span>
        <span class="tl-badge">${asset.resolutionSupport.join(" / ")}</span>
        ${asset.verified ? `<span class="tl-badge ok">Verified</span>` : ""}
      </div>
    </div>
    <div class="tl-actions">
      <button class="primary" data-act="detail" data-id="${asset.id}">View Detail</button>
      <button data-act="save" data-id="${asset.id}">${saved ? "Saved" : "Save"}</button>
      <button data-act="send" data-id="${asset.id}">Send to DotPad</button>
      <button data-act="adapt" data-id="${asset.id}">Adapt</button>
    </div>
  </article>`;
}

export async function openTactileLibraryUI({ onOpen } = {}) {
  injectStyles();
  const st = {
    tab: "home", query: "", category: "", source: "", resolution: "", format: "", complexity: "",
    verified: "", collection: "", folder: "", detailId: "", agentAction: "", agentDone: false,
    localFiles: [], loading: true, error: "",
  };

  const bg = document.createElement("div");
  bg.className = "tl-bg";
  bg.innerHTML = `
    <section class="tl-panel" role="dialog" aria-modal="true" aria-labelledby="tlTitle">
      <div class="tl-top">
        <div class="tl-mark">${iconCloud()}</div>
        <div class="tl-title">
          <h2 id="tlTitle">Tactile World Library</h2>
          <p>Browse tactile graphics, AI-generated assets, and DotPad-ready learning materials.</p>
        </div>
        <button class="tl-close" data-act="close" aria-label="Close Tactile World Library">×</button>
      </div>
      <div class="tl-body">
        <aside class="tl-side" aria-label="Library filters"></aside>
        <main class="tl-main" id="tlMain" tabindex="-1"></main>
        <aside class="tl-agent" aria-label="Tactile Agent actions"></aside>
      </div>
    </section>`;
  document.body.appendChild(bg);
  const panel = bg.querySelector(".tl-panel");
  const close = () => bg.remove();

  async function loadLocalFiles() {
    st.loading = true; st.error = ""; render();
    try {
      const res = await dotCloud.list({ driverKind: "P", parentGroupNo: "ROOT", pageNo: 1, query: "" });
      st.localFiles = res.items.filter((x) => x.type === "file");
    } catch {
      st.error = "My Library items could not be loaded.";
    } finally {
      st.loading = false; render();
    }
  }
  function filteredAssets() {
    const q = st.query.trim().toLowerCase();
    const ids = savedIds();
    return ASSETS.filter((a) => {
      if (st.tab === "saved" && !ids.has(a.id)) return false;
      if (st.tab === "team" && !(a.verified && a.source === "Tactile World")) return false;
      if (st.category && a.category !== st.category) return false;
      if (st.source && a.source !== st.source) return false;
      if (st.resolution && !a.resolutionSupport.includes(st.resolution)) return false;
      if (st.format && !a.formats.includes(st.format)) return false;
      if (st.complexity && a.complexity !== st.complexity) return false;
      if (st.verified && String(a.verified) !== st.verified) return false;
      if (st.folder && a.folder !== st.folder) return false;
      if (!collectionMatch(a, st.collection)) return false;
      if (!q) return true;
      const hay = [a.title, a.category, a.source, a.description, a.tactileGuide, a.recommendedUse, a.ageLevel, ...a.tags, ...a.landmarks].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  function assetById(id) { return ASSETS.find((a) => a.id === id); }
  function renderSide() {
    const ids = savedIds();
    const folderCounts = Object.fromEntries(FOLDERS.map((f) => [f, ASSETS.filter((a) => a.folder === f).length]));
    bg.querySelector(".tl-side").innerHTML = `
      <div class="tl-tabs">
        ${[["home", "Library Home"], ["saved", `My Library (${ids.size})`], ["team", "Team Library"], ["history", "History"], ["local", "Studio Drafts"]].map(([k, label]) =>
          `<button class="tl-tab ${st.tab === k ? "active" : ""}" data-act="tab" data-tab="${k}">${label}</button>`).join("")}
      </div>
      <div class="tl-filter-title">Filters</div>
      ${select("category", "Category", ["", ...CATEGORIES], st.category)}
      ${select("source", "Source", ["", "Tactile World", "Tactile Agent"], st.source)}
      ${select("resolution", "DotPad resolution", ["", "60×40", "96×64"], st.resolution)}
      ${select("format", "Format", ["", "SVG", "PNG", "PDF", "STL", "DOTPAD"], st.format)}
      ${select("complexity", "Complexity", ["", "Low", "Medium", "High"], st.complexity)}
      ${select("verified", "Verification", ["", "true", "false"], st.verified, { true: "Verified", false: "Needs verification" })}
      <div class="tl-filter-title">Folders</div>
      ${FOLDERS.map((f) => `<button class="tl-folder ${st.folder === f ? "active" : ""}" data-act="folder" data-folder="${esc(f)}"><span>${esc(f)}</span><span>${folderCounts[f]}</span></button>`).join("")}
    `;
  }
  function select(name, label, values, value, labels = {}) {
    return `<label class="tl-filter-title" for="tl-${name}">${label}</label>
      <select class="tl-select" id="tl-${name}" data-act="filter" data-filter="${name}">
        ${values.map((v) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(v ? (labels[v] || v) : "All")}</option>`).join("")}
      </select>`;
  }
  function renderMain() {
    const main = bg.querySelector("#tlMain");
    if (st.loading) {
      main.innerHTML = `<div class="tl-loading"><div><span class="tl-spin"></span>Loading Tactile World Library…</div></div>`;
      return;
    }
    if (st.error) {
      main.innerHTML = `<div class="tl-error">${esc(st.error)}<br><button class="tl-btn" data-act="reload">Retry</button></div>`;
      return;
    }
    if (st.detailId) return renderDetail(main, assetById(st.detailId));
    if (st.tab === "history") return renderHistory(main);
    if (st.tab === "local") return renderLocal(main);
    const list = filteredAssets();
    announce(`${list.length} tactile library result${list.length === 1 ? "" : "s"} shown.`);
    main.innerHTML = `
      <section class="tl-hero">
        <h1>Tactile World Library</h1>
        <p>Browse tactile graphics, AI-generated tactile assets, and DotPad-ready learning materials.</p>
        <label class="tl-search">${iconCloud()}<input id="tlSearch" value="${esc(st.query)}" placeholder="Search maps, science diagrams, games, worksheets, heritage, math…" aria-label="Search tactile library"></label>
        <div class="tl-chip-row" aria-label="Categories">
          ${CATEGORIES.map((c) => `<button class="tl-chip ${st.category === c ? "active" : ""}" data-act="chip" data-category="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
      </section>
      <div class="tl-chip-row" aria-label="Featured collections">
        ${COLLECTIONS.map((c) => `<button class="tl-collection ${st.collection === c ? "active" : ""}" data-act="collection" data-collection="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>
      <div class="tl-section-head"><h3>${st.tab === "saved" ? "My Library" : st.tab === "team" ? "Team Library" : "Library Grid"}</h3><span class="tl-count">${list.length} results</span></div>
      ${list.length ? `<div class="tl-grid">${list.map((a) => formatAsset(a, savedIds())).join("")}</div>` : `<div class="tl-empty">No tactile graphics match the current filters.<br>Try clearing a filter or searching for another subject.</div>`}
    `;
    const input = main.querySelector("#tlSearch");
    input?.addEventListener("input", (e) => { st.query = e.target.value; render(); });
  }
  function renderHistory(main) {
    const h = history();
    main.innerHTML = `<div class="tl-section-head"><h3>Recently Viewed, Download History, and DotPad Sent History</h3></div>
      ${["recent", "sent", "downloads"].map((kind) => `<section class="tl-box"><h3>${kind === "recent" ? "Recently Viewed" : kind === "sent" ? "DotPad Sent History" : "Download History"}</h3>
        ${(h[kind] || []).length ? (h[kind] || []).map((x) => `<p><button class="tl-btn" data-act="detail" data-id="${esc(x.id)}">${esc(x.title)}</button></p>`).join("") : "<p>No history yet.</p>"}
      </section>`).join("")}`;
  }
  function renderLocal(main) {
    main.innerHTML = `<div class="tl-section-head"><h3>Drafts from Tactile Agent</h3><span class="tl-count">${st.localFiles.length} local files</span></div>
      ${st.localFiles.length ? st.localFiles.map((f) => `<div class="tl-local-row">
        ${f.thumb ? `<img src="${f.thumb}" alt="">` : `<img src="${svgUrl(f.name, "Draft", "tactile")}" alt="">`}
        <div><b>${esc(f.name)}</b><span>${f.width ? `${f.width}×${f.height}` : "DTMS"} · Saved in this browser</span></div>
        <button class="tl-btn primary" data-act="open-local" data-no="${esc(f.no)}" data-name="${esc(f.name)}">Open in Tactile Studio</button>
      </div>`).join("") : `<div class="tl-empty">No Studio drafts yet.<br>Use the app Save button to add the current canvas to My Library.</div>`}`;
  }
  function renderDetail(main, asset) {
    if (!asset) { st.detailId = ""; render(); return; }
    pushHistory("recent", asset);
    main.innerHTML = `<div class="tl-detail">
      <div class="tl-detail-actions">
        <button class="tl-btn" data-act="back">Back to results</button>
        <button class="tl-btn primary" data-act="send" data-id="${asset.id}">Send to DotPad</button>
        <button class="tl-btn" data-act="open-studio" data-id="${asset.id}">Open in Tactile Studio</button>
        <button class="tl-btn" data-act="adapt" data-id="${asset.id}">Adapt with Tactile Agent</button>
        <button class="tl-btn" data-act="download" data-id="${asset.id}">Download</button>
        <button class="tl-btn" data-act="save" data-id="${asset.id}">${savedIds().has(asset.id) ? "Saved in My Library" : "Add to My Library"}</button>
        <button class="tl-btn" data-act="share" data-id="${asset.id}">Share with Team</button>
      </div>
      <section class="tl-detail-hero">
        <div class="tl-box">
          <img class="tl-big-preview" src="${asset.thumbnailUrl}" alt="${esc(asset.altText)}">
          <div class="tl-preview-row">
            <img src="${asset.tactilePreviewUrl}" alt="${esc(asset.title)} 60 by 40 tactile preview">
            <img src="${svgUrl(asset.title, asset.category, "tactile")}" alt="${esc(asset.title)} 96 by 64 tactile preview">
          </div>
        </div>
        <div class="tl-box"><h3>Metadata</h3><div class="tl-meta">
          ${meta("Title", asset.title)}${meta("Category", asset.category)}${meta("Source", asset.source)}${meta("Created by", asset.createdBy)}
          ${meta("Last updated", asset.updatedAt)}${meta("Recommended use", asset.recommendedUse)}${meta("Age/grade", asset.ageLevel)}${meta("Complexity", asset.complexity)}
          ${meta("DotPad", asset.resolutionSupport.join(" / "))}${meta("Formats", asset.formats.join(", "))}${meta("License", asset.license)}${meta("Verified", asset.verified ? "Yes" : "Needs review")}
        </div></div>
      </section>
      <section class="tl-box"><h3>Accessibility Description</h3>
        <p><b>Short description:</b> ${esc(asset.description)}</p>
        <p><b>Tactile reading guide:</b> ${esc(asset.tactileGuide)}</p>
        <p><b>Important tactile landmarks:</b> ${asset.landmarks.map(esc).join(", ")}</p>
        <p><b>Suggested exploration order:</b> Anchor, outline, major landmark, secondary texture, label region.</p>
        <p><b>Alt text:</b> ${esc(asset.altText)}</p>
        <p><b>Screen reader summary:</b> ${esc(asset.screenReaderSummary)}</p>
      </section>
      <section class="tl-box"><h3>Quality Checklist</h3><ul>
        ${["Clear outline", "Low clutter", "Touch-readable spacing", "No unnecessary decorative detail", "DotPad output tested", "Teacher/designer verified"].map((x, i) => `<li>${asset.verified || i < 4 ? "✓" : "Needs review"} ${x}</li>`).join("")}
      </ul></section>
    </div>`;
  }
  function meta(k, v) { return `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`; }
  function renderAgent() {
    const asset = assetById(st.detailId) || filteredAssets()[0];
    bg.querySelector(".tl-agent").innerHTML = `<h3>Tactile Agent</h3>
      <p>Select an action to create a DotPad-ready adaptation, description, or classroom version.</p>
      <div class="tl-agent-list">${AGENT_ACTIONS.map((a) => `<button class="${st.agentAction === a ? "active" : ""}" data-act="agent" data-agent="${esc(a)}">${esc(a)}</button>`).join("")}</div>
      ${st.agentAction ? `<div class="tl-agent-result">
        <h4>${esc(st.agentAction)}</h4>
        ${st.agentDone ? `<div class="tl-before-after"><div><b>Before</b><br>${esc(asset?.readinessScore || "Needs Review")} · ${esc(asset?.complexity || "Medium")}</div><div><b>After</b><br>Good · Low complexity</div></div>
          <p>Suggested improvements: simplify small decorative marks, preserve outer contour, increase landmark spacing, and keep labels in a separate voice/braille explanation.</p>
          <button class="tl-btn primary" data-act="agent-save">Save as new library item</button>` : `<div class="tl-loading" style="min-height:90px"><div><span class="tl-spin"></span>Processing before/after preview…</div></div>`}
      </div>` : ""}`;
  }
  function render() { renderSide(); renderMain(); renderAgent(); }

  bg.addEventListener("click", async (e) => {
    if (e.target === bg) return close();
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "close") return close();
    if (act === "reload") return loadLocalFiles();
    if (act === "tab") { st.tab = el.dataset.tab; st.detailId = ""; render(); return; }
    if (act === "filter") { st[el.dataset.filter] = el.value; st.detailId = ""; render(); return; }
    if (act === "chip") { st.category = st.category === el.dataset.category ? "" : el.dataset.category; st.detailId = ""; render(); return; }
    if (act === "collection") { st.collection = st.collection === el.dataset.collection ? "" : el.dataset.collection; st.detailId = ""; render(); return; }
    if (act === "folder") { st.folder = st.folder === el.dataset.folder ? "" : el.dataset.folder; st.detailId = ""; render(); return; }
    if (act === "back") { st.detailId = ""; st.agentAction = ""; st.agentDone = false; render(); return; }
    if (act === "detail" || act === "adapt") { st.detailId = el.dataset.id; if (act === "adapt") st.agentAction = AGENT_ACTIONS[0]; st.agentDone = false; render(); if (act === "adapt") setTimeout(() => { st.agentDone = true; render(); }, 900); return; }
    if (act === "save") {
      const ids = savedIds(); ids.has(el.dataset.id) ? ids.delete(el.dataset.id) : ids.add(el.dataset.id); setSavedIds(ids);
      toast(ids.has(el.dataset.id) ? "Added to My Library" : "Removed from My Library"); render(); return;
    }
    if (act === "send") { const a = assetById(el.dataset.id); if (a) { pushHistory("sent", a); toast(`${a.title} sent to DotPad preview`); } render(); return; }
    if (act === "share") { toast("Team sharing mock created"); return; }
    if (act === "download") {
      const a = assetById(el.dataset.id); if (!a) return;
      pushHistory("downloads", a);
      const blob = new Blob([JSON.stringify(a, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `${a.id}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 500); toast("Download started"); render(); return;
    }
    if (act === "open-studio") {
      const a = assetById(el.dataset.id); if (!a || !onOpen) return;
      close(); onOpen(dtmsFor(a), `${a.id}.dtms`); return;
    }
    if (act === "open-local") {
      const dtms = await dotCloud.load({ driverKind: "P", fileNo: el.dataset.no });
      if (dtms != null && onOpen) { close(); onOpen(dtms, el.dataset.name || "library-item.dtms"); }
      return;
    }
    if (act === "agent") {
      st.agentAction = el.dataset.agent; st.agentDone = false; render();
      setTimeout(() => { st.agentDone = true; render(); }, 900); return;
    }
    if (act === "agent-save") { toast("Agent version saved as a new library draft"); return; }
  });
  bg.addEventListener("change", (e) => {
    const el = e.target.closest("[data-act='filter']");
    if (!el) return;
    st[el.dataset.filter] = el.value; st.detailId = ""; render();
  });
  bg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll("button,input,select,[tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  render();
  await loadLocalFiles();
  setTimeout(() => bg.querySelector(".tl-close")?.focus(), 30);
}
