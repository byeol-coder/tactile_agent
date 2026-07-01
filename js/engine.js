// ── Conversion Engine ─────────────────────────────────────────
// Pure functions — no global state dependencies.
// All functions take explicit inputs and return new values.

// ─── Resolution helpers ───────────────────────────────────────
export function makeGrid(cols, rows) {
  return { cols, rows, n: cols * rows, cc: (cols / 2) | 0, cr: (rows / 4) | 0 };
}

// ─── Source Image State ───────────────────────────────────────
/**
 * Render an <img> element into gray + alpha buffers at the target resolution.
 * Returns { grayBuf, alphaBuf } as Uint8ClampedArray.
 */
export function createSourceImageState(img, cols, rows) {
  const n = cols * rows;
  const oc = document.createElement('canvas');
  oc.width = cols; oc.height = rows;
  const o = oc.getContext('2d', { willReadFrequently: true });
  const ar = img.naturalWidth / img.naturalHeight;
  const gr = cols / rows;
  let dw, dh;
  if (ar > gr) { dw = cols; dh = Math.round(cols / ar); }
  else         { dh = rows; dw = Math.round(rows * ar); }
  dw = Math.min(dw, cols); dh = Math.min(dh, rows);
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.fillStyle = '#ffffff';
  o.fillRect(0, 0, cols, rows);
  o.drawImage(img, Math.round((cols - dw) / 2), Math.round((rows - dh) / 2), dw, dh);
  const d = o.getImageData(0, 0, cols, rows).data;
  const grayBuf  = new Uint8ClampedArray(n);
  const alphaBuf = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const r = d[i*4], g = d[i*4+1], b = d[i*4+2], a = d[i*4+3];
    alphaBuf[i] = a;
    const af = a / 255;
    const rr = r * af + 255 * (1 - af);
    const gg = g * af + 255 * (1 - af);
    const bb = b * af + 255 * (1 - af);
    grayBuf[i] = Math.round(0.2126 * rr + 0.7152 * gg + 0.0722 * bb);
  }
  return { grayBuf, alphaBuf };
}

// ─── Image Type Analysis ──────────────────────────────────────
export function analyzeImageType(grayBuf, alphaBuf, cols, rows) {
  const n = cols * rows;
  let hasAlpha = false, white = 0, dark = 0, edges = 0, midLight = 0;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) {
    if (alphaBuf[i] < 200) hasAlpha = true;
    const v = grayBuf[i] | 0; hist[v]++;
    if (v > 220) white++;
    if (v < 50)  dark++;
    if (v > 180 && v <= 220) midLight++;
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (x + 1 < cols && Math.abs(grayBuf[i] - grayBuf[i + 1]) > 35) edges++;
    if (y + 1 < rows && Math.abs(grayBuf[i] - grayBuf[i + cols]) > 35) edges++;
  }
  let acc = 0, p5 = 0, p95 = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!p5 && acc >= n * 0.05) p5 = v;
    if (acc >= n * 0.95) { p95 = v; break; }
  }
  const whiteR  = white / n;
  const darkR   = dark / n;
  const edgeR   = edges / (2 * n);
  const brightR = (white + midLight) / n;
  const spread  = p95 - p5;
  let type = 'photo';
  if (hasAlpha) type = 'transparent';
  else if (brightR > 0.60 && darkR < 0.35 && (edgeR < 0.50 || brightR > 0.70)) type = 'lineart';
  else if (spread < 60) type = 'lowcontrast';
  else if (whiteR + darkR > 0.85) type = 'lineart';
  return { hasAlpha, whiteR, darkR, edgeR, spread, brightR, type };
}

// ─── Threshold Methods ────────────────────────────────────────
function otsu(g) {
  const h = new Array(256).fill(0);
  for (const v of g) h[v | 0]++;
  const N = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * h[i];
  let sB = 0, wB = 0, mx = -1, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += h[i]; if (!wB) continue;
    const wF = N - wB; if (!wF) break;
    sB += i * h[i];
    const mB = sB / wB, mF = (sum - sB) / wF;
    const b = wB * wF * (mB - mF) ** 2;
    if (b > mx) { mx = b; t = i; }
  }
  return t;
}

function meanT(g) { let s = 0; for (const v of g) s += v; return s / g.length; }

