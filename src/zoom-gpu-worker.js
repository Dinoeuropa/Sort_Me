import { paintGpuEscape, useGpuSurface } from "./escape-gpu.js";

let canvas = null;
let busy = false;
let waiting = null;
// Rows drawn before the worker yields. A whole plate in one draw holds the graphics
// lock long enough to freeze the page, and a tiny band pays that lock again on every call.
let bandRows = 0;
let tunedCap = 0;

function yieldThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function startingRows(height, cap) {
  // A heavier picture starts in short strips. Reusing a tall strip from an easier
  // depth holds the graphics lock for seconds and the zoom appears to stop.
  if (!(bandRows > 0) || cap > tunedCap * 1.15) {
    if (cap > 3200) return Math.min(height, 2);
    if (cap > 1600) return Math.min(height, 6);
    if (cap > 800) return Math.min(height, 16);
    return height;
  }
  return Math.min(height, bandRows);
}

async function renderFrame(message) {
  const started = performance.now();
  let gpu = 0;
  try {
    const paint = message.paint;
    const width = paint.width | 0;
    const height = paint.height | 0;
    const acc = new OffscreenCanvas(width, height);
    const ctx = acc.getContext("2d");
    if (!ctx) throw new Error("no 2d");
    let y = 0;
    let rows = startingRows(height, paint.cap | 0);
    while (y < height) {
      const tall = Math.max(1, Math.min(rows, height - y));
      const t0 = performance.now();
      const sheet = paintGpuEscape({ ...paint, rows: { from: y, to: y + tall } });
      if (!sheet) {
        self.postMessage({ type: "frame", id: message.id, failed: true });
        return;
      }
      const gl = sheet.getContext("webgl2");
      if (gl) gl.finish();
      const band = sheet.transferToImageBitmap();
      ctx.drawImage(band, 0, y);
      band.close();
      const dt = performance.now() - t0;
      gpu += dt;
      tunedCap = paint.cap | 0;
      if (dt > 48 && tall > 1) bandRows = Math.max(1, tall >> 1);
      else if (dt < 20) bandRows = Math.min(height, Math.max(tall + 2, tall << 1));
      else bandRows = tall;
      rows = bandRows;
      y += tall;
      if (y < height) await yieldThread();
    }
    const bitmap = acc.transferToImageBitmap();
    const wall = performance.now() - started;
    self.postMessage({
      type: "frame",
      id: message.id,
      ms: gpu,
      wall,
      width: bitmap.width,
      height: bitmap.height,
      bitmap,
    }, [bitmap]);
  } catch {
    self.postMessage({ type: "frame", id: message.id, failed: true });
  }
}

function pump() {
  if (busy || !waiting) return;
  const message = waiting;
  waiting = null;
  busy = true;
  renderFrame(message).finally(() => {
    busy = false;
    pump();
  });
}

self.onmessage = (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === "init") {
    canvas = message.canvas;
    useGpuSurface(canvas);
    return;
  }
  if (message.type !== "render" || !canvas) return;
  waiting = message;
  pump();
};
