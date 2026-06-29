// ── App Coordinator ───────────────────────────────────────────
// Wires up state, engine, canvas, dotpad, and UI.
// All event handling lives here.

import {
  appState, pagesState, canvasState, conversionState,
  viewportState, toolState, brailleState, dotPadState,
  saveCurrentPageState, loadPageState, addPage, duplicatePage,
  deletePage, setActivePageSourceImage, updateActivePage,
  createBlankPage,
} from './state.js';

import {
  createSourceImageState, analyzeImageType,
  convertToDots, autoSelectParams, optimizeForDotPad,
  tactileQualityScore, gradeReason, analyzeDensity, autoThinDots,
  gridToHex, hexToGrid, textToBraillePages,
} from './engine.js';

import { interpretCommand, QUICK_COMMANDS } from './commands.js';
import { drawPrimitive, renderBrailleGrid, describeTactile } from './generate.js';
import { initBank, loadSymbol } from './bank.js';
import { svgIcon } from './icons.js';
import { renderMathGraph } from './mathgraph.js';
import { setSonify, sonifyMove, sonifySweep, isSonifyEnabled } from './sense.js';

import {
  computeCanvasLayout, applyLayout, renderGrid,
  getPointerCell, getBrushCells, bresenhamLine,
} from './canvas.js';

import {
  initDotPad, connectBle, connectUsb, disconnectDotPad,
  sendGraphicData, sendBrailleText, allPinsUp, allPinsDown, syncLivePreview,
} from './dotpad.js';

import { exportDtms, exportPng, exportJson, copyHexToClipboard, parseDtms } from './export.js';
import { t } from './i18n.js';

// ─── DOM helpers ──────────────────────────────────────────────
const ge  = id => document.getElementById(id);
const qs  = s  => document.querySelector(s);
const qsa = s  => [...document.querySelectorAll(s)];

// ─── Toast ────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg, kind = '') {
  const el = ge('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ─── Canvas elements ──────────────────────────────────────────
let padEl, ctx, layout;
let bankReady = false;   // symbol bank loaded (see initBank in init())

function initCanvas() {
  const canvasId = appState.mode === 'full' ? 'pad' : 'pad-mini';
  padEl = ge(canvasId) || ge('pad');
  if (!padEl) return;
  ctx = padEl.getContext('2d');
  fitCanvas();
}

function fitCanvas() {
  const area = qs('.canvas-area') || qs('.mini-canvas-card');
  if (!area || !padEl) return;
  const aw = Math.max(240, area.clientWidth  - 24);
  const ah = Math.max(160, area.clientHeight - 24);
  layout = computeCanvasLayout(aw, ah, canvasState.width, canvasState.height, viewportState.zoom);
  applyLayout(padEl, layout);
  drawCanvas();
}

function drawCanvas() {
  if (!ctx || !layout) return;
  renderGrid(ctx, canvasState.data, canvasState.width, canvasState.height, layout, {
    hoverCells: toolState.hoverBrush || [],
    hoverKind:  toolState.currentTool,
    selection:  toolState.selection,
  });
}

// ─── App Phase ────────────────────────────────────────────────
function setPhase(phase) {
  appState.phase = phase;
  document.body.dataset.state = phase;
  syncBottomBar();
  if (phase === 'ready') {
    const badge = qs('.ai-done-badge');
    if (badge) badge.style.display = '';
  }
}

// ─── Undo / Redo ──────────────────────────────────────────────
function pushUndo() {
  toolState.undoStack.push(new Uint8Array(canvasState.data));
  toolState.redoStack = [];
  if (toolState.undoStack.length > 60) toolState.undoStack.shift();
}

function undo() {
  if (!toolState.undoStack.length) return;
  toolState.redoStack.push(new Uint8Array(canvasState.data));
  canvasState.data = toolState.undoStack.pop();
  saveCurrentPageState();
  drawCanvas(); syncQuality();
  syncLivePreview(canvasState.data, canvasState.width, canvasState.height);
}

function redo() {
  if (!toolState.redoStack.length) return;
  toolState.undoStack.push(new Uint8Array(canvasState.data));
  canvasState.data = toolState.redoStack.pop();
  saveCurrentPageState();
  drawCanvas(); syncQuality();
  syncLivePreview(canvasState.data, canvasState.width, canvasState.height);
}

function afterChange() {
  appState.isDirty = true;
  saveCurrentPageState();
  drawCanvas();
  syncQuality();
  syncLivePreview(canvasState.data, canvasState.width, canvasState.height);
}

// ─── Image Loading ────────────────────────────────────────────
let _currentConvId = 0;

async function loadImageFile(file) {
  if (!file) return;
  if (appState.isDirty && appState.phase === 'ready') {
    const proceed = await guardUnsavedChanges();
    if (!proceed) return;
  }
  const src = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(src);
    startAnalyze(img, file.name.replace(/\.[^.]+$/, ''));
  };
  img.onerror = () => { URL.revokeObjectURL(src); toast('이미지를 불러올 수 없어요'); };
  img.src = src;
}

function startAnalyze(img, name) {
  setPhase('analyzing');
  if (name) {
    const inp = ge('fname');
    if (inp) { appState.fileName = name; inp.value = name; }
  }
  const id = ++_currentConvId;
  // setTimeout (not rAF) so analysis still runs when the tab/iframe is
  // backgrounded — rAF is throttled to ~0 Hz when not visible, which would
  // otherwise hang conversion forever in an embedded (TIB/iframe) context.
  setTimeout(() => {
    if (id !== _currentConvId) return;
    const sourceState = createSourceImageState(img, canvasState.width, canvasState.height);
    const meta = analyzeImageType(sourceState.grayBuf, sourceState.alphaBuf, canvasState.width, canvasState.height);
    setActivePageSourceImage(sourceState, meta);

    const bestParams = autoSelectParams(sourceState, canvasState.width, canvasState.height);
    Object.assign(conversionState, bestParams);
    updateActivePage({ conversionState: { ...conversionState } });

    canvasState.data = convertToDots(sourceState, conversionState, canvasState.width, canvasState.height);
    saveCurrentPageState();

    paintSlider(conversionState.threshold);
    finishAnalyze();
  }, 16);
}