function fillT(g, t, pol, cols, rows) {
  const o = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    let on = g[i] <= t ? 1 : 0;
    if (pol) on ^= 1;
    o[i] = on;
  }
  return o;
}

function integral(g, cols, rows) {
  const W = cols + 1;
  const I = new Float64Array(W * (rows + 1));
  const I2 = new Float64Array(W * (rows + 1));
  for (let y = 1; y <= rows; y++) for (let x = 1; x <= cols; x++) {
    const v = g[(y - 1) * cols + (x - 1)];
    I[y * W + x]  = v     + I[(y-1)*W+x] + I[y*W+x-1] - I[(y-1)*W+x-1];
    I2[y * W + x] = v * v + I2[(y-1)*W+x] + I2[y*W+x-1] - I2[(y-1)*W+x-1];
  }
  return { I, I2, W };
}

function box(II, x0, y0, x1, y1) {
  const { I, I2, W } = II;
  const s  = I[y1*W+x1]  - I[y0*W+x1]  - I[y1*W+x0]  + I[y0*W+x0];
  const s2 = I2[y1*W+x1] - I2[y0*W+x1] - I2[y1*W+x0] + I2[y0*W+x0];
  const n  = (x1 - x0) * (y1 - y0);
  const m  = s / n;
  const v  = Math.max(0, s2 / n - m * m);
  return { m, sd: Math.sqrt(v) };
}

function adaptiveFill(g, win, C, pol, cols, rows) {
  const II = integral(g, cols, rows);
  const o = new Uint8Array(cols * rows);
  const r = win >> 1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const x0 = Math.max(0, x-r), y0 = Math.max(0, y-r);
    const x1 = Math.min(cols, x+r+1), y1 = Math.min(rows, y+r+1);
    const { m } = box(II, x0, y0, x1, y1);
    let on = g[y * cols + x] <= (m - C) ? 1 : 0;
    if (pol) on ^= 1;
    o[y * cols + x] = on;
  }
  return o;
}

function sauvolaFill(g, win, k, pol, cols, rows) {
  const II = integral(g, cols, rows);
  const o = new Uint8Array(cols * rows);
  const r = win >> 1, R = 128;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const x0 = Math.max(0, x-r), y0 = Math.max(0, y-r);
    const x1 = Math.min(cols, x+r+1), y1 = Math.min(rows, y+r+1);
    const { m, sd } = box(II, x0, y0, x1, y1);
    const T = m * (1 + k * ((sd / R) - 1));
    let on = g[y * cols + x] <= T ? 1 : 0;
    if (pol) on ^= 1;
    o[y * cols + x] = on;
  }
  return o;
}

function alphaMask(alphaBuf, pol, n) {
  const o = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let on = alphaBuf[i] >= 128 ? 1 : 0;
    if (pol) on ^= 1;
    o[i] = on;
  }
  return o;
}

// ─── Morphology ───────────────────────────────────────────────
function nb(g, x, y, cols, rows, diag) {
  let n = 0;
  const d = diag
    ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
    : [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [a, b] of d) {
    const nx = x + a, ny = y + b;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && g[ny * cols + nx]) n++;
  }
  return n;
}

function erode4(g, cols, rows) {
  const o = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    o[i] = (g[i] && nb(g, x, y, cols, rows, false) === 4) ? 1 : 0;
  }
  return o;
}

function dilate4(g, cols, rows) {
  const o = new Uint8Array(g);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!g[y * cols + x]) continue;
    for (const [a, b] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + a, ny = y + b;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) o[ny * cols + nx] = 1;
    }
  }
  return o;
}

function sobelEdge(gray, cols, rows, thr = 40) {
  const o = new Uint8Array(cols * rows);
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
    const Gx =
      -gray[(y-1)*cols+(x-1)] - 2*gray[y*cols+(x-1)] - gray[(y+1)*cols+(x-1)]
      +gray[(y-1)*cols+(x+1)] + 2*gray[y*cols+(x+1)] + gray[(y+1)*cols+(x+1)];
    const Gy =
      -gray[(y-1)*cols+(x-1)] - 2*gray[(y-1)*cols+x] - gray[(y-1)*cols+(x+1)]
      +gray[(y+1)*cols+(x-1)] + 2*gray[(y+1)*cols+x] + gray[(y+1)*cols+(x+1)];
    if (Math.sqrt(Gx*Gx + Gy*Gy) > thr) o[y * cols + x] = 1;
  }
  return o;
}

