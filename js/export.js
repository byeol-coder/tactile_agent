// ── Export Utilities ──────────────────────────────────────────

import { buildDtmsJSON, gridToHex } from './engine.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  requestAnimationFrame(() => { document.body.removeChild(a); URL.revokeObjectURL(url); });
}

/**
 * Export all pages as a .dtms file.
 */
export function exportDtms(pages, fileName, cols, rows) {
  const json = buildDtmsJSON(pages, fileName, cols, rows);
  download(new Blob([json], { type: 'application/json' }), (fileName || 'untitled') + '.dtms');
}

/**
 * Export the dot pattern as a transparent PNG.
 * Renders ONLY raised (ON) pins as solid dots on a fully transparent
 * background — no canvas fill, grid lines, axes, or OFF dots.
 *
 * @param {Uint8Array} data - pin data (ON = truthy)
 * @param {number} cols
 * @param {number} rows
 * @param {string} fileName
 * @param {object} [opts] - { cell, color, pad }
 */
export function exportPng(data, cols, rows, fileName, opts = {}) {
  const cell  = opts.cell  ?? 16;            // px per pin (export resolution, zoom-independent)
  const color = opts.color ?? '#1C1C1E';     // dot color, matches on-screen DOT_ON
  const pad   = opts.pad   ?? cell;          // transparent margin around the pattern (1 pin by default)
  const dotR  = cell * 0.40;                 // matches on-screen rOn ratio

  const cv = document.createElement('canvas');
  cv.width  = cols * cell + pad * 2;
  cv.height = rows * cell + pad * 2;
  const ctx = cv.getContext('2d');
  // background left transparent on purpose — do NOT fillRect.

  ctx.fillStyle = color;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!data[y * cols + x]) continue;     // only ON pins
      const cx = pad + x * cell + cell / 2;
      const cy = pad + y * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  cv.toBlob(blob => {
    if (blob) download(blob, (fileName || 'tactile') + '.png');
  }, 'image/png');
}

/**
 * Export current canvas data as JSON (debug / dev).
 */
export function exportJson(canvasData, pages, fileName, cols, rows) {
  const obj = {
    fileName,
    resolution: { cols, rows },
    pages: pages.map((p, i) => ({
      index: i,
      title: p.title,
      hex: gridToHex(p.canvasData, cols, rows),
      altText: p.altText,
    })),
  };
  download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), (fileName || 'export') + '.json');
}

/**
 * Copy current page hex to clipboard.
 */
export async function copyHexToClipboard(canvasData, cols, rows) {
  const hex = gridToHex(canvasData, cols, rows);
  await navigator.clipboard.writeText(hex);
  return hex;
}

/**
 * Infer [cols, rows] from a hex string's length for known DotPad grids.
 * Each cell is 2×4 pins = 1 byte = 2 hex chars, so hexLen = (cols/2)*(rows/4)*2.
 * Returns null if the length doesn't match a known resolution — callers
 * should then fall back to the current canvas size rather than silently
 * mis-decoding a file authored at a different resolution.
 */
const KNOWN_RESOLUTIONS = [[28, 40], [60, 40], [96, 64]];
function inferResolutionFromHexLength(hexLen) {
  for (const [cols, rows] of KNOWN_RESOLUTIONS) {
    const expected = (cols / 2) * (rows / 4) * 2;
    if (hexLen === expected) return { cols, rows };
  }
  return null;
}

/**
 * Parse a .dtms (multi-page JSON) or .dtm (single-page JSON / raw hex) file.
 * Returns { fileName, pages[], cols?, rows? }.
 *
 * cols/rows are the resolution the hex was authored at. When the source
 * doesn't declare it explicitly (raw hex, or a .dtm without `resolution`),
 * we infer it from hex length among known DotPad grids (28×40 / 60×40 /
 * 96×64) instead of leaving it null — importing at the wrong resolution
 * truncates/misaligns the pin data without any visible error.
 */
export function parseDtms(text) {
  const trimmed = text.trim();

  // Raw hex string — no JSON wrapper (some .dtm exports from DotPad Studio)
  if (/^[0-9a-fA-F\s]+$/.test(trimmed) && trimmed.length >= 2) {
    const hex = trimmed.replace(/\s/g, '');
    const res = inferResolutionFromHexLength(hex.length);
    return {
      fileName: 'Untitled',
      pages: [{ title: 'Page', hex, altText: '' }],
      cols: res?.cols ?? null,
      rows: res?.rows ?? null,
    };
  }

  const obj = JSON.parse(trimmed);

  // .dtms — multi-page bundle: { title, resolution, items[] }
  if (Array.isArray(obj.items)) {
    let cols = obj.resolution?.cols || null;
    let rows = obj.resolution?.rows || null;
    const pages = obj.items.map(item => ({
      title: item.title || 'Page',
      hex: item.graphic?.data || '',
      altText: item.text?.plain || item.text?.data || '',
    }));
    if (!cols || !rows) {
      // Infer from the first page's hex length when resolution wasn't declared.
      const res = pages[0] && inferResolutionFromHexLength((pages[0].hex || '').length);
      if (res) { cols = res.cols; rows = res.rows; }
    }
    return { fileName: obj.title || 'Untitled', pages, cols, rows };
  }

  // .dtm — single graphic: { title?, graphic: { data } } or { graphic: { data } }
  if (obj.graphic?.data) {
    const res = obj.resolution?.cols
      ? { cols: obj.resolution.cols, rows: obj.resolution.rows }
      : inferResolutionFromHexLength(obj.graphic.data.length);
    return {
      fileName: obj.title || 'Untitled',
      pages: [{ title: obj.title || 'Page', hex: obj.graphic.data, altText: obj.text?.plain || '' }],
      cols: res?.cols ?? null,
      rows: res?.rows ?? null,
    };
  }

  // Fallback: wrapped in a single item at root level
  const hex = obj.data || obj.hex || '';
  if (hex) {
    const res = inferResolutionFromHexLength(hex.length);
    return {
      fileName: obj.title || 'Untitled',
      pages: [{ title: obj.title || 'Page', hex, altText: '' }],
      cols: res?.cols ?? null,
      rows: res?.rows ?? null,
    };
  }

  throw new Error('Unrecognized file format');
}
