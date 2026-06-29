// ── Symbol Pack ──────────────────────────────────────────────
// Curated, hand-tuned tactile symbols for the DotPad (60×40 / 96×64).
//
// Why procedural (not bitmaps): symbols stay crisp at any supported
// resolution and are trivially editable. Each symbol draws bold,
// centered, symmetric silhouettes — the only form that reads reliably
// at 2,400 pins.
//
// Design space is a normalized 60×40 grid. At render time every
// coordinate is scaled by s = cols/60 (== rows/40 for both 60×40 and
// 96×64, so a single uniform scale is exact).
//
// Output: Uint8Array(cols*rows), index = y*cols + x, value 0|1
//   — identical layout to state.js `page.canvasData`.

// ── Drawing context (design-space → actual pixels) ──
function makeCtx(cols, rows) {
  const s = cols / 60;                       // uniform scale (60×40 & 96×64)
  const g = new Uint8Array(cols * rows);
  const inb = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;
  // design coord (dx,dy) → set pin
  const set = (dx, dy) => {
    const x = Math.round(dx * s), y = Math.round(dy * s);
    if (inb(x, y)) g[y * cols + x] = 1;
  };
  const clear = (dx, dy) => {                 // carve a hole (e.g. fish eye)
    const x = Math.round(dx * s), y = Math.round(dy * s);
    if (inb(x, y)) g[y * cols + x] = 0;
  };
  return { g, cols, rows, s, set, clear };
}

// All primitives operate in design space (0..60 × 0..40).
function dot(c, x, y, r = 1) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r + 0.3) c.set(x + dx, y + dy);
}
function line(c, x0, y0, x1, y1, t = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx - dy;
  const r = Math.max(0, (t - 1) / 2 | 0);
  while (true) {
    dot(c, x0, y0, r);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 > -dy) { e -= dy; x0 += sx; }
    if (e2 < dx) { e += dx; y0 += sy; }
  }
}
function poly(c, pts, t = 1) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    line(c, a[0], a[1], b[0], b[1], t);
  }
}
function fillPoly(c, pts) {
  let minY = 1e9, maxY = -1e9;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(40, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const y0 = a[1], y1 = b[1];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y))
        xs.push(a[0] + (y - y0) / (y1 - y0) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i < xs.length; i += 2) {
      const xa = Math.ceil(xs[i]), xb = Math.floor(xs[i + 1]);
      for (let x = xa; x <= xb; x++) c.set(x, y);
    }
  }
}
function circle(c, cx, cy, rad, t = 1) {
  const r0 = rad - (t - 1) / 2, r1 = rad + (t - 1) / 2;
  for (let y = Math.floor(cy - r1 - 1); y <= Math.ceil(cy + r1 + 1); y++)
    for (let x = Math.floor(cx - r1 - 1); x <= Math.ceil(cx + r1 + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r0 - 0.5 && d <= r1 + 0.5) c.set(x, y);
    }
}
function fillCircle(c, cx, cy, rad) {
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++)
      if (Math.hypot(x - cx, y - cy) <= rad + 0.3) c.set(x, y);
}
function ellipse(c, cx, cy, rx, ry, t = 1) {
  const steps = 180; let px, py;
  for (let i = 0; i <= steps; i++) {
    const a = i / steps * 2 * Math.PI;
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    if (i > 0) line(c, px, py, x, y, t);
    px = x; py = y;
  }
}
function fillEllipse(c, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.02) c.set(x, y);
    }
}
function rect(c, x0, y0, x1, y1, t = 1) { poly(c, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], t); }

const CX = 30, CY = 20;   // design-space center

// ── Symbol drawing functions ──
const DRAW = {
  earth(c) {                                    // 지구
    circle(c, CX, CY, 16, 2);
    for (const yy of [-8, 0, 8]) {              // 위선
      const w = Math.sqrt(Math.max(0, 256 - yy * yy)) - 1;
      line(c, CX - w, CY + yy, CX + w, CY + yy, 1.5);
    }
    ellipse(c, CX, CY, 6, 16, 1.5);             // 경선
    ellipse(c, CX, CY, 13, 16, 1.5);
  },
  butterfly(c) {                                // 나비
    fillEllipse(c, CX, CY, 1.6, 11);            // 몸통
    for (const s of [-1, 1]) {
      fillEllipse(c, CX + s * 10, CY - 6, 8.5, 7.5);   // 윗날개
      fillEllipse(c, CX + s * 8, CY + 7, 6.5, 6);      // 아랫날개
    }
    for (const s of [-1, 1]) {                  // 더듬이
      line(c, CX, CY - 10, CX + s * 5, CY - 16, 1.5);
      dot(c, CX + s * 5, CY - 16, 1);
    }
  },
  heart(c) {                                    // 하트
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120 * 2 * Math.PI;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([CX + x, CY + y + 2]);
    }
    fillPoly(c, pts);
  },
  star(c) {                                     // 별
    const pts = [], R = 17, r = 7;
    for (let i = 0; i < 10; i++) {
      const rad = (i % 2 === 0) ? R : r;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([CX + rad * Math.cos(a), CY + rad * Math.sin(a) + 1]);
    }
    fillPoly(c, pts);
  },
  house(c) {                                    // 집
    fillPoly(c, [[CX, CY - 15], [CX - 18, CY - 1], [CX + 18, CY - 1]]);  // 지붕
    rect(c, CX - 13, CY - 1, CX + 13, CY + 15, 2);                       // 벽
    rect(c, CX - 4, CY + 5, CX + 4, CY + 15, 2);                         // 문
  },
  tree(c) {                                     // 나무
    fillCircle(c, CX, CY - 5, 13);
    for (let y = CY + 8; y <= CY + 17; y++)
      for (let x = CX - 3; x <= CX + 3; x++) c.set(x, y);               // 기둥
  },
  sun(c) {                                      // 태양
    fillCircle(c, CX, CY, 9);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      line(c, CX + 12 * Math.cos(a), CY + 12 * Math.sin(a),
            CX + 18 * Math.cos(a), CY + 18 * Math.sin(a), 2);
    }
  },
  flower(c) {                                   // 꽃
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 2;
      fillEllipse(c, CX + 10 * Math.cos(a), CY + 10 * Math.sin(a), 5, 5);
    }
    fillCircle(c, CX, CY, 4);
    line(c, CX, CY + 15, CX, CY + 19, 2);
  },
  fish(c) {                                     // 물고기
    fillEllipse(c, CX - 2, CY, 16, 9);
    fillPoly(c, [[CX + 12, CY], [CX + 20, CY - 8], [CX + 20, CY + 8]]);  // 꼬리
    // 눈: 채움 속에 구멍을 파서 보이게
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c.clear(CX - 9 + dx, CY - 3 + dy);
  },
  arrow(c) {                                    // 화살표
    line(c, CX - 16, CY, CX + 10, CY, 3);
    fillPoly(c, [[CX + 18, CY], [CX + 6, CY - 9], [CX + 6, CY + 9]]);
  },
};