function denoiseG(g, cols, rows) {
  const o = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    o[y * cols + x] = (g[y * cols + x] && nb(g, x, y, cols, rows, true) >= 2) ? 1 : 0;
  return o;
}

export function components(g, cols, rows, diag) {
  const lab = new Int16Array(cols * rows).fill(-1);
  const sizes = [];
  let id = 0;
  const st = [];
  const dirs = diag
    ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
    : [[1,0],[-1,0],[0,1],[0,-1]];
  for (let i = 0; i < cols * rows; i++) {
    if (g[i] && lab[i] < 0) {
      let cnt = 0; st.length = 0; st.push(i); lab[i] = id;
      while (st.length) {
        const p = st.pop(); cnt++;
        const px = p % cols, py = (p / cols) | 0;
        for (const [a, b] of dirs) {
          const nx = px + a, ny = py + b;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
            const q = ny * cols + nx;
            if (g[q] && lab[q] < 0) { lab[q] = id; st.push(q); }
          }
        }
      }
      sizes.push(cnt); id++;
    }
  }
  return { lab, sizes, count: id };
}

function removeSmall(g, minSize, cols, rows) {
  const { lab, sizes } = components(g, cols, rows, true);
  const o = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++)
    if (g[i] && sizes[lab[i]] >= minSize) o[i] = 1;
  return o;
}

function boundary(m, cols, rows) {
  const o = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (!m[i]) continue;
    let edge = false;
    for (const [a, b] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + a, ny = y + b;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !m[ny * cols + nx]) { edge = true; break; }
    }
    if (edge) o[i] = 1;
  }
  return o;
}

function outline1(m, cols, rows) { return removeSmall(boundary(m, cols, rows), 2, cols, rows); }

function outline2(m, cols, rows) {
  const o1 = boundary(m, cols, rows);
  const inner = boundary(erode4(m, cols, rows), cols, rows);
  let o2 = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) o2[i] = (o1[i] || inner[i]) ? 1 : 0;
  let c1 = 0, c2 = 0;
  for (let i = 0; i < cols * rows; i++) { c1 += o1[i]; c2 += o2[i]; }
  if (c2 < c1 * 1.25) return { grid: o1, fellback: true };
  return { grid: removeSmall(o2, 2, cols, rows), fellback: false };
}

function applyOutline(m, mode, cols, rows) {
  if (mode === 1) return outline1(m, cols, rows);
  if (mode === 2) return outline2(m, cols, rows).grid;
  return m;
}

// ─── Base Mask ────────────────────────────────────────────────
export function computeBaseMask(grayBuf, alphaBuf, cols, rows, convState) {
  const n = cols * rows;
  const { method, threshold, invert } = convState;
  if (method === 'alpha') return alphaMask(alphaBuf, invert, n);
  if (method === 'otsu')  return fillT(grayBuf, otsu(grayBuf), invert, cols, rows);
  if (method === 'global') return fillT(grayBuf, threshold, invert, cols, rows);
  if (method === 'mean')  return fillT(grayBuf, meanT(grayBuf), invert, cols, rows);
  if (method === 'sauvola') return sauvolaFill(grayBuf, 15, 0.2, invert, cols, rows);
  if (method === 'adaptive') return adaptiveFill(grayBuf, 9, 8, invert, cols, rows);
  return fillT(grayBuf, threshold, invert, cols, rows);
}

// ─── Full Conversion Pipeline ─────────────────────────────────
export function convertToDots(sourceImageState, convState, cols, rows) {
  if (!sourceImageState) return new Uint8Array(cols * rows);
  const { grayBuf, alphaBuf } = sourceImageState;

  let m;
  if (convState.edge === 'sobel') {
    m = sobelEdge(grayBuf, cols, rows);
    if (convState.invert) { for (let i = 0; i < m.length; i++) m[i] ^= 1; }
  } else {
    m = computeBaseMask(grayBuf, alphaBuf, cols, rows, convState);
  }

  if (convState.dilate)  m = dilate4(m, cols, rows);
  if (convState.erode)   m = erode4(m, cols, rows);
  if (convState.denoise) m = denoiseG(m, cols, rows);

  const cleaned = removeSmall(m, convState.minComp ?? 2, cols, rows);
  return applyOutline(cleaned, convState.outline ?? 0, cols, rows);
}

