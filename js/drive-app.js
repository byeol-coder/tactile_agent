// ── Tactile Drive: App ───────────────────────────────────────────
// Vanilla JS, no build step — same architecture as the main tactile_agent
// app (ge/qs/qsa helpers, innerHTML template rendering, event delegation,
// single aria-live announce channel). No React/Tailwind dependency.

import { CATEGORIES, CAT_BY_ID, READINESS, COMPLEXITY, FEATURED, AGENT_ACTIONS, SEED_ASSETS } from './drive-data.js';
import { dotMatrixSvg } from './drive-dot.js';
import { svgIcon } from './icons.js';

const ge = (id) => document.getElementById(id);
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── State ───────────────────────────────────────────────────── */
const state = {
  assets: SEED_ASSETS.map((a) => ({ ...a })),
  query: '',
  category: 'all',
  featured: 'all',
  filters: { source: new Set(), resolution: new Set(), format: new Set(), complexity: new Set(), sort: 'recent', savedOnly: false },
  loading: true,
  view: 'home', // home | detail | library
  selectedId: null,
  detailRes: '60x40',
  agentAssetId: null,
  agentPhase: 'idle', // idle | processing | done
  agentActionId: null,
  connected: false,
  viewedIds: new Set(),
  draftIds: new Set(),
  libraryTab: 'mine',
};
let agentTriggerEl = null; // element to restore focus to when the agent modal closes

/* ── Toast / announce (single live-region channel, matches app.js) ─ */
let toastTimer = null;
function toast(msg, kind = '') {
  const el = ge('td-toast');
  if (el) {
    el.textContent = msg;
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  announce(msg, kind === 'err' ? 'assertive' : 'polite');
}
function announce(text, priority = 'polite') {
  const live = ge('td-live');
  if (!live || !text) return;
  if (live.getAttribute('aria-live') !== priority) live.setAttribute('aria-live', priority);
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 40);
}
let announceCountTimer = null;
function announceResultCountDebounced(n) {
  clearTimeout(announceCountTimer);
  announceCountTimer = setTimeout(() => announce(`검색 결과 ${n}개`), 500);
}

/* ── Badges ──────────────────────────────────────────────────── */
function badge(tone, iconName, label) {
  const icon = iconName ? svgIcon(iconName) : '';
  return `<span class="badge ${tone}">${icon}${esc(label)}</span>`;
}
function readinessBadge(level) {
  const r = READINESS[level] || READINESS.good;
  const tone = level === 'good' ? 'good' : level === 'review' ? 'warn' : 'bad';
  const icon = level === 'good' ? 'check' : 'alert';
  return badge(tone, icon, r.label);
}
function dotPadReadyBadge(resolutionSupport) {
  if (resolutionSupport?.includes('60x40')) return badge('accent', 'plugZap', 'DotPad 60×40 준비 완료');
  if (resolutionSupport?.length) return badge('neutral', 'plug', `DotPad ${resolutionSupport.join(' · ')} 준비 완료`);
  return badge('neutral', 'plug', 'DotPad 준비 대기');
}
function complexityBadge(level) {
  const tone = level === 'low' ? 'good' : level === 'medium' ? 'warn' : 'bad';
  return badge(tone, 'layers', `복잡도 ${COMPLEXITY[level] || '—'}`);
}
function readabilityBadge(score) {
  if (score == null) return badge('neutral', 'gauge', '검수 대기');
  const tone = score >= 90 ? 'good' : score >= 78 ? 'warn' : 'bad';
  const label = score >= 90 ? '판독성 좋음' : score >= 78 ? '판독성 보통' : '판독성 낮음';
  return badge(tone, 'gauge', `${label} ${score}%`);
}
function verifiedStateBadge(a) {
  return a.verified ? badge('verified', 'shieldCheck', '검수 완료') : badge('warn', 'clock', '검수 대기');
}
function sourceBadge(source) {
  return source === 'Tactile Agent' ? badge('accent', 'sparkle', source) : badge('neutral', null, source);
}
function primaryCardSignal(a) {
  if (a.verified) return verifiedStateBadge(a);
  if (a.resolutionSupport?.length) return dotPadReadyBadge(a.resolutionSupport);
  return verifiedStateBadge(a);
}
function categoryTileHtml(categoryId) {
  const c = CAT_BY_ID[categoryId] || CATEGORIES[0];
  return `<div class="card-thumb-icon">${svgIcon(c.icon)}</div>`;
}

