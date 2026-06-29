// ── Tactile Generators ────────────────────────────────────────
// Pure functions that synthesize a dot grid (Uint8Array) from scratch.
// Used by the command palette so the prompt can CREATE, not just transform.

import { components } from './engine.js';

const idx = (x, y, cols) => y * cols + x;
const inB = (x, y, cols, rows) => x >= 0 && y >= 0 && x < cols && y < rows;

function plot(g, x, y, cols, rows) {
  if (inB(Math.round(x), Math.round(y), cols, rows)) g[idx(Math.round(x), Math.round(y), cols)] = 1;
}

function line(g, x0, y0, x1, y1, cols, rows) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    plot(g, x0, y0, cols, rows);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function ellipse(g, cx, cy, rx, ry, cols, rows, fill) {
  if (fill) {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) g[idx(x, y, cols)] = 1;
    }
    return;
  }
  const steps = Math.max(64, Math.ceil((rx + ry) * 4));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    plot(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cols, rows);
  }
}

function polygon(g, pts, cols, rows, fill) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    line(g, ax, ay, bx, by, cols, rows);
  }
  if (!fill) return;
  for (let y = 0; y < rows; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y))
        xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++)
        if (inB(x, y, cols, rows)) g[idx(x, y, cols)] = 1;
  }
}

/**
 * Draw a named primitive into a fresh grid.
 * @returns {Uint8Array}
 */
export function drawPrimitive(cols, rows, shape, opts = {}) {
  const g = new Uint8Array(cols * rows);
  const fill = !!opts.fill;
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const m = Math.round(Math.min(cols, rows) * 0.08) + 1;   // margin
  const rx = (cols - 1) / 2 - m, ry = (rows - 1) / 2 - m;
  const r = Math.min(rx, ry);

  switch (shape) {
    case 'circle': ellipse(g, cx, cy, r, r, cols, rows, fill); break;
    case 'ellipse': ellipse(g, cx, cy, rx, ry, cols, rows, fill); break;
    case 'rect': polygon(g, [[m, m], [cols - 1 - m, m], [cols - 1 - m, rows - 1 - m], [m, rows - 1 - m]], cols, rows, fill); break;
    case 'square': {
      const s = Math.min(rx, ry);
      polygon(g, [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]], cols, rows, fill);
      break;
    }
    case 'triangle': polygon(g, [[cx, m], [cols - 1 - m, rows - 1 - m], [m, rows - 1 - m]], cols, rows, fill); break;
    case 'diamond': polygon(g, [[cx, m], [cols - 1 - m, cy], [cx, rows - 1 - m], [m, cy]], cols, rows, fill); break;
    case 'line': line(g, m, cy, cols - 1 - m, cy, cols, rows); break;
    case 'diagonal': line(g, m, rows - 1 - m, cols - 1 - m, m, cols, rows); break;
    case 'cross':
      line(g, m, cy, cols - 1 - m, cy, cols, rows);
      line(g, cx, m, cx, rows - 1 - m, cols, rows);
      break;
    case 'x':
      line(g, m, m, cols - 1 - m, rows - 1 - m, cols, rows);
      line(g, cols - 1 - m, m, m, rows - 1 - m, cols, rows);
      break;
    case 'arrow':
      line(g, m, cy, cols - 1 - m, cy, cols, rows);
      line(g, cols - 1 - m, cy, cols - 1 - m - r * 0.5, cy - r * 0.5, cols, rows);
      line(g, cols - 1 - m, cy, cols - 1 - m - r * 0.5, cy + r * 0.5, cols, rows);
      break;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 === 0 ? r : r * 0.4;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      polygon(g, pts, cols, rows, fill);
      break;
    }
    case 'heart': {
      const s = r * 1.1, steps = 120;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        plot(g, cx + (hx / 17) * s, cy - (hy / 17) * s, cols, rows);
      }
      break;
    }
    case 'sine':
    case 'cosine': {
      const amp = ry * 0.8, mid = cy, phase = shape === 'cosine' ? Math.PI / 2 : 0;
      for (let x = m; x <= cols - 1 - m; x++) {
        const t = (x - m) / (cols - 1 - 2 * m);
        plot(g, x, mid - Math.sin(t * Math.PI * 2 + phase) * amp, cols, rows);
      }
      break;
    }
    case 'border':
      polygon(g, [[0, 0], [cols - 1, 0], [cols - 1, rows - 1], [0, rows - 1]], cols, rows, false);
      break;
    case 'grid': {
      const gap = Math.max(4, Math.round(cols / 10));
      for (let x = 0; x < cols; x += gap) for (let y = 0; y < rows; y++) g[idx(x, y, cols)] = 1;
      for (let y = 0; y < rows; y += gap) for (let x = 0; x < cols; x++) g[idx(x, y, cols)] = 1;
      break;
    }
    default: ellipse(g, cx, cy, r, r, cols, rows, fill);
  }
  return g;
}