// ─── Auto-Select Best Params ──────────────────────────────────
/**
 * Analyze the image and return the best conversionState.
 * Does NOT modify any external state.
 */
export function autoSelectParams(sourceImageState, cols, rows) {
  if (!sourceImageState) return {};
  const { grayBuf, alphaBuf } = sourceImageState;
  const meta = analyzeImageType(grayBuf, alphaBuf, cols, rows);
  const { type } = meta;
  let method = 'global', invert = false, outline = 0;
  let threshold = otsu(grayBuf);

  if (meta.hasAlpha) {
    const onCnt = alphaMask(alphaBuf, false, cols * rows).reduce((s, v) => s + v, 0);
    invert = onCnt / (cols * rows) > 0.65;
    method = 'alpha';
  } else if (type === 'lineart') {
    method = 'otsu';
    const rawOn = fillT(grayBuf, threshold, false, cols, rows).reduce((s, v) => s + v, 0);
    if (rawOn / (cols * rows) > 0.6) invert = true;
  } else if (type === 'lowcontrast') {
    method = 'adaptive';
  } else {
    method = 'otsu';
    const rawOn = fillT(grayBuf, threshold, false, cols, rows).reduce((s, v) => s + v, 0);
    if (rawOn / (cols * rows) > 0.72) invert = true;
  }

  return { method, threshold, invert, outline, minComp: 2 };
}

// ─── DotPad Optimization Search ───────────────────────────────
/**
 * Search a bounded space of conversion params and return the one that
 * maximizes tactile readability on the target pin grid.
 * This is the core "DotPad 최적화" routine — it does NOT mutate state.
 *
 * @returns {{ params: object, score: number, grade: number }}
 */
export function optimizeForDotPad(sourceImageState, cols, rows, opts = {}) {
  if (!sourceImageState) return { params: {}, score: 0, grade: 1 };
  const { grayBuf, alphaBuf } = sourceImageState;
  const meta = analyzeImageType(grayBuf, alphaBuf, cols, rows);

  // Candidate axes — kept bounded (~40 evals) for instant response.
  const base = autoSelectParams(sourceImageState, cols, rows);
  const ot = otsu(grayBuf);
  const methods = meta.hasAlpha ? ['alpha'] : ['otsu', 'adaptive', 'global'];
  const thresholds = [ot - 30, ot - 15, ot, ot + 15, ot + 30]
    .map(v => Math.max(20, Math.min(240, v)));
  const outlines = [0, 1];
  const denoises = [false, true];

  let best = null;
  const evalParams = (p) => {
    const conv = { method: 'global', threshold: ot, invert: false,
      outline: 0, minComp: 2, dilate: false, erode: false, denoise: false, edge: 'none', ...p };
    const grid = convertToDots(sourceImageState, conv, cols, rows);
    const on = grid.reduce((s, v) => s + v, 0);
    // Reject empty / saturated results outright.
    const dens = on / (cols * rows);
    if (dens < 0.02 || dens > 0.6) return;
    const q = tactileQualityScore(grid, cols, rows, { type: meta.type, outline: conv.outline });
    if (!best || q.score > best.score) best = { params: conv, score: q.score, grade: q.grade };
  };

  for (const method of methods) {
    if (method === 'global') {
      for (const threshold of thresholds)
        for (const outline of outlines)
          for (const denoise of denoises)
            evalParams({ method, threshold, invert: base.invert, outline, denoise });
    } else {
      for (const outline of outlines)
        for (const denoise of denoises) {
          evalParams({ method, invert: base.invert, outline, denoise });
          // also try inverted, in case auto-detect picked the wrong polarity
          evalParams({ method, invert: !base.invert, outline, denoise });
        }
    }
  }

  // Fallback: if everything was rejected, return the safe auto params.
  if (!best) {
    const grid = convertToDots(sourceImageState, base, cols, rows);
    const q = tactileQualityScore(grid, cols, rows, { type: meta.type, outline: base.outline });
    best = { params: { ...base, dilate: false, erode: false, denoise: false, edge: 'none' }, score: q.score, grade: q.grade };
  }
  return best;
}