/* ── Filtering ───────────────────────────────────────────────── */
function getFiltered() {
  let list = state.assets;
  if (state.category === 'agent') list = list.filter((a) => a.source === 'Tactile Agent');
  else if (state.category === 'dotpadready') list = list.filter((a) => a.resolutionSupport.length > 0);
  else if (state.category !== 'all') list = list.filter((a) => a.category === state.category);

  if (state.featured === 'dotpad6040') list = list.filter((a) => a.resolutionSupport.includes('60x40'));
  else if (state.featured === 'teacher') list = list.filter((a) => a.source !== 'Tactile Agent' && ['education', 'math', 'science'].includes(a.category));
  else if (state.featured === 'agent') list = list.filter((a) => a.source === 'Tactile Agent');
  else if (state.featured === 'verified') list = list.filter((a) => a.verified);

  const q = state.query.trim().toLowerCase();
  if (q) {
    list = list.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q)) ||
      a.landmarks.some((l) => l.toLowerCase().includes(q)) ||
      (CAT_BY_ID[a.category]?.ko || '').includes(q)
    );
  }
  const f = state.filters;
  if (f.source.size) list = list.filter((a) => f.source.has(a.source) || (f.source.has('Verified') && a.verified));
  if (f.resolution.size) list = list.filter((a) => a.resolutionSupport.some((r) => f.resolution.has(r)));
  if (f.format.size) list = list.filter((a) => a.formats.some((fm) => f.format.has(fm)));
  if (f.complexity.size) list = list.filter((a) => f.complexity.has(a.complexity));
  if (f.savedOnly) list = list.filter((a) => a.saved);

  list = [...list];
  if (f.sort === 'used') list.sort((a, b) => (b.dotPadTested ? 1 : 0) - (a.dotPadTested ? 1 : 0));
  else list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return list;
}

/* ── Card ────────────────────────────────────────────────────── */
function renderCard(a) {
  const cat = CAT_BY_ID[a.category];
  return `
  <article class="asset-card">
    <button type="button" class="card-thumb" data-action="open" data-id="${a.id}" aria-label="${esc(a.title)} 상세보기">
      ${categoryTileHtml(a.category)}
      <span class="card-dotpreview">${dotMatrixSvg(a.id, '60x40', { cell: 4 })}</span>
      ${a.verified ? `<span class="card-verified">${badge('verified', 'shieldCheck', '검수 완료')}</span>` : ''}
    </button>
    <div class="card-body">
      <div class="card-title-row">
        <button type="button" class="card-title" data-action="open" data-id="${a.id}">${esc(a.title)}</button>
        <button type="button" class="save-btn" data-action="toggle-save" data-id="${a.id}" aria-pressed="${a.saved}" aria-label="${a.saved ? `${esc(a.title)} 저장 해제` : `${esc(a.title)} 내 라이브러리에 저장`}">
          ${svgIcon(a.saved ? 'bookmarkOn' : 'bookmark')}
        </button>
      </div>
      <div class="badge-row">${badge('neutral', null, cat?.ko)}${sourceBadge(a.source)}</div>
      <div class="badge-row">${primaryCardSignal(a)}</div>
      <div class="card-actions">
        <button type="button" class="btn btn-secondary sm" data-action="open" data-id="${a.id}">${svgIcon('eye')}보기</button>
        <button type="button" class="btn btn-secondary sm icon-only" data-action="send" data-id="${a.id}" aria-label="${esc(a.title)} DotPad로 보내기">${svgIcon('send')}</button>
        <button type="button" class="btn btn-secondary sm icon-only" data-action="adapt" data-id="${a.id}" aria-label="${esc(a.title)} Tactile Agent로 보정하기">${svgIcon('sparkle')}</button>
      </div>
    </div>
  </article>`;
}

function skeletonCards(n) {
  return Array.from({ length: n }).map(() => `
    <div class="skeleton-card">
      <div class="sk-thumb"></div>
      <div class="sk-body">
        <div class="sk-line" style="width:75%;height:15px"></div>
        <div class="sk-line" style="width:45%"></div>
        <div class="sk-line" style="width:100%;height:26px;margin-top:6px"></div>
      </div>
    </div>`).join('');
}