function finishAnalyze() {
  toolState.undoStack = [];
  toolState.redoStack = [];
  appState.isDirty = false;
  setPhase('ready');
  drawCanvas();
  syncQuality();
  syncConvUI();
  syncLivePreview(canvasState.data, canvasState.width, canvasState.height);
  toast(t('toast_converted', appState.language), 'ok');
}

function loadTactileFile(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const { parseDtms } = await import('./export.js');
      const { fileName, pages: items } = parseDtms(e.target.result);
      if (!items.length) return;
      appState.fileName = fileName;
      const inp = ge('fname'); if (inp) inp.value = fileName;

      // Replace all pages with loaded data
      pagesState.pages = items.map(item => {
        const page = createBlankPage(canvasState.width, canvasState.height);
        page.title = item.title;
        page.canvasData = hexToGrid(item.hex, canvasState.width, canvasState.height);
        page.activeDots = page.canvasData.reduce((s, v) => s + v, 0);
        page.altText = item.altText;
        return page;
      });
      loadPageState(0);
      drawCanvas(); syncQuality();
      syncPageUI();
      toast(fileName + ' 불러왔어요 ✓', 'ok');
    } catch {
      toast('파일을 읽을 수 없어요');
    }
  };
  reader.readAsText(file);
}

// ─── Conversion Rebuild ───────────────────────────────────────
let _rebuildTimer = null;

function rebuild(debounceMs = 0) {
  const page = pagesState.activePage;
  if (!page?.sourceImageState) return;
  if (_rebuildTimer) clearTimeout(_rebuildTimer);
  if (debounceMs > 0) {
    _rebuildTimer = setTimeout(() => doRebuild(page), debounceMs);
  } else {
    doRebuild(page);
  }
}

function doRebuild(page) {
  _rebuildTimer = null;
  if (!page?.sourceImageState) return;
  canvasState.data = convertToDots(page.sourceImageState, conversionState, canvasState.width, canvasState.height);
  Object.assign(page, { conversionState: { ...conversionState }, updatedAt: Date.now() });
  page.canvasData = new Uint8Array(canvasState.data);
  drawCanvas(); syncQuality();
  syncLivePreview(canvasState.data, canvasState.width, canvasState.height);
}

// ─── Threshold slider ─────────────────────────────────────────
function paintSlider(v) {
  const pct = Math.round((v - 20) / 220 * 100);
  const fill  = ge('thFill');
  const thumb = ge('thThumb');
  const disp  = ge('thValDisplay');
  const sl    = ge('thSlider');
  if (fill)  fill.style.width  = pct + '%';
  if (thumb) thumb.style.left  = pct + '%';
  if (disp)  disp.textContent  = pct + '%';
  if (sl && +sl.value !== v) sl.value = v;
}

// ─── Quality Panel ────────────────────────────────────────────
const AI_MSGS = {
  transparent: '배경을 제거하고 주요 윤곽을 남겼어요. 손끝으로 형태를 구분하기 좋아요.',
  lineart:     '선화를 감지했어요. 주요 윤곽선을 핀으로 직접 변환했어요.',
  lowcontrast: '대비가 낮은 이미지예요. 핵심 구조를 찾아 변환했어요.',
  photo:       '사진을 감지했어요. 주요 윤곽과 핵심 구조를 중심으로 단순화했어요.',
  default:     'AI가 주요 윤곽과 핵심 구조를 분석해 손가락으로 읽기 쉬운 형태로 정리했어요.',
};

function pill(el, txt, kind) {
  if (!el) return;
  el.textContent = txt;
  el.className = 'pill pill-' + kind;
}

function syncQuality() {
  const lang = appState.language;
  if (appState.phase !== 'ready') { resetQuality(); return; }
  const { data: g, width: cols, height: rows } = canvasState;
  const n = cols * rows;
  const pins = g.reduce((s, v) => s + v, 0);
  const fill = Math.round(pins / n * 100);

  if (pins === 0) { resetQuality(); return; }

  const page = pagesState.activePage;
  const meta = page?.sourceImageMeta;
  const sc = tactileQualityScore(g, cols, rows, { type: meta?.type, outline: conversionState.outline });
  const grade = Math.min(4, Math.max(1, sc.grade));

  // stat
  const qd = ge('qDotCount'); if (qd) qd.textContent = pins.toLocaleString();
  const qs2 = ge('qDotSub'); if (qs2) qs2.textContent = `/ ${n.toLocaleString()} · ${fill}%`;
  const df = ge('densityFill');
  if (df) {
    df.style.width = Math.min(100, fill) + '%';
    df.style.background = fill < 15 ? '#15803D' : fill < 40 ? '#FF9500' : '#DC2626';
  }

  const fillState = fill < 10 ? t('state_low', lang)
    : fill < 35 ? t('state_balanced', lang)
    : fill < 50 ? t('state_a_bit_high', lang)
    : t('state_high', lang);
  const fillCls = fill < 10 ? 'warn' : fill < 35 ? 'good' : fill < 50 ? 'warn' : 'bad';

  pill(ge('qClarity'),     grade >= 3 ? t('state_good', lang) : grade === 2 ? t('state_warning', lang) : t('state_poor', lang), grade >= 3 ? 'good' : grade === 2 ? 'warn' : 'bad');
  pill(ge('qDensity'),     fillState, fillCls);
  pill(ge('qReadability'), grade >= 3 ? t('state_good', lang) : grade === 2 ? t('state_warning', lang) : t('state_poor', lang), grade >= 3 ? 'good' : grade === 2 ? 'warn' : 'bad');
  const structVal = fill > 40 ? t('state_filled', lang) : fill > 15 ? t('state_mixed', lang) : t('state_outline', lang);
  pill(ge('qStructure'), structVal, 'neutral');

  // AI feedback
  if (meta) {
    const base = AI_MSGS[meta.type] || AI_MSGS.default;
    let extra = fill >= 50 ? ' 점 밀도가 높아요. 윤곽 중심으로 단순화해보세요.'
      : fill < 10 ? ' 점이 너무 적어요. 점 밀도를 조금 높여보세요.'
      : ' 현재 점 밀도는 Dot Pad에서 읽기에 적정해요.';
    const aiTxt = ge('aiFeedbackText');
    if (aiTxt) aiTxt.textContent = base + extra;
    const card = ge('aiFeedbackCard'); if (card) card.style.display = 'block';
    const empty = ge('aiFeedbackEmpty'); if (empty) empty.style.display = 'none';
    renderAiChips(fill, sc);
  }

  // canvas meta strip + bottom bar chips
  const resText = `${cols}×${rows}`;
  const dotText = `${pins.toLocaleString()} 핀 · ${fill}%`;
  const dotCls  = fill < 10 ? 'chip chip-w' : fill < 45 ? 'chip chip-ok' : 'chip chip-w';
  const resCh = ge('resChip'); if (resCh) resCh.textContent = resText;
  const dotCh = ge('dotChip'); if (dotCh) { dotCh.textContent = dotText; dotCh.className = dotCls; }
  const resCh2 = ge('resChipBtm'); if (resCh2) resCh2.textContent = resText;
  const dotCh2 = ge('dotChipBtm'); if (dotCh2) { dotCh2.textContent = dotText; dotCh2.className = 'dot-chip ' + (fill < 10 ? 'chip-w' : fill < 45 ? 'chip-ok' : 'chip-w'); }
  syncBtns(true);
}

