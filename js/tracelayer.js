// ── Tracing Layer ────────────────────────────────────────────
// Compositing for the semi-transparent image-tracing guide layer.
// Rendered on a separate <canvas> stacked on top of #pad — see canvas.js's
// renderGrid() for why: it always paints an opaque background, so a trace
// image can't live "inside" the same canvas without changing that contract.

/**
 * Draw a tracing-guide image at the given opacity, stretched to fill the
 * grid extent exactly (so grid cells map predictably to image pixels).
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} img
 * @param {object} layout - { canvasW, canvasH }
 * @param {number} opacity - 0..1
 */
export function renderTraceLayer(ctx, img, layout, opacity) {
  const { canvasW: w, canvasH: h } = layout;
  ctx.clearRect(0, 0, w, h);
  if (!img || opacity <= 0) return;
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalAlpha = 1;
}