function emptyStateHtml() {
  return `
    <div class="empty-state">
      <div class="empty-dots">${dotMatrixSvg('empty-state', '60x40', { cell: 3 })}</div>
      <h3>조건에 맞는 자료가 없어요</h3>
      <p>검색어나 필터를 조정하면 다른 자료를 찾을 수 있어요.</p>
      <button type="button" class="btn btn-primary" data-action="reset-filters">${svgIcon('refresh')}필터 초기화</button>
    </div>`;
}

function assetGridHtml(list, loading) {
  if (loading) return `<div class="asset-grid">${skeletonCards(6)}</div>`;
  if (!list.length) return emptyStateHtml();
  return `<div class="asset-grid">${list.map(renderCard).join('')}</div>`;
}

/* ── Filter panel ────────────────────────────────────────────── */
function checkRow(group, value, checked, label) {
  return `<label class="filter-row">
    <input type="checkbox" data-filter-group="${group}" data-filter-value="${esc(value)}" ${checked ? 'checked' : ''}/>
    ${esc(label)}
  </label>`;
}
function filterPanelHtml(resultCount) {
  const f = state.filters;
  const sortOptions = [
    { id: 'recent', label: '최근 추가순' },
    { id: 'used', label: '많이 사용됨' },
  ];
  return `
  <aside class="td-filter" aria-label="필터">
    <div class="filter-card">
      <div class="filter-head">
        <h2>필터</h2>
        <button type="button" class="filter-reset" data-action="reset-filters">초기화</button>
      </div>
      <p class="filter-count">${resultCount}개 결과</p>

      <div class="filter-section">
        <p class="filter-section-title">출처</p>
        ${checkRow('source', 'Tactile World', f.source.has('Tactile World'), 'Tactile World')}
        ${checkRow('source', 'Tactile Agent', f.source.has('Tactile Agent'), 'Tactile Agent')}
        ${checkRow('source', 'Uploaded', f.source.has('Uploaded'), '직접 업로드')}
        ${checkRow('source', 'Verified', f.source.has('Verified'), '검수 완료 자료만')}
        ${checkRow('savedOnly', 'true', f.savedOnly, '내가 저장한 자료만')}
      </div>
      <div class="filter-section">
        <p class="filter-section-title">DotPad 해상도</p>
        ${checkRow('resolution', '60x40', f.resolution.has('60x40'), '60 × 40')}
        ${checkRow('resolution', '96x64', f.resolution.has('96x64'), '96 × 64')}
      </div>
      <div class="filter-section">
        <p class="filter-section-title">형식</p>
        ${['SVG', 'PNG', 'PDF', 'STL', 'DOTPAD'].map((fm) => checkRow('format', fm, f.format.has(fm), fm)).join('')}
        <p class="filter-help">DOTPAD는 점 배열과 해상도 정보를 함께 저장한 즉시 출력용 형식입니다.</p>
      </div>
      <div class="filter-section">
        <p class="filter-section-title">복잡도</p>
        ${Object.entries(COMPLEXITY).map(([k, v]) => checkRow('complexity', k, f.complexity.has(k), v)).join('')}
      </div>
      <div class="filter-section">
        <p class="filter-section-title">정렬</p>
        ${sortOptions.map((s) => `
          <label class="filter-row">
            <input type="radio" name="td-sort" data-filter-group="sort" data-filter-value="${s.id}" ${f.sort === s.id ? 'checked' : ''}/>
            ${esc(s.label)}
          </label>`).join('')}
      </div>
    </div>
  </aside>`;
}

/* ── Home view ───────────────────────────────────────────────── */
function categoryChipsHtml() {
  const items = [
    { id: 'all', ko: '전체' },
    ...CATEGORIES,
    { id: 'agent', ko: 'Tactile Agent' },
    { id: 'dotpadready', ko: 'DotPad 준비 완료' },
  ];
  return `<div class="chip-row" role="group" aria-label="카테고리 필터">${items.map((c) =>
    `<button type="button" class="cat-chip" data-action="category" data-cat="${c.id}" aria-pressed="${state.category === c.id}">${esc(c.ko)}</button>`
  ).join('')}</div>`;
}