// ─── Tactile Quality Score ────────────────────────────────────
function metricsOf(g, cols, rows) {
  let on = 0, iso = 0, ends = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (!g[i]) continue;
    on++;
    const k = nb(g, x, y, cols, rows, true);
    if (k < 1) iso++; else if (k === 1) ends++;
  }
  const { sizes } = components(g, cols, rows, true);
  const count = sizes.length;
  const major = sizes.length ? Math.max(...sizes) : 0;
  let sx = 0, sy = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    if (g[y * cols + x]) { sx += x; sy += y; }
  const cx = on ? sx / on : cols / 2, cy = on ? sy / on : rows / 2;
  const centerOff = Math.hypot((cx - (cols - 1) / 2) / (cols / 2), (cy - (rows - 1) / 2) / (rows / 2));
  const density = on / (cols * rows);
  return { on, iso, ends, count, major, density, majorFrac: on ? major / on : 0, centerOff };
}

export function tactileQualityScore(g, cols, rows, bias = {}) {
  const n = cols * rows;
  const m = metricsOf(g, cols, rows);
  if (m.on < 8) return { score: 8, grade: 1, m };
  let s = 100;
  const dn = m.density;
  if (dn < 0.05)       s -= 45;
  else if (dn < 0.08)  s -= 18;
  else if (dn > 0.5)   s -= 40;
  else if (dn > 0.42)  s -= 16;
  s -= Math.min(30, (m.iso / m.on) * 120);
  s -= Math.min(18, (m.ends / m.on) * 55);
  s -= Math.min(22, Math.max(0, m.count - 3) * 3);
  s += Math.min(8, (m.majorFrac - 0.5) * 16);
  s -= Math.min(10, m.centerOff * 10);
  if (bias.type === 'lineart' && bias.outline === 0) s += 4;
  if (bias.type === 'photo'   && bias.outline === 1) s += 3;
  s = Math.max(0, Math.min(100, s));
  let grade = 1;
  if (s >= 84) grade = 4;
  else if (s >= 68) grade = 3;
  else if (s >= 48) grade = 2;
  return { score: s, grade, m };
}

export function gradeReason(g, m, lang = 'ko') {
  if (!m) return '';
  if (g >= 3) {
    if (m.iso / Math.max(1, m.on) < 0.08 && m.count <= 4)
      return lang === 'ko' ? '외곽선이 연결되어 있고 작은 점이 적습니다.' : 'Outlines are connected and isolated dots are minimal.';
    return lang === 'ko' ? '형태가 또렷하고 손끝으로 구분하기 좋습니다.' : 'Shape is clear and easy to distinguish by touch.';
  }
  if (m.density < 0.06)
    return lang === 'ko' ? '핀이 너무 적어요. 촉각 선명도를 높여보세요.' : 'Too few pins. Try increasing density.';
  if (m.density > 0.45)
    return lang === 'ko' ? '너무 빽빽해요. 외곽선 1줄을 사용해 보세요.' : 'Too dense. Try using 1-line outline.';
  if (m.iso / Math.max(1, m.on) > 0.18)
    return lang === 'ko' ? '작은 점이 많아요. 작은 점 정리를 추천해요.' : 'Many isolated dots. Try denoising.';
  return lang === 'ko' ? '형태를 더 단순하게 다듬으면 좋아요.' : 'Simplifying the shape would help.';
}

// ─── Density Proofing ─────────────────────────────────────────
/**
 * Inspect a grid for tactile crowding.
 * "crowded" = an on-pin whose 8-neighbourhood is (almost) fully raised —
 * the interior of a solid blob, which is hard to read by touch.
 * @returns {{pct:number, on:number, crowded:number, crowdFrac:number, level:'ok'|'mid'|'high', mask:Uint8Array}}
 */
export function analyzeDensity(grid, cols, rows) {
  const n = cols * rows;
  let on = 0, crowded = 0;
  const mask = new Uint8Array(n);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (!grid[i]) continue;
    on++;
    if (nb(grid, x, y, cols, rows, true) >= 7) { mask[i] = 1; crowded++; }
  }
  const pct = Math.round(on / n * 100);
  const crowdFrac = on ? crowded / on : 0;
  const level = (pct >= 45 || crowdFrac > 0.4) ? 'high'
    : (pct >= 30 || crowdFrac > 0.22) ? 'mid' : 'ok';
  return { pct, on, crowded, crowdFrac, level, mask };
}