function resetQuality() {
  ['qClarity','qDensity','qReadability','qStructure'].forEach(id => {
    const el = ge(id); if (el) { el.textContent = '—'; el.className = 'pill pill-neutral'; }
  });
  const card = ge('aiFeedbackCard'); if (card) card.style.display = 'none';
  const empty = ge('aiFeedbackEmpty'); if (empty) { empty.style.display = ''; empty.textContent = t('ai_empty', appState.language); }
  const chips = ge('aiChips'); if (chips) chips.style.display = 'none';
  syncBtns(false);
}

function renderAiChips(fill, sc) {
  const el = ge('aiChips'); if (!el) return;
  let cmds = [];
  if (fill >= 50) cmds = ['simpler', 'denoise'];
  else if (fill < 10) cmds = ['auto', 'boost'];
  else cmds = ['simpler', 'outline'];
  const labels = {
    simpler: '윤곽 중심으로 변환', denoise: '점 밀도 낮추기',
    auto: '윤곽 다시 감지', boost: '점 밀도 높이기', outline: '외곽선 1줄',
  };
  el.style.display = 'flex';
  el.innerHTML = cmds.map(cmd => `<button class="ai-ch" data-cmd="${cmd}">${labels[cmd]}</button>`).join('');
  el.querySelectorAll('.ai-ch').forEach(b => b.addEventListener('click', () => applyAiCmd(b.dataset.cmd)));
}

function applyAiCmd(cmd) {
  const page = pagesState.activePage;
  if (!page?.sourceImageState) return;
  pushUndo();
  if (cmd === 'simpler')  { conversionState.outline = 1; conversionState.minComp = 4; }
  if (cmd === 'denoise')  { conversionState.minComp = 5; }
  if (cmd === 'outline')  { conversionState.outline = 1; }
  if (cmd === 'auto')     { const p = autoSelectParams(page.sourceImageState, canvasState.width, canvasState.height); Object.assign(conversionState, p); paintSlider(conversionState.threshold); }
  if (cmd === 'boost')    { conversionState.threshold = Math.min(240, conversionState.threshold + 20); method = 'global'; paintSlider(conversionState.threshold); }
  rebuild();
}

// ─── Sync conversion UI ───────────────────────────────────────
function syncConvUI() {
  // method tabs
  qsa('.th-method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === conversionState.method));
  // outline buttons
  qsa('.outline-btn').forEach(b => b.classList.toggle('active', +b.dataset.outline === conversionState.outline));
  // invert toggle
  const inv = ge('invertToggle');
  if (inv) inv.setAttribute('aria-checked', String(conversionState.invert));
  // processing toggles
  ['dilate','erode','denoise'].forEach(p => {
    const el = ge(p === 'dilate' ? 'dilatBtn' : p + 'Btn');
    if (el) {
      el.classList.toggle('active', !!conversionState[p]);
      el.setAttribute('aria-pressed', String(!!conversionState[p]));
    }
  });
  const edgeEl = ge('edgeBtn');
  if (edgeEl) {
    const isOn = conversionState.edge !== 'none';
    edgeEl.classList.toggle('active', isOn);
    edgeEl.setAttribute('aria-pressed', String(isOn));
  }
  // a manual control change means we're no longer on a named preset
  qsa('.preset-btn').forEach(b => b.classList.remove('active'));
}

// ─── Sync helpers ─────────────────────────────────────────────
function syncBtns(hasContent) {
  const ids = ['dtmsBtn','pngBtn','dotpadBtn','hexBtn'];
  ids.forEach(id => { const el = ge(id); if (el) el.disabled = !hasContent; });
  const aiBadge = ge('aiBadge');
  if (aiBadge) aiBadge.style.display = hasContent ? '' : 'none';
}

function syncConn() {
  const on = dotPadState.connected;
  const lang = appState.language;
  // header dot
  const hdDot = ge('bbDot'); if (hdDot) hdDot.className = 'hd-conn' + (on ? ' on' : '');
  const txt = ge('bbStatus'); if (txt) txt.textContent = on ? t('bb_connected', lang) : t('bb_disconnected', lang);
  // bottom bar dot
  const btmDot = ge('btmDot'); if (btmDot) btmDot.className = 'btm-dot' + (on ? ' on' : '');
  // panel dot
  const dot2 = ge('dpDot'); if (dot2) dot2.className = 'dp-dot' + (on ? ' on' : '');
  const lbl = ge('dpLbl'); if (lbl) lbl.textContent = on ? t('bb_connected', lang) : t('conn_off', lang);
  const liveSw = ge('liveSwitch'); if (liveSw) liveSw.disabled = !on;
  const bleBtn = ge('bleBtn'); if (bleBtn) bleBtn.textContent = on ? '연결 끊기' : t('conn_btn_ble', lang);
  // mini mode
  const miniDot = ge('miniConnDot'); if (miniDot) miniDot.className = 'dp-dot' + (on ? ' on' : '');
  const miniBtn = ge('miniConnBtn'); if (miniBtn) miniBtn.textContent = on ? '연결 끊기' : 'BLE 연결';
}

function syncPageUI() {
  const total = pagesState.pages.length;
  const cur = pagesState.activePageIndex;
  const lbl = ge('pageLabel'); if (lbl) lbl.textContent = `${cur + 1} / ${total}`;
  const prev = ge('pagePrev'); if (prev) prev.disabled = cur === 0;
  const next = ge('pageNext'); if (next) next.disabled = cur === total - 1;
  const del = ge('pageDelete'); if (del) del.disabled = total <= 1;
  renderPageChips();
}

function renderPageChips() {
  const bar = ge('pageChips'); if (!bar) return;
  const total = pagesState.pages.length;
  const cur = pagesState.activePageIndex;
  bar.innerHTML = pagesState.pages.map((p, i) =>
    `<button class="page-chip${i === cur ? ' active' : ''}" data-idx="${i}" aria-pressed="${i === cur}">${i + 1}</button>`
  ).join('');
  bar.querySelectorAll('.page-chip').forEach(b =>
    b.addEventListener('click', () => switchPage(+b.dataset.idx))
  );
}

function switchPage(idx) {
  if (idx === pagesState.activePageIndex) return;
  loadPageState(idx);
  drawCanvas(); syncQuality(); syncPageUI();
}

function syncBottomBar() {
  syncConn(); syncPageUI();
  const zoomEl = ge('sbZoom');
  if (zoomEl) zoomEl.textContent = Math.round(viewportState.zoom * 100) + '%';
}

// ─── Tool Management ──────────────────────────────────────────
function selectTool(name) {
  toolState.currentTool = name;
  toolState.selection = null;
  toolState.hoverBrush = null;
  qsa('.rail-btn[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === name);
    b.setAttribute('aria-pressed', String(b.dataset.tool === name));
  });
  drawCanvas();
}

