// ── Symbol Bank ──────────────────────────────────────────────
// Resolves a free-text prompt to a tactile pin grid, trying in order:
//   1. procedural symbol  (symbols.js — geometric/parametric, instant)
//   2. DTMS bank page      (hand-authored .dtms — organic/complex)
//   3. none → caller runs constrained T2T generation
//
// Output grids are Uint8Array(cols*rows), index = y*cols + x, value 0|1
// — identical layout to state.js `page.canvasData`. DTMS pages are decoded
// with the canonical engine.js `hexToGrid` (single source of truth for the
// column-major bit layout), then nearest-neighbor scaled if the authored
// resolution differs from the requested one.
//
// ── Manifest (symbol-bank.json) ──
//   { version, defaultRes:[cols,rows], symbols: { <id>: ENTRY } }
//   ENTRY (proc): { kind:'proc', proc:'heart', label, emoji, tags[], reviewed }
//   ENTRY (dtms): { kind:'dtms', file:'banks/x.dtms', page:1, res?:[c,r],
//                   label, emoji, tags[], reviewed }
//   `page` is 1-indexed (matches DTMS items[].page). `file` is relative to
//   the manifest URL. Keywords = [label, ...tags], matched case-insensitively.

import { renderSymbol } from './symbols.js';
import { hexToGrid } from './engine.js';

let MANIFEST = null;
let MANIFEST_URL = null;
let KEY_INDEX = [];                 // [{ id, keywords:[lowercased] }]
const FILE_CACHE = new Map();       // resolved url → parsed DTMS json (or Promise)

/**
 * Load the bank manifest and build the keyword index.
 * @param {string} url path to symbol-bank.json (default './symbol-bank.json')
 */
export async function initBank(url = './symbol-bank.json') {
  MANIFEST_URL = new URL(url, location.href).href;
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`bank: manifest ${res.status}`);
  MANIFEST = await res.json();
  KEY_INDEX = Object.entries(MANIFEST.symbols || {}).map(([id, e]) => ({
    id,
    keywords: [e.label, ...(e.tags || [])].filter(Boolean).map(k => String(k).toLowerCase()),
  }));
  return MANIFEST;
}

/**
 * Resolve a prompt to a manifest entry — synchronous, no data load.
 * Use for fast UI hints (e.g. show the match before fetching).
 * @returns {{id:string, entry:object}|null}
 */
export function resolve(prompt) {
  const s = String(prompt || '').toLowerCase().trim();
  if (!s || !MANIFEST) return null;
  // exact keyword, then substring
  for (const k of KEY_INDEX) if (k.keywords.includes(s)) return entry(k.id);
  for (const k of KEY_INDEX) if (k.keywords.some(w => s.includes(w))) return entry(k.id);
  return null;
}
function entry(id) { return { id, entry: MANIFEST.symbols[id] }; }

/** All entries, for palette / suggestion UIs. */
export function listSymbols() {
  if (!MANIFEST) return [];
  return Object.entries(MANIFEST.symbols).map(([id, e]) => ({ id, ...e }));
}

/**
 * Resolve a prompt to a ready-to-place pin grid.
 * @param {string} prompt
 * @param {number} cols  target resolution (default 60)
 * @param {number} rows  target resolution (default 40)
 * @returns {Promise<{
 *   source:'proc'|'dtms'|'none', id:string|null, data:Uint8Array|null,
 *   label?:string, emoji?:string, altText?:string, reviewed?:boolean, error?:string
 * }>}
 */
export async function loadSymbol(prompt, cols = 60, rows = 40) {
  const hit = resolve(prompt);
  if (!hit) return none();
  const { id, entry: e } = hit;

  try {
    if (e.kind === 'proc') {
      return {
        source: 'proc', id, data: renderSymbol(e.proc, cols, rows),
        label: e.label, emoji: e.emoji, altText: '', reviewed: !!e.reviewed,
      };
    }
    if (e.kind === 'dtms') {
      const json = await loadDtmsFile(e.file);
      const items = json.items || [];
      const item = items[(e.page || 1) - 1];     // page is 1-indexed
      if (!item || !item.graphic?.data) throw new Error(`page ${e.page} missing in ${e.file}`);
      const [sc, sr] = e.res || json.resolution && [json.resolution.cols, json.resolution.rows] || MANIFEST.defaultRes || [60, 40];
      let grid = hexToGrid(item.graphic.data, sc, sr);
      if (sc !== cols || sr !== rows) grid = scaleGrid(grid, sc, sr, cols, rows);
      return {
        source: 'dtms', id, data: grid,
        label: e.label, emoji: e.emoji,
        altText: item.text?.data || item.text?.plain || e.label,
        reviewed: !!e.reviewed,
      };
    }
    return none(id, `unknown kind: ${e.kind}`);
  } catch (err) {
    console.warn('[bank] load failed →', err.message, '— falling back to T2T');
    return none(id, err.message);
  }
}

function none(id = null, error) { return { source: 'none', id, data: null, error }; }

// ── DTMS file fetch + cache (relative to manifest URL) ──
function loadDtmsFile(file) {
  const url = new URL(file, MANIFEST_URL).href;
  if (FILE_CACHE.has(url)) return FILE_CACHE.get(url);
  const p = fetch(url).then(r => {
    if (!r.ok) throw new Error(`dtms ${r.status}: ${file}`);
    return r.json();
  });
  FILE_CACHE.set(url, p);   // cache the promise (dedupes concurrent loads)
  return p;
}

// ── Nearest-neighbor resolution scale (60×40 ↔ 96×64 etc.) ──
function scaleGrid(src, sCols, sRows, dCols, dRows) {
  const out = new Uint8Array(dCols * dRows);
  for (let y = 0; y < dRows; y++)
    for (let x = 0; x < dCols; x++) {
      const sx = Math.min(sCols - 1, Math.floor(x * sCols / dCols));
      const sy = Math.min(sRows - 1, Math.floor(y * sRows / dRows));
      out[y * dCols + x] = src[sy * sCols + sx];
    }
  return out;
}

/* ── Wiring (app.js routePrompt 'generate' branch, BEFORE T2T) ──
 *
 *   await initBank('./symbol-bank.json');           // once at startup
 *   ...
 *   const r = await loadSymbol(prompt, canvasState.width, canvasState.height);
 *   if (r.source !== 'none') {
 *     applyGridAsLayer(r.data, r.label, r.altText);  // push new page/layer
 *     return reply(`${r.emoji} ${r.label} 그렸어요`);
 *   }
 *   // else → constrained T2T generation (generate.js)
 */