function renderHome() {
  const filtered = getFiltered();
  ge('td-main').innerHTML = `
    <section class="td-hero">
      <h1>텍타일 드라이브</h1>
      <p>촉각 그래픽, AI로 생성한 촉각 자료, DotPad 학습 자료를 한곳에서 찾아보세요.</p>
      <div class="td-search lg">
        <span aria-hidden="true">${svgIcon('search')}</span>
        <input type="search" id="td-hero-search" aria-label="텍타일 드라이브 자료 검색" placeholder="지도, 과학 도표, 게임, 학습지, 문화, 수학 검색…" value="${esc(state.query)}"/>
      </div>
      ${categoryChipsHtml()}
    </section>

    <div class="featured-row" aria-label="추천 컬렉션">
      ${FEATURED.map((f) => `<button type="button" class="featured-pill" data-action="featured" data-featured="${f.id}" aria-pressed="${state.featured === f.id}">${esc(f.label)}</button>`).join('')}
    </div>

    <div class="td-body">
      ${filterPanelHtml(filtered.length)}
      <div class="td-grid">${assetGridHtml(filtered, state.loading)}</div>
    </div>`;

  const hero = ge('td-hero-search');
  hero?.addEventListener('input', (e) => { state.query = e.target.value; syncSearchInputs(); renderHome(); });

  if (!state.loading) announceResultCountDebounced(filtered.length);
}