function setSize(s) {
  toolState.brushSize = s;
  qsa('.sz-btn').forEach(b => {
    b.classList.toggle('active', +b.dataset.size === s);
    b.setAttribute('aria-pressed', String(+b.dataset.size === s));
  });
}

// ─── Pointer events ───────────────────────────────────────────
let _drawing = false, _prevCell = null, _paintValue = 1;

function onPointerDown(e) {
  if (e.button !== 0) return;
  padEl.setPointerCapture(e.pointerId);
  _drawing = true;
  const { col, row } = getPointerCell(e, padEl, layout);
  const tool = toolState.currentTool;
  if (tool === 'pen' || tool === 'eraser') {
    pushUndo();
    _paintValue = tool === 'pen' ? 1 : 0;
    paintCells(col, row);
    _prevCell = [col, row];
  } else if (tool === 'select') {
    toolState.selection = { x0: col, y0: row, x1: col, y1: row };
    drawCanvas();
  } else if (tool === 'fill') {
    pushUndo();
    floodFill(col, row, canvasState.data[row * canvasState.width + col] ? 0 : 1);
  }
}

function onPointerMove(e) {
  const { col, row } = getPointerCell(e, padEl, layout);
  const tool = toolState.currentTool;
  // Sonification: only on the move (hand) tool, so it never fights drawing.
  if (tool === 'move' && isSonifyEnabled()) {
    sonifyMove({ col, row }, canvasState.data, canvasState.width, canvasState.height,
      { volume: dotPadState.sonifyVolume ?? 0.6, sensitivity: dotPadState.sonifySens ?? 3 });
  }
  if (tool === 'pen' || tool === 'eraser') {
    toolState.hoverBrush = getBrushCells(col, row, toolState.brushSize);
    drawCanvas();
    if (_drawing && _prevCell) {
      const cells = bresenhamLine(_prevCell[0], _prevCell[1], col, row);
      for (const [cx, cy] of cells) paintCells(cx, cy);
    }
    _prevCell = [col, row];
  } else if (tool === 'select' && _drawing && toolState.selection) {
    toolState.selection.x1 = col;
    toolState.selection.y1 = row;
    drawCanvas();
  } else {
    toolState.hoverBrush = null;
    drawCanvas();
  }
}

function onPointerUp(e) {
  if (!_drawing) return;
  _drawing = false;
  _prevCell = null;
  const tool = toolState.currentTool;
  if (tool === 'pen' || tool === 'eraser') afterChange();
  else if (tool === 'select' && toolState.selection) {
    // normalize selection
    const s = toolState.selection;
    toolState.selection = {
      x0: Math.min(s.x0, s.x1), y0: Math.min(s.y0, s.y1),
      x1: Math.max(s.x0, s.x1), y1: Math.max(s.y0, s.y1),
    };
    drawCanvas();
  }
}

function onPointerLeave() {
  toolState.hoverBrush = null;
  drawCanvas();
}

function paintCells(col, row) {
  const cells = getBrushCells(col, row, toolState.brushSize);
  const { width: cols, height: rows } = canvasState;
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    canvasState.data[y * cols + x] = _paintValue;
  }
  drawCanvas();
}

function floodFill(startCol, startRow, val) {
  const { data, width: cols, height: rows } = canvasState;
  const target = data[startRow * cols + startCol];
  if (target === val) return;
  const stack = [[startCol, startRow]];
  const visited = new Uint8Array(cols * rows);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const i = y * cols + x;
    if (visited[i] || data[i] !== target) continue;
    visited[i] = 1; data[i] = val;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  afterChange();
}