// ── Public registry: id → {ko, emoji, keywords[]} ──
export const SYMBOLS = {
  earth:     { ko: '지구',   emoji: '🌍', keywords: ['지구', '지구본', '글로브', '세계', '행성', 'earth', 'globe', 'world', 'planet', '🌍', '🌎', '🌏'] },
  butterfly: { ko: '나비',   emoji: '🦋', keywords: ['나비', 'butterfly', '🦋'] },
  heart:     { ko: '하트',   emoji: '❤️', keywords: ['하트', '사랑', '심장', 'heart', 'love', '❤️', '💛', '💙', '🩷'] },
  star:      { ko: '별',     emoji: '⭐', keywords: ['별', '별표', '스타', 'star', '⭐', '★', '✦'] },
  house:     { ko: '집',     emoji: '🏠', keywords: ['집', '주택', '가정', '하우스', 'house', 'home', '🏠', '🏡'] },
  tree:      { ko: '나무',   emoji: '🌳', keywords: ['나무', '트리', '수목', 'tree', '🌳', '🌲'] },
  sun:       { ko: '태양',   emoji: '☀️', keywords: ['태양', '해', '썬', 'sun', 'sunshine', '☀️', '🌞'] },
  flower:    { ko: '꽃',     emoji: '🌸', keywords: ['꽃', '플라워', '꽃송이', 'flower', 'blossom', '🌸', '🌼', '🌺'] },
  fish:      { ko: '물고기', emoji: '🐟', keywords: ['물고기', '생선', '어류', '피쉬', 'fish', '🐟', '🐠'] },
  arrow:     { ko: '화살표', emoji: '➡️', keywords: ['화살표', '화살', '애로우', 'arrow', '→', '➡️'] },
};

// For UI lists (palette / suggestions)
export const SYMBOL_LIST = Object.entries(SYMBOLS).map(([id, m]) => ({ id, ...m }));

/**
 * Find the best symbol id for a free-text prompt.
 * Whole-word/substring match against each symbol's keyword list.
 * @returns {string|null} symbol id, or null if no match
 */
export function findSymbol(prompt) {
  const s = String(prompt || '').toLowerCase().trim();
  if (!s) return null;
  // exact keyword first, then substring
  for (const [id, m] of Object.entries(SYMBOLS))
    if (m.keywords.some(k => k.toLowerCase() === s)) return id;
  for (const [id, m] of Object.entries(SYMBOLS))
    if (m.keywords.some(k => s.includes(k.toLowerCase()))) return id;
  return null;
}

/**
 * Render a symbol to a pin grid.
 * @param {string} id   symbol id (key of SYMBOLS)
 * @param {number} cols default 60
 * @param {number} rows default 40
 * @returns {Uint8Array} length cols*rows, 0|1
 */
export function renderSymbol(id, cols = 60, rows = 40) {
  const draw = DRAW[id];
  if (!draw) return new Uint8Array(cols * rows);
  // Always draw in the native 60×40 design buffer (solid fills, no gaps),
  // then nearest-neighbor upscale. Avoids sub-sampling holes when cols/rows
  // are larger (e.g. 96×64), and keeps the symbol's look consistent.
  const base = makeCtx(60, 40);
  draw(base);
  if (cols === 60 && rows === 40) return base.g;
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(59, Math.floor(x * 60 / cols));
      const sy = Math.min(39, Math.floor(y * 40 / rows));
      out[y * cols + x] = base.g[sy * 60 + sx];
    }
  return out;
}

/**
 * Convenience: prompt → pin grid (or null if unknown subject).
 * Wire this into commands.js routePrompt 'generate' before the AI fallback:
 *   const id = findSymbol(prompt);
 *   if (id) return renderSymbol(id, cols, rows);   // instant, readable
 *   // else → constrained T2T generation
 */
export function symbolFromPrompt(prompt, cols = 60, rows = 40) {
  const id = findSymbol(prompt);
  return id ? { id, data: renderSymbol(id, cols, rows) } : null;
}