/* ── Detail view ─────────────────────────────────────────────── */
function checklistFor(a) {
  return [
    { ok: a.complexity !== 'high', label: '명확한 윤곽선' },
    { ok: a.readinessScore !== 'complex', label: '낮은 시각적 혼잡도' },
    { ok: a.dotPadTested, label: 'DotPad 출력 테스트 완료' },
    { ok: a.verified, label: '교사/디자이너 검수 완료' },
  ];
}
function checklistHtml(a) {
  return `<ul class="checklist">${checklistFor(a).map((c) => `
    <li>
      <span class="check-dot ${c.ok ? 'ok' : 'no'}">${svgIcon(c.ok ? 'check' : 'x')}</span>
      <span>${esc(c.label)}</span>
      <span class="sr-only">${c.ok ? '충족' : '미충족'}</span>
    </li>`).join('')}</ul>`;
}
function reviewBoxTone(a) {
  if (!a.reviewer) return 'pending';
  if (!a.verified || /대기|권장|필요|좁음|불균일|추가/.test(a.reviewer.comment)) return 'warn';
  return 'good';
}
function metaRow(label, value) {
  if (!value) return '';
  return `<div class="meta-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function renderDetail() {
  const a = state.assets.find((x) => x.id === state.selectedId);
  if (!a) { state.view = 'home'; renderHome(); return; }
  const cat = CAT_BY_ID[a.category];

  ge('td-main').innerHTML = `
    <button type="button" class="back-link" data-action="back">${svgIcon('arrowLeft')}라이브러리로 돌아가기</button>
    <div class="detail-grid">
      <div>
        <div class="detail-head">
          <div>
            <h1 tabindex="-1">${esc(a.title)}</h1>
            <div class="badge-row">
              ${badge('neutral', null, cat?.ko)}${sourceBadge(a.source)}
              ${verifiedStateBadge(a)}
              ${readinessBadge(a.readinessScore)}
              ${readabilityBadge(a.tactileReadability)}
            </div>
          </div>
          <button type="button" class="btn btn-secondary" data-action="toggle-save" data-id="${a.id}" aria-pressed="${a.saved}">
            ${svgIcon(a.saved ? 'bookmarkOn' : 'bookmark')}${a.saved ? '저장됨' : '내 라이브러리에 저장'}
          </button>
        </div>

        <p class="report-visual-lbl">원본 이미지</p>
        <div class="detail-visual">${categoryTileHtml(a.category)}</div>

        <p class="report-visual-lbl">촉각그래픽 미리보기</p>
        <div class="detail-visual" style="height:150px">${dotMatrixSvg(a.id + '-tactile', state.detailRes, { cell: 5 })}</div>

        <div class="res-tabs" role="group" aria-label="DotPad 미리보기 해상도">
          ${['60x40', '96x64'].map((r) => {
            const disabled = !a.resolutionSupport.includes(r);
            return `<button type="button" class="res-tab" aria-pressed="${state.detailRes === r}" data-action="res-tab" data-res="${r}" ${disabled ? 'disabled' : ''}>DotPad ${r.replace('x', ' × ')} 미리보기${disabled ? ' (미지원)' : ''}</button>`;
          }).join('')}
        </div>
        <div class="detail-tactile">${dotMatrixSvg(a.id, state.detailRes, { cell: 8 })}</div>

        <section class="panel-block" aria-labelledby="a11y-desc-h">
          <h2 id="a11y-desc-h">촉각그래픽 검수 리포트</h2>
          <dl class="a11y-dl">
            <dt>간단 설명</dt><dd>${esc(a.description)}</dd>
            <dt>촉각 탐색 순서</dt><dd>${esc(a.tactileGuide)}</dd>
            <dt>주요 랜드마크</dt><dd><ul>${a.landmarks.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></dd>
            <dt>단순화 정도</dt><dd>${esc(a.simplification || '검수 대기')}</dd>
            <dt>선 굵기/간격 체크</dt><dd>${esc(a.lineSpec || '검수 대기')}</dd>
            <dt>장식 요소 제거 여부</dt><dd>
              <span class="check-dot ${a.decorativeRemoved ? 'ok' : 'no'}" style="display:inline-flex;width:18px;height:18px;vertical-align:middle;margin-right:6px">${svgIcon(a.decorativeRemoved ? 'check' : 'x')}</span>
              ${a.decorativeRemoved ? '제거 완료' : '검수 대기'}
            </dd>
            <dt>대체 텍스트 (Alt)</dt><dd>${esc(a.title)} — ${esc(a.description)}</dd>
            <dt>스크린리더 설명</dt><dd>${esc(a.screenReaderDesc || `${cat?.ko} 카테고리 자료입니다. 먼저 전체 윤곽을 확인한 뒤 주요 랜드마크를 순서대로 탐색하세요.`)}</dd>
          </dl>
        </section>

        <section class="panel-block" aria-labelledby="quality-h">
          <h2 id="quality-h">품질 체크리스트</h2>
          ${checklistHtml(a)}
        </section>

        <section class="panel-block" aria-labelledby="reviewer-h">
          <h2 id="reviewer-h">검수자 코멘트</h2>
          ${a.reviewer
            ? `<div class="review-box ${reviewBoxTone(a)}">${esc(a.reviewer.comment)}</div>
               <div class="review-meta"><span>${esc(a.reviewer.name)}</span><span>${esc(a.reviewer.date)}</span></div>`
            : `<p class="review-pending">검수 대기</p>`}
        </section>
      </div>

      <div class="side-col">
        <div class="panel-block">
          <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:var(--sub)">자료 정보</h2>
          <dl>
            ${metaRow('제작자', a.createdBy)}
            ${metaRow('최근 업데이트', a.updatedAt)}
            ${metaRow('권장 사용처', a.recommendedUse)}
            ${metaRow('대상 연령', a.ageLevel)}
            ${metaRow('복잡도', COMPLEXITY[a.complexity])}
            ${metaRow('DotPad 해상도', a.resolutionSupport.join(', '))}
            ${metaRow('파일 형식', a.formats.join(', '))}
            ${metaRow('라이선스', a.license)}
          </dl>
        </div>
        <div class="panel-block action-stack">
          <button type="button" class="btn btn-primary" data-action="send" data-id="${a.id}">${svgIcon('send')}DotPad로 보내기</button>
          ${!state.connected ? `<p class="conn-warn">${svgIcon('alert')}DotPad 미연결 — 연결 후 전송돼요</p>` : ''}
          <button type="button" class="btn btn-secondary" data-action="studio">${svgIcon('layers')}Tactile Studio에서 열기</button>
          <button type="button" class="btn btn-secondary" data-action="adapt" data-id="${a.id}">${svgIcon('sparkle')}Tactile Agent로 보정</button>
          <button type="button" class="btn btn-secondary" data-action="download">${svgIcon('download')}다운로드</button>
          <button type="button" class="btn btn-secondary" data-action="toggle-save" data-id="${a.id}">${svgIcon('bookmarkOn')}${a.saved ? '내 라이브러리에서 제거' : '내 라이브러리에 추가'}</button>
          <button type="button" class="btn btn-ghost" data-action="share">${svgIcon('users')}팀과 공유</button>
        </div>
      </div>
    </div>`;

  qs('.detail-head h1')?.focus?.();
}

/* ── My Library view ─────────────────────────────────────────── */
const LIB_TABS = [
  { id: 'mine', label: '내 라이브러리', icon: 'user' },
  { id: 'team', label: '팀 라이브러리', icon: 'users' },
  { id: 'recent', label: '최근 본 자료', icon: 'clock' },
  { id: 'drafts', label: 'Tactile Agent 초안', icon: 'sparkle' },
];
const FOLDERS = ['수업 자료', 'DotPad 테스트', '게임 에셋', 'Tactile Studio 초안', '검수 완료 자료'];

function libraryListFor(tab) {
  if (tab === 'mine') return state.assets.filter((a) => a.saved);
  if (tab === 'team') return state.assets.filter((a) => a.verified).slice(0, 6);
  if (tab === 'recent') return state.assets.filter((a) => state.viewedIds.has(a.id));
  if (tab === 'drafts') return state.assets.filter((a) => state.draftIds.has(a.id));
  return [];
}
function libraryEmptyMsg(tab) {
  return {
    mine: '아직 저장한 자료가 없어요',
    team: '팀에 공유된 검수 완료 자료가 없어요',
    recent: '최근 열람한 자료가 없어요',
    drafts: 'Tactile Agent로 만든 초안이 없어요',
  }[tab];
}

function renderLibrary() {
  const list = libraryListFor(state.libraryTab);
  ge('td-main').innerHTML = `
    <h1 tabindex="-1" style="font-size:20px;font-weight:800;margin:0 0 4px">내 라이브러리</h1>
    <p style="font-size:13px;color:var(--sub);margin:0 0 20px">저장한 자료, 팀 자료, 최근 열람 기록, Tactile Agent 초안을 관리하세요.</p>

    <div class="lib-tabs" role="group" aria-label="내 라이브러리 보기">
      ${LIB_TABS.map((t) => `
        <button type="button" class="lib-tab" aria-pressed="${state.libraryTab === t.id}" data-action="lib-tab" data-tab="${t.id}">
          ${svgIcon(t.icon)}${esc(t.label)}
        </button>`).join('')}
    </div>

    ${state.libraryTab === 'mine' ? `
      <div class="folder-row">
        ${FOLDERS.map((f) => `<span class="folder-chip">${svgIcon('folder')}${esc(f)}</span>`).join('')}
      </div>` : ''}

    ${list.length === 0
      ? `<div class="lib-empty"><p>${esc(libraryEmptyMsg(state.libraryTab))}</p><p>라이브러리에서 자료를 저장하거나 열어보면 여기 표시돼요.</p></div>`
      : `<div class="asset-grid">${list.map(renderCard).join('')}</div>`}
  `;
  qs('h1[tabindex="-1"]')?.focus?.();
}

/* ── Agent panel (modal) ─────────────────────────────────────── */
function agentActionLabel(id) {
  return AGENT_ACTIONS.find((a) => a.id === id)?.label || '';
}
function renderAgentModal() {
  const root = ge('td-agent-root');
  const a = state.assets.find((x) => x.id === state.agentAssetId);
  if (!a) { root.innerHTML = ''; return; }

  let body = '';
  if (state.agentPhase === 'idle') {
    body = `
      <p style="font-size:13px;color:var(--sub);margin:0 0 12px">이 자료에 적용할 작업을 선택하세요.</p>
      <div class="agent-grid">
        ${AGENT_ACTIONS.map((act) => `
          <button type="button" class="agent-action" data-action="agent-run" data-id="${act.id}">
            <span class="agent-icon">${svgIcon(act.icon)}</span>${esc(act.label)}
          </button>`).join('')}
      </div>`;
  } else if (state.agentPhase === 'processing') {
    body = `
      <div class="agent-processing" role="status" aria-live="polite">
        <span class="spin">${svgIcon('spinner')}</span>
        <p class="a-title">${esc(agentActionLabel(state.agentActionId))} 처리 중…</p>
        <p class="a-sub">잠시만 기다려 주세요.</p>
      </div>`;
  } else if (state.agentPhase === 'done') {
    body = `
      <div class="ba-grid">
        <div>
          <p class="ba-label">이전</p>
          <div class="ba-preview">${dotMatrixSvg(a.id, '60x40', { cell: 5 })}</div>
        </div>
        <div>
          <p class="ba-label after">이후</p>
          <div class="ba-preview after">${dotMatrixSvg(a.id + state.agentActionId, '60x40', { cell: 5 })}</div>
        </div>
      </div>
      <div class="agent-note">${svgIcon('info')}<span>점 밀도를 12% 낮추고 끊긴 윤곽선 3곳을 연결했어요. 손끝으로 구분하기 더 쉬워졌어요.</span></div>
      <div class="agent-footer">
        <button type="button" class="btn btn-secondary" data-action="agent-idle">다른 작업 선택</button>
        <button type="button" class="btn btn-primary" data-action="agent-save-new">${svgIcon('check')}새 자료로 저장</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="modal-backdrop" id="td-agent-backdrop">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="td-agent-title">
        <div class="modal-header">
          <div>
            <h2 id="td-agent-title">${svgIcon('sparkle')}Tactile Agent</h2>
            <p>${esc(a.title)}</p>
          </div>
          <button type="button" class="modal-close" data-action="agent-close" aria-label="Tactile Agent 패널 닫기">${svgIcon('x')}</button>
        </div>
        <div class="modal-body">${body}</div>
      </div>
    </div>`;

  setupModalFocusTrap();
}

function setupModalFocusTrap() {
  const box = qs('.modal-box', ge('td-agent-root'));
  if (!box) return;
  const focusables = () => qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', box);
  focusables()[0]?.focus();

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeAgent(); return; }
    if (e.key === 'Tab') {
      const list = focusables();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  box._cleanupTrap = () => document.removeEventListener('keydown', onKey, true);
}

function openAgent(id, triggerEl) {
  state.agentAssetId = id;
  state.agentPhase = 'idle';
  state.agentActionId = null;
  agentTriggerEl = triggerEl || document.activeElement;
  renderAgentModal();
}
function closeAgent() {
  const box = qs('.modal-box', ge('td-agent-root'));
  box?._cleanupTrap?.();
  state.agentAssetId = null;
  ge('td-agent-root').innerHTML = '';
  agentTriggerEl?.focus?.();
}

/* ── Actions ─────────────────────────────────────────────────── */
function openAsset(id) {
  state.selectedId = id;
  state.view = 'detail';
  state.detailRes = '60x40';
  state.viewedIds.add(id);
  renderDetail();
  window.scrollTo(0, 0);
}
function toggleSave(id) {
  const a = state.assets.find((x) => x.id === id);
  if (!a) return;
  a.saved = !a.saved;
  toast(a.saved ? '내 라이브러리에 저장했어요' : '저장을 해제했어요', 'ok');
  syncNavLibraryLabel();
  rerenderCurrentView();
}
function sendToDotPad(id) {
  const a = state.assets.find((x) => x.id === id);
  if (!a) return;
  if (!state.connected) { toast('DotPad가 연결되어 있지 않아요', 'err'); return; }
  toast(`${a.title} 전송을 시작했어요`, 'ok');
}
function saveAgentDraft() {
  const a = state.assets.find((x) => x.id === state.agentAssetId);
  if (!a) return;
  const label = agentActionLabel(state.agentActionId);
  const newId = `${a.id}-agent-${Date.now()}`;
  state.assets.unshift({ ...a, id: newId, title: `${a.title} (${label})`, source: 'Tactile Agent', saved: false, verified: false, readinessScore: 'good' });
  state.draftIds.add(newId);
  toast('Tactile Agent 결과를 새 자료로 저장했어요', 'ok');
  closeAgent();
  rerenderCurrentView();
}
function resetFilters() {
  state.filters = { source: new Set(), resolution: new Set(), format: new Set(), complexity: new Set(), sort: 'recent', savedOnly: false };
  state.category = 'all';
  state.featured = 'all';
  state.query = '';
  syncSearchInputs();
  renderHome();
}
function rerenderCurrentView() {
  if (state.view === 'home') renderHome();
  else if (state.view === 'detail') renderDetail();
  else if (state.view === 'library') renderLibrary();
}

/* ── Header sync (persistent chrome, not re-rendered per view) ─── */
function syncSearchInputs() {
  [ge('td-search-desktop-input'), ge('td-search-mobile-input')].forEach((el) => { if (el && el.value !== state.query) el.value = state.query; });
}
function syncNavLibraryLabel() {
  const savedCount = state.assets.filter((a) => a.saved).length;
  const btn = ge('td-nav-library');
  if (btn) btn.innerHTML = `${svgIcon('bookmark')}내 라이브러리${savedCount ? ` (${savedCount})` : ''}`;
}
function syncConnToggle() {
  const btn = ge('td-conn-toggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(state.connected));
  btn.style.color = state.connected ? 'var(--green-d)' : 'var(--sub)';
  btn.innerHTML = `${svgIcon(state.connected ? 'plugZap' : 'plug')}${state.connected ? 'DotPad 연결됨' : 'DotPad 미연결'}`;
}
function syncNavActive() {
  ge('td-nav-home')?.classList.toggle('btn-secondary', state.view === 'home');
  ge('td-nav-home')?.classList.toggle('btn-ghost', state.view !== 'home');
  ge('td-nav-library')?.classList.toggle('btn-secondary', state.view === 'library');
  ge('td-nav-library')?.classList.toggle('btn-ghost', state.view !== 'library');
}

/* ── Event delegation (bound once; survives innerHTML re-renders) ─ */
function initHeader() {
  ge('td-search-icon-1').innerHTML = svgIcon('search');
  ge('td-search-icon-2').innerHTML = svgIcon('search');
  syncNavLibraryLabel();
  syncConnToggle();

  ge('td-brand-btn').addEventListener('click', () => { state.view = 'home'; renderHome(); syncNavActive(); });
  ge('td-nav-home').addEventListener('click', () => { state.view = 'home'; renderHome(); syncNavActive(); });
  ge('td-nav-library').addEventListener('click', () => { state.view = 'library'; renderLibrary(); syncNavActive(); });
  ge('td-conn-toggle').addEventListener('click', () => { state.connected = !state.connected; syncConnToggle(); rerenderCurrentView(); });

  ge('td-search-desktop-input').addEventListener('input', (e) => {
    state.query = e.target.value; syncSearchInputs();
    if (state.view !== 'home') { state.view = 'home'; }
    renderHome(); syncNavActive();
  });
  ge('td-search-mobile-input').addEventListener('input', (e) => {
    state.query = e.target.value; syncSearchInputs();
    if (state.view !== 'home') { state.view = 'home'; }
    renderHome(); syncNavActive();
  });
}

function initMainDelegation() {
  const main = ge('td-main');

  main.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'open') openAsset(id);
    else if (action === 'toggle-save') toggleSave(id);
    else if (action === 'send') sendToDotPad(id);
    else if (action === 'adapt') openAgent(id, btn);
    else if (action === 'category') { state.category = btn.dataset.cat; renderHome(); }
    else if (action === 'featured') {
      state.featured = state.featured === btn.dataset.featured ? 'all' : btn.dataset.featured;
      if (state.featured === 'recent') state.filters.sort = 'recent';
      renderHome();
    }
    else if (action === 'reset-filters') resetFilters();
    else if (action === 'back') { state.view = 'home'; renderHome(); syncNavActive(); }
    else if (action === 'res-tab') { if (!btn.disabled) { state.detailRes = btn.dataset.res; renderDetail(); } }
    else if (action === 'lib-tab') { state.libraryTab = btn.dataset.tab; renderLibrary(); }
    else if (action === 'studio') toast('Tactile Studio에서 열었어요 (mock)', 'ok');
    else if (action === 'download') toast('다운로드를 시작했어요 (mock)', 'ok');
    else if (action === 'share') toast('팀에 공유했어요 (mock)', 'ok');
  });

  main.addEventListener('change', (e) => {
    const el = e.target.closest('[data-filter-group]');
    if (!el) return;
    const group = el.dataset.filterGroup, value = el.dataset.filterValue;
    if (group === 'sort') { state.filters.sort = value; renderHome(); return; }
    if (group === 'savedOnly') { state.filters.savedOnly = el.checked; renderHome(); return; }
    const set = state.filters[group];
    if (!set) return;
    el.checked ? set.add(value) : set.delete(value);
    renderHome();
  });
}

function initAgentDelegation() {
  ge('td-agent-root').addEventListener('click', (e) => {
    if (e.target.id === 'td-agent-backdrop') { closeAgent(); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'agent-close') closeAgent();
    else if (action === 'agent-idle') { state.agentPhase = 'idle'; state.agentActionId = null; renderAgentModal(); }
    else if (action === 'agent-run') {
      state.agentActionId = btn.dataset.id;
      state.agentPhase = 'processing';
      renderAgentModal();
      setTimeout(() => {
        state.agentPhase = 'done';
        renderAgentModal();
        announce(`${agentActionLabel(state.agentActionId)} 작업이 완료됐어요.`);
      }, 1300);
    } else if (action === 'agent-save-new') saveAgentDraft();
  });
}

/* ── Init ────────────────────────────────────────────────────── */
function init() {
  initHeader();
  initMainDelegation();
  initAgentDelegation();
  renderHome();
  setTimeout(() => { state.loading = false; renderHome(); }, 700);
}

document.addEventListener('DOMContentLoaded', init);
