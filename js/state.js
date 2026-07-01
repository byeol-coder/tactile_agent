// ── State Store ──────────────────────────────────────────────
// Single source of truth for all app state.
// Modules read from here; all mutations go through update functions.

function genId() {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createBlankPage(cols = 60, rows = 40) {
  return {
    id: genId(),
    title: 'Page',
    width: cols,
    height: rows,
    sourceType: null,       // 'image' | 'dtms' | 'drawn' | 'restored' | null
    hasContent: false,
    hasDtmsData: false,
    isRendered: false,
    renderError: null,
    canvasData: new Uint8Array(cols * rows),
    sourceImageState: null,  // { grayBuf, alphaBuf }
    sourceImageMeta: null,   // { type, hasAlpha, ... }
    conversionState: {
      method: 'global',
      threshold: 128,
      invert: false,
      outline: 0,
      minComp: 2,
      dilate: false,
      erode: false,
      denoise: false,
      edge: 'none',
    },
    altText: '',
    brailleText: '',
    braillePages: [],
    activeDots: 0,
    viewportState: { zoom: 1, panX: 0, panY: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── App State ─────────────────────────────────────────────────
export const appState = {
  mode: 'full',          // 'full' | 'mini' | 'embed'
  language: 'ko',
  fileName: 'Untitled',
  isDirty: false,
  phase: 'empty',        // 'empty' | 'analyzing' | 'ready'
  sourceType: null,
  hasContent: false,
  hasDtmsData: false,
  isEmpty: true,
};

// ── Pages State ───────────────────────────────────────────────
export const pagesState = {
  pages: [createBlankPage()],
  activePageIndex: 0,
  get activePage() { return this.pages[this.activePageIndex] ?? null; },
};

export function pageHasContent(page) {
  if (!page) return false;
  if (page.hasContent || page.hasDtmsData) return true;
  if (page.sourceImage || page.sourceImageState) return true;
  if (page.brailleText || page.braillePages?.length) return true;
  return !!(page.canvasData?.length && page.canvasData.some(v => !!v));
}

export function syncAppContentState() {
  const page = pagesState.activePage;
  const hasContent = pageHasContent(page);
  appState.sourceType = page?.sourceType ?? null;
  appState.hasContent = hasContent;
  appState.hasDtmsData = !!page?.hasDtmsData || pagesState.pages.some(p => !!p.hasDtmsData);
  appState.isEmpty = !hasContent;
  appState.phase = hasContent ? 'ready' : 'empty';
  return hasContent;
}

// ── Canvas State (working copy of active page) ────────────────
export const canvasState = {
  data: new Uint8Array(60 * 40),
  width: 60,
  height: 40,
  get activeDots() { return this.data.reduce((s, v) => s + v, 0); },
};

// ── Conversion State (mirrors active page.conversionState) ────
export const conversionState = {
  method: 'global',   // 'global' | 'otsu' | 'adaptive' | 'alpha'
  threshold: 128,
  invert: false,
  outline: 0,         // 0 | 1 | 2
  minComp: 2,
  dilate: false,
  erode: false,
  denoise: false,
  edge: 'none',       // 'none' | 'sobel'
};

// ── Viewport State ────────────────────────────────────────────
export const viewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  cellSize: 12,
  offsetX: 6,
  offsetY: 6,
};

// ── Tool State ────────────────────────────────────────────────
export const toolState = {
  currentTool: 'move',   // 'move' | 'pen' | 'eraser' | 'select'
  brushSize: 1,
  selection: null,       // { x0, y0, x1, y1 } | null
  selBuffer: null,
  undoStack: [],
  redoStack: [],
};

// ── Braille State ─────────────────────────────────────────────
export const brailleState = {
  altText: '',
  brailleText: '',
  braillePages: [],
  cellsPerLine: 20,
};

// ── Dot Pad State ─────────────────────────────────────────────
export const dotPadState = {
  connected: false,
  livePreviewEnabled: true,
  sdk: null,
  device: null,
  lastSyncedAt: null,
  lastPreviewBuffer: null,
};

// ── Export State ──────────────────────────────────────────────
export const exportState = {
  lastExportedAt: null,
};

// ─────────────────────────────────────────────────────────────
// Update helpers — all state mutations go through these
// ─────────────────────────────────────────────────────────────

/** Save current canvasState + conversionState → active page */
export function saveCurrentPageState() {
  const page = pagesState.activePage;
  if (!page) return;
  page.canvasData = new Uint8Array(canvasState.data);
  page.activeDots = canvasState.activeDots;
  page.hasContent = page.hasContent || page.hasDtmsData || page.sourceImageState || canvasState.activeDots > 0;
  page.conversionState = { ...conversionState };
  page.viewportState = { ...viewportState };
  page.updatedAt = Date.now();
  syncAppContentState();
}

/** Load page data → canvasState + conversionState */
export function loadPageState(idx, { saveCurrent = true } = {}) {
  const page = pagesState.pages[idx];
  if (!page) return;
  if (saveCurrent) saveCurrentPageState();
  pagesState.activePageIndex = idx;
  canvasState.data = new Uint8Array(page.canvasData);
  canvasState.width = page.width;
  canvasState.height = page.height;
  Object.assign(conversionState, page.conversionState);
  Object.assign(viewportState, page.viewportState);
  syncAppContentState();
}

/** Partially update the active page */
export function updateActivePage(partial) {
  const page = pagesState.activePage;
  if (!page) return;
  Object.assign(page, partial);
  page.updatedAt = Date.now();
}

/** Add a new blank page */
export function addPage() {
  saveCurrentPageState();
  const page = createBlankPage(canvasState.width, canvasState.height);
  pagesState.pages.push(page);
  loadPageState(pagesState.pages.length - 1);
  return page;
}

/** Deep-clone the current page */
export function duplicatePage() {
  saveCurrentPageState();
  const src = pagesState.activePage;
  if (!src) return null;
  const clone = {
    ...src,
    id: genId(),
    title: src.title + ' 복제',
    canvasData: new Uint8Array(src.canvasData),
    sourceImageState: src.sourceImageState ? {
      grayBuf: new Uint8ClampedArray(src.sourceImageState.grayBuf),
      alphaBuf: new Uint8ClampedArray(src.sourceImageState.alphaBuf),
    } : null,
    sourceImageMeta: src.sourceImageMeta ? { ...src.sourceImageMeta } : null,
    conversionState: { ...src.conversionState },
    braillePages: src.braillePages.map(p => ({ ...p })),
    viewportState: { ...src.viewportState },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const insertAt = pagesState.activePageIndex + 1;
  pagesState.pages.splice(insertAt, 0, clone);
  loadPageState(insertAt);
  return clone;
}

/** Delete the active page (keeps at least 1) */
export function deletePage() {
  if (pagesState.pages.length <= 1) return false;
  const idx = pagesState.activePageIndex;
  pagesState.pages.splice(idx, 1);
  const newIdx = Math.min(idx, pagesState.pages.length - 1);
  loadPageState(newIdx);
  return true;
}

/** Set source image state on active page */
export function setActivePageSourceImage(sourceImageState, meta, img) {
  const page = pagesState.activePage;
  if (!page) return;
  page.sourceImageState = sourceImageState;
  page.sourceImageMeta = meta;
  page.sourceType = 'image';
  page.hasContent = true;
  page.hasDtmsData = false;
  page.isRendered = false;
  page.renderError = null;
  // keep the decoded original so the image can be re-rendered at any resolution
  if (img !== undefined) page.sourceImage = img;
  page.updatedAt = Date.now();
  syncAppContentState();
}
