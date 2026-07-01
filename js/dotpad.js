// ── DotPad Layer ─────────────────────────────────────────────
// Wraps the SDK and provides a clean interface for sending data.
// Decoupled from canvas rendering.

import { DotPadSDK, DotPadScanner, DataCodes, DisplayMode } from '../DotPadSDK-3_0_0.js';
import { dotPadState } from './state.js';
import { gridToHex } from './engine.js';

let _debounceTimer = null;
let _lastHex = '';
let _sdk = null;
let _scanner = null;

export function initDotPad(onConnect, onDisconnect) {
  _sdk = new DotPadSDK();
  _scanner = new DotPadScanner();
  _sdk.setCallBack((device, code, data) => {
    if (code === DataCodes.Connected) {
      dotPadState.connected = true;
      dotPadState.sdk = _sdk;
      dotPadState.device = device;
      onConnect?.(device);
    } else if (code === DataCodes.Disconnected) {
      dotPadState.connected = false;
      dotPadState.device = null;
      onDisconnect?.(device);
    }
  }, null);
  return _sdk;
}

export async function connectBle() {
  if (!_scanner) return null;
  const device = await _scanner.startBleScan();
  if (!device) return null;
  return await _sdk.connectBleDevice(device);
}

export async function connectUsb() {
  if (!_scanner) return null;
  const port = await _scanner.startUsbScan();
  if (!port) return null;
  return await _sdk.connectUsbDevice(port);
}

export function disconnectDotPad() {
  _sdk?.disconnect();
  dotPadState.connected = false;
  dotPadState.device = null;
}

/**
 * Send graphic data to DotPad.
 * Debounced and deduped.
 */
export function sendGraphicData(hex, force = false) {
  if (!dotPadState.connected || !_sdk) return;
  if (hex === _lastHex && !force) return;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _lastHex = hex;
    dotPadState.lastPreviewBuffer = hex;
    dotPadState.lastSyncedAt = Date.now();
    _sdk.displayGraphicData(hex);
  }, 100);
}

/**
 * Send braille text to DotPad.
 */
export function sendBrailleText(text) {
  if (!dotPadState.connected || !_sdk) return;
  _sdk.displayTextData(text, null, DisplayMode.TextMode);
}

/**
 * Raise all pins.
 */
export function allPinsUp() {
  if (!dotPadState.connected || !_sdk) return;
  _sdk.displayAllUp();
}

/**
 * Lower all pins.
 */
export function allPinsDown() {
  if (!dotPadState.connected || !_sdk) return;
  _sdk.displayAllDown();
}

/**
 * Sync the current canvas viewport to DotPad.
 * If livePreviewEnabled is false, this is a no-op.
 * @param {Uint8Array} canvasData
 * @param {number} cols
 * @param {number} rows
 */
export function syncLivePreview(canvasData, cols, rows) {
  if (!dotPadState.livePreviewEnabled) return;
  sendGraphicData(gridToHex(canvasData, cols, rows));
}