// ─── Keyboard shortcuts ───────────────────────────────────────
function onKeyDown(e) {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
  const map = { v: 'move', p: 'pen', e: 'eraser', f: 'fill' };
  if (!e.ctrlKey && !e.metaKey && map[e.key]) { selectTool(map[e.key]); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') { e.preventDefault(); redo(); return; }
  if (e.key === '+' || e.key === '=') { adjustZoom(0.25); return; }
  if (e.key === '-') { adjustZoom(-0.25); return; }
  if (e.key === '0') { viewportState.zoom = 1; fitCanvas(); return; }
  if (e.key === 'Escape') { toolState.selection = null; drawCanvas(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && toolState.selection) {
    e.preventDefault(); fillSelection(0); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    toolState.selection = { x0: 0, y0: 0, x1: canvasState.width - 1, y1: canvasState.height - 1 };
    drawCanvas(); return;
  }
}

function adjustZoom(delta) {
  viewportState.zoom = Math.max(0.5, Math.min(4, viewportState.zoom + delta));
  fitCanvas();
  const zoomEl = ge('sbZoom'); if (zoomEl) zoomEl.textContent = Math.round(viewportState.zoom * 100) + '%';
}

function fillSelection(val) {
  if (!toolState.selection) return;
  pushUndo();
  const { x0, y0, x1, y1 } = toolState.selection;
  const { data, width: cols } = canvasState;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * cols + x] = val;
  afterChange();
}

// ─── Guard modal ──────────────────────────────────────────────
function guardUnsavedChanges() {
  return new Promise(resolve => {
    const modal = ge('guardModal'); if (!modal) return resolve(true);
    modal.style.display = 'flex';
    const close = result => { modal.style.display = 'none'; resolve(result); };
    ge('guardSave')?.addEventListener('click', () => { exportDtms(pagesState.pages, appState.fileName, canvasState.width, canvasState.height); close(true); }, { once: true });
    ge('guardProceed')?.addEventListener('click', () => close(true), { once: true });
    ge('guardCancel')?.addEventListener('click',  () => close(false), { once: true });
  });
}

/** Place a freshly-generated pin grid as the current canvas (no source image). */
function placeGeneratedGrid(data, altText) {
  pushUndo();
  canvasState.data = data;
  setActivePageSourceImage(null, null);
  const page = pagesState.activePage;
  if (page && altText) { page.altText = altText; page.brailleText = altText; }
  if (appState.phase !== 'ready') setPhase('ready');
  appState.isDirty = true;
  afterChange();
}

// ─── Command bar (Figma-mini prompt brain) ───────────────────
async function parseCommand(text) {
  const lang = appState.language;
  const page = pagesState.activePage;
  const intent = interpretCommand(text, lang);
  const { width: cols, height: rows } = canvasState;

  // ── Math: plot an expression as a tactile graph (no image needed) ──
  if (intent.action === 'math' && intent.mathExpr) {
    const { data, error } = renderMathGraph(cols, rows, intent.mathExpr);
    if (error) { toast((lang === 'ko' ? '수식 오류: ' : 'Math error: ') + error); return; }
    placeGeneratedGrid(data);
    toast(`y = ${intent.mathExpr}`, 'ok');
    return;
  }

  // ── Symbol bank: curated, hand-tuned symbols beat generic primitives ──
  // Try for creation requests and otherwise-unrecognized short/draw prompts,
  // so "하트", "지구 그려줘", "나비" all resolve to the best available glyph.
  const looksCreative = intent.create ||
    (!intent.matched && (/그려|그리|만들|넣|draw|generate|create/i.test(text) || text.trim().length <= 8));
  if (bankReady && looksCreative) {
    try {
      const sym = await loadSymbol(text, cols, rows);
      if (sym.source !== 'none' && sym.data) {
        placeGeneratedGrid(sym.data, sym.altText || sym.label);
        toast(`${sym.label} 그렸어요`, 'ok');
        return;
      }
    } catch (err) { console.warn('[bank] resolve failed:', err.message); }
  }

  // ── Creation: synthesize a primitive from scratch (no image needed) ──
  if (intent.create) {
    placeGeneratedGrid(drawPrimitive(cols, rows, intent.create.shape, { fill: intent.create.fill }));
    toast(intent.reply, 'ok');
    return;
  }

  // ── Braille text: render typed text as braille cells ──
  if (intent.action === 'brailleText' && intent.brailleText) {
    import('./engine.js').then(({ textToBraillePages }) => {
      pushUndo();
      const lines = textToBraillePages(intent.brailleText, Math.floor(cols / 3));
      canvasState.data = renderBrailleGrid(lines, cols, rows);
      brailleState.brailleText = intent.brailleText;
      if (page) { page.brailleText = intent.brailleText; page.altText = intent.brailleText; }
      if (appState.phase !== 'ready') setPhase('ready');
      appState.isDirty = true;
      afterChange();
      toast(intent.reply, 'ok');
    });
    return;
  }

  // ── Thin: peel crowded interior pins (works on the current grid) ──
  if (intent.action === 'thin') {
    if (!canvasState.data.some(v => v)) { toast(t('toast_need_image', lang)); return; }
    const before = canvasState.data.reduce((s, v) => s + v, 0);
    pushUndo();
    canvasState.data = autoThinDots(canvasState.data, cols, rows);
    const after = canvasState.data.reduce((s, v) => s + v, 0);
    afterChange();
    toast(`${intent.reply} (${before}→${after}핀)`, 'ok');
    return;
  }

  // ── Sonify: play an audio sweep of the current graphic ──
  if (intent.action === 'sonify') {
    if (!canvasState.data.some(v => v)) { toast(t('toast_need_image', lang)); return; }
    sonifySweep(canvasState.data, cols, rows, { volume: dotPadState.sonifyVolume ?? 0.6 });
    toast(intent.reply, 'ok');
    return;
  }

  // ── Describe: announce a text summary of the current graphic ──
  if (intent.action === 'describe') {
    const desc = describeTactile(canvasState.data, cols, rows, lang);
    showDescription(desc);
    toast(intent.reply, 'ok');
    return;
  }

  // Actions that don't require a source image.
  if (intent.action === 'send' || intent.action === 'braille') {
    if (intent.action === 'braille') {
      sendBrailleText(brailleState.brailleText || page?.altText || '');
    } else {
      if (!dotPadState.connected) { toast(t('toast_not_conn', lang)); return; }
      sendGraphicData(gridToHex(canvasState.data, canvasState.width, canvasState.height), true);
    }
    toast(intent.reply, 'ok');
    return;
  }
  if (intent.action === 'clear') {
    if (!canvasState.data.some(v => v)) return;
    pushUndo(); canvasState.data.fill(0); afterChange();
    toast(intent.reply, 'ok');
    return;
  }

  // Everything below needs a converted image.
  if (!page?.sourceImageState) { toast(t('toast_need_image', lang)); return; }
  if (!intent.matched) { toast(intent.reply); return; }

  pushUndo();

  if (intent.optimize) {
    const best = optimizeForDotPad(page.sourceImageState, canvasState.width, canvasState.height);
    Object.assign(conversionState, best.params);
    paintSlider(conversionState.threshold);
    syncConvUI();
    rebuild();
    const gradeTxt = ['', '다시 확인', '주의', '좋음', '아주 좋음'][best.grade] || '';
    toast(`${intent.reply} · 품질 ${gradeTxt}`.trim(), 'ok');
    return;
  }

  if (intent.action === 'reset') {
    const p = autoSelectParams(page.sourceImageState, canvasState.width, canvasState.height);
    Object.assign(conversionState, p, { dilate: false, erode: false, denoise: false, edge: 'none' });
    paintSlider(conversionState.threshold);
  } else if (intent.action === 'invert') {
    conversionState.invert = !conversionState.invert;
  }

  // Merge patch.
  if (intent.patch && Object.keys(intent.patch).length) Object.assign(conversionState, intent.patch);

  // Relative threshold nudge.
  if (intent.deltaThreshold) {
    conversionState.threshold = Math.max(20, Math.min(240, conversionState.threshold + intent.deltaThreshold));
    paintSlider(conversionState.threshold);
  }

  syncConvUI();
  rebuild();
  toast(intent.reply, 'ok');
}


// ─── Prompt suggestion dropdown ───────────────────────────────
function renderPromptSuggestions() {
  const box = ge('promptSuggest'); if (!box) return;
  const lang = appState.language;
  box.innerHTML = QUICK_COMMANDS.map(c => {
    const label = c.text[lang] || c.text.ko;
    const grp = c.group ? `<div class="ps-group">${c.group[lang] || c.group.ko}</div>` : '';
    return `${grp}<button class="ps-item${c.primary ? ' primary' : ''}" role="option" data-cmd="${label.replace(/"/g, '&quot;')}">
       <span class="ps-icon">${svgIcon(c.icon)}</span>${label}
     </button>`;
  }).join('');
  box.querySelectorAll('.ps-item').forEach(b => b.addEventListener('mousedown', e => {
    e.preventDefault();
    hidePromptSuggestions();
    const inp = ge('promptInput'); if (inp) inp.value = '';
    parseCommand(b.dataset.cmd);
  }));
}
function showPromptSuggestions() { const b = ge('promptSuggest'); if (b) { renderPromptSuggestions(); b.classList.add('show'); } }
function hidePromptSuggestions() { const b = ge('promptSuggest'); if (b) b.classList.remove('show'); }

/** Surface a generated description in the AI feedback card + screen-reader live region. */
function showDescription(text) {
  const card = ge('aiFeedbackCard');
  const txt = ge('aiFeedbackText');
  const empty = ge('aiFeedbackEmpty');
  if (txt) txt.textContent = text;
  if (card) card.style.display = 'block';
  if (empty) empty.style.display = 'none';
  const live = ge('liveRegion'); if (live) live.textContent = text;
}

// ─── Language toggle ──────────────────────────────────────────
function setLanguage(lang) {
  appState.language = lang;
  document.documentElement.lang = lang === 'ko' ? 'ko' : 'en';
  applyI18n();
  qsa('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
}

function applyI18n() {
  const lang = appState.language;
  qsa('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const v = t(key, lang); if (v) el.textContent = v;
  });
  const ph = ge('promptInput'); if (ph) ph.placeholder = t('prompt_ph', lang);
  syncQuality(); syncConn();
}

// ─── Resolution change ────────────────────────────────────────
function setResolution(cols, rows) {
  if (canvasState.width === cols && canvasState.height === rows) return;
  canvasState.width  = cols; canvasState.height = rows;
  canvasState.data   = new Uint8Array(cols * rows);
  pagesState.pages   = [createBlankPage(cols, rows)];
  pagesState.activePageIndex = 0;
  toolState.undoStack = []; toolState.redoStack = [];
  appState.phase = 'empty';
  setPhase('empty');
  fitCanvas(); syncQuality(); syncPageUI();
}

// ─── Full Mode wiring ─────────────────────────────────────────
function wireFullMode() {
  // tool rail
  qsa('.rail-btn[data-tool]').forEach(b => b.addEventListener('click', () => selectTool(b.dataset.tool)));
  ge('undoBtn')?.addEventListener('click', undo);
  ge('redoBtn')?.addEventListener('click', redo);
  ge('clearBtn')?.addEventListener('click', () => {
    if (!canvasState.data.some(v => v)) return;
    pushUndo();
    canvasState.data.fill(0);
    afterChange();
    toast('전체 지웠어요');
  });
  ge('brushSizeGroup')?.addEventListener('click', e => {
    const b = e.target.closest('.sz-btn[data-size]'); if (!b) return;
    setSize(+b.dataset.size);
  });

  // canvas pointer
  padEl.addEventListener('pointerdown',  onPointerDown);
  padEl.addEventListener('pointermove',  onPointerMove);
  padEl.addEventListener('pointerup',    onPointerUp);
  padEl.addEventListener('pointerleave', onPointerLeave);
  padEl.addEventListener('dragover',  e => e.preventDefault());
  padEl.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0]; if (!file) return;
    if (file.name.endsWith('.dtms') || file.name.endsWith('.json')) loadTactileFile(file);
    else loadImageFile(file);
  });

  // image import
  ge('imgFileInput')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) loadImageFile(f);
    e.target.value = '';
  });
  ge('tactileFileInput')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) loadTactileFile(f);
    e.target.value = '';
  });
  ge('emptyDropZone')?.addEventListener('click', () => ge('imgFileInput')?.click());

  // drag-over visual
  const area = qs('.canvas-area');
  area?.addEventListener('dragenter', () => area.classList.add('drag-over'));
  area?.addEventListener('dragleave', e => {
    if (!area.contains(e.relatedTarget)) area.classList.remove('drag-over');
  });
  area?.addEventListener('drop', () => area.classList.remove('drag-over'));

  // prompt bar
  ge('promptForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const inp = ge('promptInput'); if (!inp?.value.trim()) return;
    hidePromptSuggestions();
    parseCommand(inp.value); inp.value = '';
  });
  const promptInp = ge('promptInput');
  promptInp?.addEventListener('focus', showPromptSuggestions);
  promptInp?.addEventListener('blur', () => setTimeout(hidePromptSuggestions, 120));

  // threshold slider
  ge('thSlider')?.addEventListener('input', function() {
    const v = Math.max(20, Math.min(240, +this.value));
    conversionState.threshold = v; conversionState.method = 'global';
    paintSlider(v);
    rebuild(120);                       // live — no separate "적용" step
    syncConvUI();            // reflect method→수동 on the chip
  });
  ge('thMinus')?.addEventListener('click', () => {
    const sl = ge('thSlider'); if (!sl) return;
    const v = Math.max(20, +sl.value - 1);
    sl.value = v; conversionState.threshold = v; conversionState.method = 'global';
    paintSlider(v); rebuild(80);
  });
  ge('thPlus')?.addEventListener('click', () => {
    const sl = ge('thSlider'); if (!sl) return;
    const v = Math.min(240, +sl.value + 1);
    sl.value = v; conversionState.threshold = v; conversionState.method = 'global';
    paintSlider(v); rebuild(80);
  });
  ge('thAuto')?.addEventListener('click', () => {
    const page = pagesState.activePage;
    if (!page?.sourceImageState) { toast(t('toast_need_image', appState.language)); return; }
    const p = autoSelectParams(page.sourceImageState, canvasState.width, canvasState.height);
    Object.assign(conversionState, p);
    paintSlider(conversionState.threshold);
    syncConvUI();
    rebuild(); toast(t('toast_auto_th', appState.language) + ' ' + Math.round((conversionState.threshold - 20) / 220 * 100) + '%');
  });

  // method selector
  qsa('.th-method-btn').forEach(b => b.addEventListener('click', () => {
    const page = pagesState.activePage;
    if (!page?.sourceImageState) { toast(t('toast_need_image', appState.language)); return; }
    conversionState.method = b.dataset.method;
    qsa('.th-method-btn').forEach(x => x.classList.toggle('active', x === b));
    if (conversionState.method !== 'global') {
      const p = autoSelectParams(page.sourceImageState, canvasState.width, canvasState.height);
      conversionState.threshold = p.threshold;
      paintSlider(conversionState.threshold);
    }
    rebuild();
  }));

  // outline selector
  qsa('.outline-btn').forEach(b => b.addEventListener('click', () => {
    const page = pagesState.activePage;
    if (!page?.sourceImageState) return;
    conversionState.outline = +b.dataset.outline;
    qsa('.outline-btn').forEach(x => x.classList.toggle('active', x === b));
    rebuild();
  }));

  // invert toggle
  ge('invertToggle')?.addEventListener('click', function() {
    const page = pagesState.activePage;
    if (!page?.sourceImageState) return;
    const next = this.getAttribute('aria-checked') !== 'true';
    this.setAttribute('aria-checked', String(next));
    conversionState.invert = next;
    rebuild();
  });

  // preset buttons
  const PRESETS = {
    braille:  { method: 'otsu',     threshold: 110, outline: 1, minComp: 1, invert: false, dilate: false, erode: false, denoise: true,  edge: 'none' },
    tactile:  { method: 'otsu',     threshold: 128, outline: 0, minComp: 2, invert: false, dilate: false, erode: false, denoise: false, edge: 'none' },
    learning: { method: 'global',   threshold: 100, outline: 1, minComp: 5, invert: false, dilate: true,  erode: false, denoise: false, edge: 'none' },
    detail:   { method: 'adaptive', threshold: 128, outline: 0, minComp: 1, invert: false, dilate: false, erode: false, denoise: false, edge: 'none' },
  };
  qsa('.preset-btn').forEach(b => b.addEventListener('click', () => {
    const page = pagesState.activePage;
    if (!page?.sourceImageState) { toast(t('toast_need_image', appState.language)); return; }
    const p = PRESETS[b.dataset.preset]; if (!p) return;
    pushUndo();
    Object.assign(conversionState, p);
    paintSlider(conversionState.threshold);
    qsa('.preset-btn').forEach(x => x.classList.toggle('active', x === b));
    syncConvUI();
    rebuild();
  }));

  // processing toggles (dilate / erode / denoise / edge)
  qsa('[data-proc]').forEach(b => b.addEventListener('click', () => {
    const page = pagesState.activePage;
    if (!page?.sourceImageState) return;
    const proc = b.dataset.proc;
    if (proc === 'edge') {
      conversionState.edge = conversionState.edge === 'none' ? 'sobel' : 'none';
    } else {
      conversionState[proc] = !conversionState[proc];
    }
    syncConvUI();
    rebuild(80);
  }));

  // save btn
  ge('saveBtn')?.addEventListener('click', () => {
    exportDtms(pagesState.pages, appState.fileName, canvasState.width, canvasState.height);
    toast(t('toast_dtms', appState.language), 'ok');
  });

  // pin control
  ge('pinUpBtn')?.addEventListener('click',   () => { pushUndo(); canvasState.data.fill(1); afterChange(); toast(t('toast_pin_up', appState.language)); });
  ge('pinDownBtn')?.addEventListener('click', () => { pushUndo(); canvasState.data.fill(0); afterChange(); toast(t('toast_pin_down', appState.language)); });
  ge('pinInvBtn')?.addEventListener('click',  () => {
    pushUndo();
    const d = canvasState.data;
    for (let i = 0; i < d.length; i++) d[i] ^= 1;
    afterChange(); toast(t('toast_pin_inv', appState.language));
  });

  // DotPad
  initDotPad(
    () => { syncConn(); if (dotPadState.livePreviewEnabled) syncLivePreview(canvasState.data, canvasState.width, canvasState.height); toast('Dot Pad 연결됐어요 ✓', 'ok'); },
    () => { syncConn(); toast('Dot Pad 연결이 끊어졌어요'); }
  );
  ge('bleBtn')?.addEventListener('click', async () => {
    if (dotPadState.connected) { disconnectDotPad(); } else { await connectBle(); }
  });
  ge('usbBtn')?.addEventListener('click', async () => { await connectUsb(); });
  ge('liveSwitch')?.addEventListener('click', function() {
    const checked = this.getAttribute('aria-checked') !== 'true';
    dotPadState.livePreviewEnabled = checked;
    this.setAttribute('aria-checked', String(checked));
    if (checked) syncLivePreview(canvasState.data, canvasState.width, canvasState.height);
  });

  // Sonification toggle — enabling it also switches to the move tool so hover works.
  ge('sonifySwitch')?.addEventListener('click', function() {
    const checked = this.getAttribute('aria-checked') !== 'true';
    setSonify(checked);
    this.setAttribute('aria-checked', String(checked));
    if (checked) {
      selectTool('move');
      toast(t('sonify_on', appState.language), 'ok');
    }
  });
  ge('sonifySweepBtn')?.addEventListener('click', () => {
    if (!canvasState.data.some(v => v)) { toast(t('toast_need_image', appState.language)); return; }
    sonifySweep(canvasState.data, canvasState.width, canvasState.height, { volume: dotPadState.sonifyVolume ?? 0.6 });
  });
  ge('dotpadBtn')?.addEventListener('click', () => {
    if (!dotPadState.connected) { toast(t('toast_not_conn', appState.language)); return; }
    sendGraphicData(gridToHex(canvasState.data, canvasState.width, canvasState.height), true);
    toast(t('toast_sent', appState.language), 'ok');
  });

  // Export
  ge('dtmsBtn')?.addEventListener('click', () => {
    exportDtms(pagesState.pages, appState.fileName, canvasState.width, canvasState.height);
    toast(t('toast_dtms', appState.language), 'ok');
  });
  ge('pngBtn')?.addEventListener('click', () => {
    exportPng(padEl, appState.fileName);
    toast(t('toast_png', appState.language), 'ok');
  });
  ge('hexBtn')?.addEventListener('click', async () => {
    await copyHexToClipboard(canvasState.data, canvasState.width, canvasState.height);
    toast(t('toast_copied', appState.language), 'ok');
  });
  ge('jsonBtn')?.addEventListener('click', () => {
    exportJson(canvasState.data, pagesState.pages, appState.fileName, canvasState.width, canvasState.height);
  });

  // Page management
  ge('pagePrev')?.addEventListener('click', () => switchPage(pagesState.activePageIndex - 1));
  ge('pageNext')?.addEventListener('click', () => switchPage(pagesState.activePageIndex + 1));
  ge('pageAdd')?.addEventListener('click', () => { addPage(); drawCanvas(); syncQuality(); syncPageUI(); toast(t('toast_page_added', appState.language)); });
  ge('pageDup')?.addEventListener('click', () => { duplicatePage(); drawCanvas(); syncQuality(); syncPageUI(); toast('페이지를 복제했어요'); });
  ge('pageDelete')?.addEventListener('click', () => {
    if (pagesState.pages.length <= 1) return;
    deletePage(); drawCanvas(); syncQuality(); syncPageUI();
    toast(t('toast_page_del', appState.language));
  });

  // Zoom
  ge('zoomIn')?.addEventListener('click',  () => adjustZoom(0.25));
  ge('zoomOut')?.addEventListener('click', () => adjustZoom(-0.25));
  ge('zoomFit')?.addEventListener('click', () => { viewportState.zoom = 1; fitCanvas(); const el = ge('sbZoom'); if (el) el.textContent = '100%'; });

  // Language
  qsa('.lang-btn').forEach(b => b.addEventListener('click', () => setLanguage(b.dataset.lang)));

  // Resolution
  qsa('.res-btn').forEach(b => b.addEventListener('click', () => {
    const [c, r] = b.dataset.res.split('x').map(Number);
    setResolution(c, r);
    qsa('.res-btn').forEach(x => x.classList.toggle('active', x === b));
  }));

  // File name
  ge('fname')?.addEventListener('change', function() { appState.fileName = this.value.trim() || 'Untitled'; });
  ge('fname')?.addEventListener('focus', function() { this.select(); });

  // Save shortcut
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      exportDtms(pagesState.pages, appState.fileName, canvasState.width, canvasState.height);
      toast(t('toast_dtms', appState.language), 'ok');
    }
  });

  // Global keyboard
  document.addEventListener('keydown', onKeyDown);
}

