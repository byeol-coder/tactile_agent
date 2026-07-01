// ── Canvas Rendering ──────────────────────────────────────────
// Stateless rendering functions.
// All functions take explicit state inputs.

const BG_COLOR   = '#F4F1E8';
const GRID_LINE  = 'rgba(180,170,158,.28)';
const CELL_LINE  = 'rgba(155,145,135,.42)';
const AXIS_LINE  = 'rgba(200,175,155,.55)';
const DOT_ON     = '#1C1C1E';
const DOT_OFF    = '#DED8CF';
const HOVER_PEN  = 'rgba(255,77,0,.28)';
const HOVER_ERASE = 'rgba(185,28,28,.25)';

/**
 * Compute canvas layout so dots are square and the grid fits inside the container.
 * Returns { cellSize, offsetX, offsetY, canvasW, canvasH }
 */
export function computeCanvasLayout(containerW, containerH, cols, rows, zoom = 1) {
  const availW = containerW - 24;
  const availH = containerH - 24;
  const cw = Math.floor((availW - 12) / cols);
  const ch = Math.floor((availH - 12) / rows);
  const cellSize = Math.max(5, Math.min(20, Math.min(cw, ch))) * zoom;
  const canvasW = cols * cellSize + 12;
  const canvasH = rows * cellSize + 12;
  const offsetX = 6;
  const offsetY = 6;
  return { cellSize, offsetX, offsetY, canvasW, canvasH };
}

/**
 * Apply layout to a canvas element.
 * Returns the layout object.
 */
export function applyLayout(canvas, layout) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = layout.canvasW * dpr;
  canvas.height = layout.canvasH * dpr;
  canvas.style.width  = layout.canvasW + 'px';
  canvas.style.height = layout.canvasH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return layout;
}

/**
 * Render the dot grid.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Uint8Array} data - pin data
 * @param {number} cols
 * @param {number} rows
 * @param {object} layout - { cellSize, offsetX, offsetY, canvasW, canvasH }
 * @param {object} [opts] - { hoverCells, hoverKind, selection }
 */
export function renderGrid(ctx, data, cols, rows, layout, opts = {}) {
  const { cellSize: cs, offsetX: ox, offsetY: oy, canvasW: w, canvasH: h } = layout;

  // background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // 1-pin grid lines
  ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 0.5;
  for (let x = 0; x <= cols; x++) {
    const px = ox + x * cs + 0.5;
    ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, h - oy); ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    const py = oy + y * cs + 0.5;
    ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(w - ox, py); ctx.stroke();
  }

  // braille cell boundaries (2×4)
  ctx.strokeStyle = CELL_LINE;
  for (let x = 0; x <= cols; x += 2) {
    const px = ox + x * cs + 0.5;
    ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, h - oy); ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 4) {
    const py = oy + y * cs + 0.5;
    ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(w - ox, py); ctx.stroke();
  }

  // center axes
  ctx.strokeStyle = AXIS_LINE; ctx.lineWidth = 0.8;
  const ax = ox + (cols / 2) * cs + 0.5;
  const ay = oy + (rows / 2) * cs + 0.5;
  ctx.beginPath(); ctx.moveTo(ax, oy); ctx.lineTo(ax, h - oy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, ay); ctx.lineTo(w - ox, ay); ctx.stroke();

  // dots
  const rOn  = cs * 0.40;
  const rOff = cs * 0.20;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const on = data[y * cols + x];
    const cx = ox + x * cs + cs / 2;
    const cy = oy + y * cs + cs / 2;
    if (on) {
      ctx.fillStyle = DOT_ON;
      ctx.beginPath(); ctx.arc(cx, cy, rOn, 0, 7); ctx.fill();
      // subtle radial highlight for tactile feel
      const grad = ctx.createRadialGradient(cx - rOn * 0.18, cy - rOn * 0.22, 0, cx, cy, rOn);
      grad.addColorStop(0, 'rgba(255,255,255,.18)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, rOn, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = DOT_OFF;
      ctx.beginPath(); ctx.arc(cx, cy, rOff, 0, 7); ctx.fill();
    }
  }

  // hover brush overlay
  if (opts.hoverCells?.length) {
    const isErase = opts.hoverKind === 'eraser';
    ctx.fillStyle   = isErase ? HOVER_ERASE : HOVER_PEN;
    ctx.strokeStyle = isErase ? 'rgba(185,28,28,.7)' : 'rgba(255,77,0,.75)';
    ctx.lineWidth = 1.4;
    for (const [x, y] of opts.hoverCells) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const hcx = ox + x * cs + cs / 2;
      const hcy = oy + y * cs + cs / 2;
      ctx.beginPath(); ctx.arc(hcx, hcy, rOn * 1.1, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(hcx, hcy, rOn * 1.1, 0, 7); ctx.stroke();
    }
  }

  // selection overlay
  if (opts.selection) {
    const { x0, y0, x1, y1 } = opts.selection;
    ctx.strokeStyle = 'rgba(255,77,0,.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      ox + x0 * cs + 1, oy + y0 * cs + 1,
      (x1 - x0 + 1) * cs - 2, (y1 - y0 + 1) * cs - 2
    );
    ctx.setLineDash([]);
  }
}

/**
 * Get the grid cell [col, row] from a pointer event.
 * Returns null if outside the grid.
 */
export function getPointerCell(e, canvasEl, layout) {
  const rect = canvasEl.getBoundingClientRect();
  const { cellSize: cs, offsetX: ox, offsetY: oy } = layout;
  const px = (e.clientX - rect.left);
  const py = (e.clientY - rect.top);
  const col = Math.floor((px - ox) / cs);
  const row = Math.floor((py - oy) / cs);
  return { col, row };
}

/**
 * Get cells covered by a brush at position (col, row) with given size.
 */
export function getBrushCells(col, row, brushSize) {
  const cells = [];
  if (brushSize <= 1) { cells.push([col, row]); return cells; }
  const r = Math.floor(brushSize / 2);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.hypot(dx, dy) <= r + 0.5) cells.push([col + dx, row + dy]);
  }
  return cells;
}

/**
 * Bresenham line between two cells; returns all cells on the path.
 */
export function bresenhamLine(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    cells.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
  return cells;
}
