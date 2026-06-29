// ── Sense: Sonification ───────────────────────────────────────
// Audio exploration of a tactile graphic — hover a cell to hear it.
// Column → pitch (pentatonic, always pleasant), row → volume,
// local density → tick duration. WebAudio only, no external deps.

let _ctx = null;
let _enabled = false;
let _lastTick = 0;
let _lastCell = null;

function ctx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// Pentatonic scale (C4..C6) — any combination sounds consonant.
const PENTATONIC = [261, 294, 330, 392, 440, 523, 587, 659, 784, 880, 1047, 1175];

function colToPitch(col, cols) {
  const idx = Math.round((col / Math.max(cols - 1, 1)) * (PENTATONIC.length - 1));
  return PENTATONIC[Math.min(idx, PENTATONIC.length - 1)];
}
function rowToVol(row, rows, base) {
  const tpos = row / Math.max(rows - 1, 1);   // 0 top .. 1 bottom
  return base * (1 - tpos * 0.35);
}
function localDensity(data, col, row, cols, rows, radius) {
  let on = 0, total = 0;
  for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < rows && c >= 0 && c < cols) { total++; if (data[r * cols + c]) on++; }
  }
  return total ? on / total : 0;
}

// One xylophone-like mallet tick.
function playTick(pitch, vol, dur) {
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  const now = c.currentTime;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch, now);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.97, now + dur);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(gain); gain.connect(c.destination);
  osc.start(now); osc.stop(now + dur + 0.01);
}

export function isSonifyEnabled() { return _enabled; }

export function setSonify(on) {
  _enabled = !!on;
  if (_enabled) { try { ctx(); } catch (_) {} }   // warm up (needs user gesture)
  return _enabled;
}

/**
 * Handle a pointer move over the canvas.
 * @param {object} cell      { col, row } under the pointer (from getPointerCell)
 * @param {Uint8Array} data
 * @param {number} cols @param {number} rows
 * @param {object} opts      { volume?:0..1, sensitivity?:1..5 }
 */
export function sonifyMove(cell, data, cols, rows, opts = {}) {
  if (!_enabled || !cell) return;
  const { col, row } = cell;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;

  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const sens = Math.max(1, Math.min(5, opts.sensitivity || 3));
  const radius = [1, 1, 2, 2, 3][sens - 1];
  const interval = [90, 65, 45, 35, 28][sens - 1];
  if (now - _lastTick < interval) return;

  // Only sound when the pointer is on a raised pin.
  if (!data[row * cols + col]) { _lastCell = [col, row]; return; }

  const density = localDensity(data, col, row, cols, rows, radius);
  if (_lastCell && _lastCell[0] === col && _lastCell[1] === row && density < 0.4) return;

  _lastCell = [col, row]; _lastTick = now;
  const base = (opts.volume != null ? opts.volume : 0.6) * 0.45;
  const vol = Math.min(0.45, rowToVol(row, rows, base));
  const pitch = colToPitch(col, cols);
  const dur = 0.18 - density * 0.08;   // denser → crisper
  playTick(pitch, vol, dur);
}

/**
 * Play a short left-to-right sweep summarizing the graphic's columns —
 * a quick "audio thumbnail" triggered on demand.
 */
export function sonifySweep(data, cols, rows, opts = {}) {
  if (typeof window === 'undefined') return;
  const base = (opts.volume != null ? opts.volume : 0.6) * 0.4;
  let step = 0;
  const stride = Math.max(1, Math.round(cols / 24));
  const tick = () => {
    const col = step * stride;
    if (col >= cols) return;
    let on = 0;
    for (let r = 0; r < rows; r++) if (data[r * cols + col]) on++;
    if (on > 0) {
      const dens = on / rows;
      playTick(colToPitch(col, cols), Math.min(0.4, base * (0.5 + dens)), 0.12);
    }
    step++;
    setTimeout(tick, 55);
  };
  try { ctx(); tick(); } catch (_) {}
}