// ─── Mini Mode wiring ─────────────────────────────────────────
function wireMiniMode() {
  ge('miniImgInput')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) loadImageFile(f);
    e.target.value = '';
  });
  ge('miniDropZone')?.addEventListener('click', () => ge('miniImgInput')?.click());
  ge('miniSendBtn')?.addEventListener('click', () => {
    if (!dotPadState.connected) { toast(t('toast_not_conn', appState.language)); return; }
    sendGraphicData(gridToHex(canvasState.data, canvasState.width, canvasState.height), true);
    toast(t('toast_sent', appState.language), 'ok');
  });
  ge('miniDtmsBtn')?.addEventListener('click', () => {
    exportDtms(pagesState.pages, appState.fileName, canvasState.width, canvasState.height);
    toast(t('toast_dtms', appState.language), 'ok');
  });
  ge('miniPngBtn')?.addEventListener('click', () => {
    exportPng(padEl, appState.fileName);
    toast(t('toast_png', appState.language), 'ok');
  });
  ge('miniThSlider')?.addEventListener('input', function() {
    const v = Math.max(20, Math.min(240, +this.value));
    conversionState.threshold = v; conversionState.method = 'global';
    paintSlider(v); rebuild(120);
  });

  initDotPad(
    () => { syncConn(); syncLivePreview(canvasState.data, canvasState.width, canvasState.height); },
    () => syncConn()
  );
  ge('miniConnBtn')?.addEventListener('click', async () => {
    if (dotPadState.connected) disconnectDotPad(); else await connectBle();
  });
  document.addEventListener('keydown', onKeyDown);
}