export const SHAPE_NAMES = [
  'circle', 'ellipse', 'rect', 'square', 'triangle', 'diamond',
  'line', 'diagonal', 'cross', 'x', 'arrow', 'star', 'heart',
  'sine', 'cosine', 'border', 'grid',
];

// ── Braille cell rendering ────────────────────────────────────
// Each unicode braille char (U+2800..) encodes up to 8 dots:
//   bit 0,1,2 = left column rows 1,2,3 ; bit 3,4,5 = right column rows 1,2,3
//   bit 6,7   = row 4 (8-dot). DotPad uses 6-dot cells (2 wide × 3 tall).
const BR_BITS = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];

/**
 * Render a braille-unicode string array (lines) into a dot grid.
 * Cell = 2 cols × 3 rows, +1 col gap, +1 row gap between lines.
 * @param {string[]} lines  output of textToBraillePages
 * @returns {Uint8Array}
 */
export function renderBrailleGrid(lines, cols, rows) {
  const g = new Uint8Array(cols * rows);
  const cellW = 3, cellH = 4;   // 2 dots + 1 gap, 3 dots + 1 gap
  let row = 1;
  for (const lineStr of lines) {
    let col = 1;
    for (const ch of [...lineStr]) {
      const code = ch.charCodeAt(0) - 0x2800;
      if (code >= 0) {
        for (let b = 0; b < 8; b++) {
          if (code & (1 << b)) {
            const [dx, dy] = BR_BITS[b];
            const x = col + dx, y = row + dy;
            if (inB(x, y, cols, rows)) g[idx(x, y, cols)] = 1;
          }
        }
      }
      col += cellW;
      if (col + 2 > cols) break;
    }
    row += cellH;
    if (row + 3 > rows) break;
  }
  return g;
}

// ── Tactile description (pure-JS, no API) ─────────────────────
/**
 * Generate a short human description of the current dot grid:
 * dominant shape guess, density, structure, symmetry.
 * @returns {string}
 */
export function describeTactile(grid, cols, rows, lang = 'ko') {
  const n = cols * rows;
  let on = 0, sx = 0, sy = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (grid[idx(x, y, cols)]) { on++; sx += x; sy += y; }
  }
  if (on === 0) return lang === 'ko' ? '빈 캔버스예요. 점이 하나도 없습니다.' : 'Empty canvas — no dots yet.';

  const dens = on / n;
  const cx = sx / on, cy = sy / on;
  const { count, sizes } = components(grid, cols, rows, true);
  const major = sizes.length ? Math.max(...sizes) : 0;
  const majorFrac = on ? major / on : 0;

  // horizontal symmetry score
  let sym = 0, tot = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < (cols >> 1); x++) {
    const a = grid[idx(x, y, cols)], b = grid[idx(cols - 1 - x, y, cols)];
    tot++; if (a === b) sym++;
  }
  const symR = tot ? sym / tot : 0;

  const densTxt = dens < 0.08 ? (lang === 'ko' ? '점이 드문' : 'sparse')
    : dens < 0.25 ? (lang === 'ko' ? '적당한 밀도의' : 'moderate-density')
    : (lang === 'ko' ? '점이 빽빽한' : 'dense');
  const structTxt = majorFrac > 0.8 ? (lang === 'ko' ? '하나의 큰 형태' : 'one large shape')
    : count <= 4 ? (lang === 'ko' ? `${count}개의 형태` : `${count} shapes`)
    : (lang === 'ko' ? '여러 갈래로 흩어진 구조' : 'scattered structure');
  const symTxt = symR > 0.9 ? (lang === 'ko' ? '좌우 대칭' : 'left-right symmetric')
    : symR > 0.7 ? (lang === 'ko' ? '대체로 대칭' : 'mostly symmetric')
    : (lang === 'ko' ? '비대칭' : 'asymmetric');
  const posTxt = Math.hypot(cx - cols / 2, cy - rows / 2) < Math.min(cols, rows) * 0.12
    ? (lang === 'ko' ? '중앙에' : 'centered')
    : (lang === 'ko' ? '한쪽으로 치우쳐' : 'off-center');

  if (lang === 'ko') {
    return `${densTxt} 그래픽이에요. ${structTxt}가 ${posTxt} 자리하고 ${symTxt}입니다. 점 ${on}개(${Math.round(dens * 100)}%).`;
  }
  return `A ${densTxt} graphic: ${structTxt}, ${posTxt} and ${symTxt}. ${on} dots (${Math.round(dens * 100)}%).`;
}