/**
 * Thin overly dense regions by peeling fully-surrounded interior pins,
 * converting solid blobs toward readable outlines. Edges are preserved.
 * @returns {Uint8Array}
 */
export function autoThinDots(grid, cols, rows, maxIter = 6) {
  let g = new Uint8Array(grid);
  for (let it = 0; it < maxIter; it++) {
    const d = analyzeDensity(g, cols, rows);
    if (d.level === 'ok' || d.crowded === 0) break;
    const next = new Uint8Array(g);
    let changed = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (g[i] && nb(g, x, y, cols, rows, true) === 8) { next[i] = 0; changed++; }
    }
    if (!changed) break;
    g = next;
  }
  return g;
}

// ─── Encoder (column-major, DotPad HEX format) ───────────────
const dotBit = (lx, ly) => lx * 4 + ly;

export function gridToHex(data, cols, rows) {
  const cc = (cols / 2) | 0, cr = (rows / 4) | 0;
  let hex = '';
  for (let r = 0; r < cr; r++) for (let c = 0; c < cc; c++) {
    let b = 0;
    for (let lx = 0; lx < 2; lx++) for (let ly = 0; ly < 4; ly++) {
      const x = c * 2 + lx, y = r * 4 + ly;
      if (data[y * cols + x]) b |= (1 << dotBit(lx, ly));
    }
    hex += b.toString(16).padStart(2, '0').toUpperCase();
  }
  return hex;
}

export function hexToGrid(hex, cols, rows) {
  const cc = (cols / 2) | 0, cr = (rows / 4) | 0;
  const data = new Uint8Array(cols * rows);
  let idx = 0;
  for (let r = 0; r < cr; r++) for (let c = 0; c < cc; c++) {
    const b = parseInt(hex.substr(idx * 2, 2), 16) || 0; idx++;
    for (let lx = 0; lx < 2; lx++) for (let ly = 0; ly < 4; ly++) {
      if ((b >> dotBit(lx, ly)) & 1) {
        const x = c * 2 + lx, y = r * 4 + ly;
        data[y * cols + x] = 1;
      }
    }
  }
  return data;
}

// ─── DTMS Export ──────────────────────────────────────────────
export function buildDtmsJSON(pages, fileName, cols, rows) {
  const name = (fileName || 'Untitled').trim();
  const items = pages.map((page, i) => ({
    page: i + 1,
    title: name + (pages.length > 1 ? (' ' + (i + 1)) : ''),
    graphic: { name: (i + 1) + '.dtm', data: gridToHex(page.canvasData, cols, rows) },
    text: { name: (i + 1) + '.txt', data: page.altText || '', plain: name },
    audio: { fileName: '' },
  }));
  return JSON.stringify({ title: name, lang: 'korean', lang_option: '1', device: 'dotpad320', audioPath: '', items }, null, 2);
}

// ─── Braille (KO Grade 1, 20-cell layout) ────────────────────
const BRL_MAP = {
  'ㄱ':'⠈','ㄴ':'⠉','ㄷ':'⠊','ㄹ':'⠐','ㅁ':'⠑','ㅂ':'⠘','ㅅ':'⠠','ㅇ':'⠿','ㅈ':'⠨','ㅊ':'⠩',
  'ㅋ':'⠪','ㅌ':'⠫','ㅍ':'⠬','ㅎ':'⠭','ㅏ':'⠣','ㅐ':'⠜','ㅑ':'⠜','ㅒ':'⠜','ㅓ':'⠎','ㅔ':'⠟',
  'ㅕ':'⠡','ㅖ':'⠜','ㅗ':'⠥','ㅘ':'⠧','ㅙ':'⠧','ㅚ':'⠧','ㅛ':'⠪','ㅜ':'⠍','ㅝ':'⠏','ㅞ':'⠏',
  'ㅟ':'⠏','ㅠ':'⠼','ㅡ':'⠔','ㅢ':'⠔','ㅣ':'⠗',
  ' ':'⠀',
};

export function textToBraillePages(text, cellsPerLine = 20) {
  if (!text) return [];
  const chars = [...text].map(c => BRL_MAP[c] ?? (c.match(/[a-zA-Z0-9]/) ? c : '⠿'));
  const lines = [];
  for (let i = 0; i < chars.length; i += cellsPerLine)
    lines.push(chars.slice(i, i + cellsPerLine).join(''));
  return lines;
}