// ─── Detect mode ──────────────────────────────────────────────
function detectMode() {
  const params = new URLSearchParams(location.search);
  if (params.has('mini') || params.get('mode') === 'mini') return 'mini';
  if (window.self !== window.top) return 'embed';
  return 'full';
}

// ─── Init ─────────────────────────────────────────────────────
export function init() {
  const mode = detectMode();
  appState.mode = mode;

  const fullEl = ge('app-full');
  const miniEl = ge('app-mini');

  if (mode === 'full') {
    if (miniEl) miniEl.hidden = true;
    if (fullEl) fullEl.hidden = false;
  } else {
    if (fullEl) fullEl.hidden = true;
    if (miniEl) miniEl.hidden = false;
  }

  initCanvas();

  if (mode === 'full') wireFullMode();
  else wireMiniMode();

  paintSlider(128);
  setPhase('empty');
  syncBtns(false);
  syncConn();
  syncPageUI();
  applyI18n();

  window.addEventListener('resize', fitCanvas);
  document.fonts?.ready?.then(fitCanvas);

  // Curated symbol bank — async, non-blocking. If it fails the prompt simply
  // falls back to geometric primitives, so we never block startup on it.
  initBank('js/symbol-bank.json')
    .then(() => { bankReady = true; })
    .catch(err => console.warn('[bank] init failed — symbols disabled:', err.message));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
