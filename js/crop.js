// ── Image Crop Modal ─────────────────────────────────────────
// Lightweight crop-before-convert step for image imports.

export function openImageCropModal({ image, fileName, onConfirm, onUseOriginal }) {
  const modal = document.getElementById('cropModal');
  const canvas = document.getElementById('cropCanvas');
  if (!modal || !canvas) { onUseOriginal(); return; }

  const ctx = canvas.getContext('2d');
  const IMG_W = image.naturalWidth;
  const IMG_H = image.naturalHeight;

  let scale = 1;

  const state = {
    mode: '3:2',
    crop: { x: 0, y: 0, w: IMG_W, h: IMG_H },
  };

  function centerCrop(ratio) {
    if (!ratio) { state.crop = { x: 0, y: 0, w: IMG_W, h: IMG_H }; return; }
    if (IMG_W / IMG_H > ratio) {
      const h = IMG_H, w = h * ratio;
      state.crop = { x: Math.round((IMG_W - w) / 2), y: 0, w: Math.round(w), h };
    } else {
      const w = IMG_W, h = Math.round(w / ratio);
      state.crop = { x: 0, y: Math.round((IMG_H - h) / 2), w, h };
    }
  }

  // ── Canvas sizing ───────────────────────────────────────────
  function sizeCanvas() {
    const area = canvas.parentElement;
    if (!area) return;
    const maxW = area.clientWidth;
    const maxH = area.clientHeight;
    if (!maxW || !maxH) return;
    scale = Math.min(maxW / IMG_W, maxH / IMG_H, 2);
    canvas.width  = Math.round(IMG_W * scale);
    canvas.height = Math.round(IMG_H * scale);
  }

  // ── Rendering ───────────────────────────────────────────────
  function render() {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(image, 0, 0, W, H);

    if (state.mode === 'full') return;

    const { x, y, w, h } = state.crop;
    const cx = x * scale, cy = y * scale, cw = w * scale, ch = h * scale;

    // Darken outside
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(0, 0, W, H);

    // Clear inside (restore image)
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    ctx.drawImage(image, 0, 0, W, H);
    ctx.restore();

    // Border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx + .75, cy + .75, cw - 1.5, ch - 1.5);

    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = .6;
    ctx.beginPath();
    [1/3, 2/3].forEach(t => {
      ctx.moveTo(cx + cw * t, cy); ctx.lineTo(cx + cw * t, cy + ch);
      ctx.moveTo(cx, cy + ch * t); ctx.lineTo(cx + cw, cy + ch * t);
    });
    ctx.stroke();

    // Handles
    computeHandles(cx, cy, cw, ch).forEach(([, hx, hy]) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function computeHandles(cx, cy, cw, ch) {
    return [
      ['tl', cx,        cy       ],
      ['tm', cx + cw/2, cy       ],
      ['tr', cx + cw,   cy       ],
      ['rm', cx + cw,   cy + ch/2],
      ['br', cx + cw,   cy + ch  ],
      ['bm', cx + cw/2, cy + ch  ],
      ['bl', cx,        cy + ch  ],
      ['lm', cx,        cy + ch/2],
    ];
  }

  // ── Hit test ────────────────────────────────────────────────
  const HIT = 13;
  function hitTest(px, py) {
    if (state.mode === 'full') return 'area';
    const { x, y, w, h } = state.crop;
    const cx = x * scale, cy = y * scale, cw = w * scale, ch = h * scale;
    for (const [name, hx, hy] of computeHandles(cx, cy, cw, ch)) {
      if (Math.abs(px - hx) <= HIT && Math.abs(py - hy) <= HIT) return name;
    }
    if (px >= cx && px <= cx + cw && py >= cy && py <= cy + ch) return 'area';
    return null;
  }

  const CURSORS = {
    tl:'nw-resize', tm:'n-resize',  tr:'ne-resize',
    rm:'e-resize',  br:'se-resize', bm:'s-resize',
    bl:'sw-resize', lm:'w-resize',  area:'move',
  };

  // ── Drag ────────────────────────────────────────────────────
  let drag = null;

  function ptInCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  function onPointerDown(e) {
    const { px, py } = ptInCanvas(e);
    const hit = hitTest(px, py);
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    drag = { target: hit, spx: px, spy: py, crop: { ...state.crop } };
  }

  function onPointerMove(e) {
    const { px, py } = ptInCanvas(e);
    if (!drag) { canvas.style.cursor = CURSORS[hitTest(px, py)] || 'default'; return; }
    applyDrag(drag.target, (px - drag.spx) / scale, (py - drag.spy) / scale, drag.crop);
    render();
  }

  function onPointerUp(e) {
    if (drag) { canvas.releasePointerCapture(e.pointerId); drag = null; }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyDrag(target, dx, dy, s) {
    const ratio = state.mode === '3:2' ? 3 / 2 : null;
    const MIN = 20;

    if (target === 'area') {
      state.crop = {
        x: Math.round(clamp(s.x + dx, 0, IMG_W - s.w)),
        y: Math.round(clamp(s.y + dy, 0, IMG_H - s.h)),
        w: s.w, h: s.h,
      };
      return;
    }

    const isL = target === 'tl' || target === 'lm' || target === 'bl';
    const isR = target === 'tr' || target === 'rm' || target === 'br';
    const isT = target === 'tl' || target === 'tm' || target === 'tr';
    const isB = target === 'bl' || target === 'bm' || target === 'br';

    let x = s.x, y = s.y, w = s.w, h = s.h;
    if (isL) { x += dx; w -= dx; }
    if (isR) { w += dx; }
    if (isT) { y += dy; h -= dy; }
    if (isB) { h += dy; }

    if (w < MIN) { if (isL) x = s.x + s.w - MIN; w = MIN; }
    if (h < MIN) { if (isT) y = s.y + s.h - MIN; h = MIN; }

    if (ratio) {
      const wD = Math.abs(w - s.w), hD = Math.abs(h - s.h);
      if (wD >= hD || (!isT && !isB)) {
        // width drives
        h = w / ratio;
        if      (isT)             y = s.y + s.h - h;
        else if (!isT && !isB)    y = s.y + (s.h - h) / 2;
      } else {
        // height drives
        w = h * ratio;
        if      (isL)             x = s.x + s.w - w;
        else if (!isL && !isR)    x = s.x + (s.w - w) / 2;
      }
    }

    // Clamp to image bounds
    x = clamp(x, 0, IMG_W);
    y = clamp(y, 0, IMG_H);
    w = clamp(w, MIN, IMG_W - x);
    h = clamp(h, MIN, IMG_H - y);

    state.crop = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  // ── Mode (aspect ratio) buttons ─────────────────────────────
  function setMode(mode) {
    state.mode = mode;
    if (mode === '3:2') centerCrop(3 / 2);
    else if (mode === 'full') centerCrop(null);
    // 'free': keep current crop
    modal.querySelectorAll('.crop-ratio-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.ratio === mode);
    });
    render();
  }

  // ── Keyboard ────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (state.mode === 'full') return;
    const step = e.shiftKey ? 10 : 1;
    const { x, y, w, h } = state.crop;
    if (e.key === 'ArrowLeft')  { state.crop.x = clamp(x - step, 0, IMG_W - w); render(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { state.crop.x = clamp(x + step, 0, IMG_W - w); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp')    { state.crop.y = clamp(y - step, 0, IMG_H - h); render(); e.preventDefault(); }
    if (e.key === 'ArrowDown')  { state.crop.y = clamp(y + step, 0, IMG_H - h); render(); e.preventDefault(); }
  }

  // ── Action buttons ──────────────────────────────────────────
  async function handleConfirm() {
    if (state.mode === 'full') { close(); onUseOriginal(); return; }
    const cropped = await applyCrop(image, state.crop);
    close();
    onConfirm(cropped);
  }

  function handleOriginal() { close(); onUseOriginal(); }
  function handleCancel()   { close(); }

  // ── Event wiring ────────────────────────────────────────────
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup',   onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown, true);

  function onModalClick(e) {
    const rb = e.target.closest('.crop-ratio-btn');
    if (rb) setMode(rb.dataset.ratio);
  }
  modal.addEventListener('click', onModalClick);

  const cancelBtn   = document.getElementById('cropCancelBtn');
  const originalBtn = document.getElementById('cropOriginalBtn');
  const confirmBtn  = document.getElementById('cropConfirmBtn');
  const closeBtn    = document.getElementById('cropCloseBtn');
  cancelBtn?.addEventListener('click', handleCancel);
  originalBtn?.addEventListener('click', handleOriginal);
  confirmBtn?.addEventListener('click', handleConfirm);
  closeBtn?.addEventListener('click', handleCancel);

  // ── Open ────────────────────────────────────────────────────
  function close() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup',   onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('keydown', onKeyDown, true);
    modal.removeEventListener('click', onModalClick);
    cancelBtn?.removeEventListener('click', handleCancel);
    originalBtn?.removeEventListener('click', handleOriginal);
    confirmBtn?.removeEventListener('click', handleConfirm);
    closeBtn?.removeEventListener('click', handleCancel);
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    sizeCanvas();
    setMode('3:2');
    confirmBtn?.focus();
  });
}

// ── Crop utility ─────────────────────────────────────────────
async function applyCrop(img, rect) {
  const cv = document.createElement('canvas');
  cv.width  = Math.max(1, Math.round(rect.w));
  cv.height = Math.max(1, Math.round(rect.h));
  cv.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, cv.width, cv.height);
  return new Promise(resolve => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.src = cv.toDataURL('image/png');
  });
}
