import { paintGpuEscape, useGpuSurface } from "./escape-gpu.js";
import { nextZoomBandRows } from "./fractal-view.js";

let canvas = null;
let busy = false;
let waiting = null;
// Rows drawn before the worker yields. The count stays small until a strip proves
// it can grow, so one finish cannot hold the graphics lock for the whole plate.
let bandRows = 0;
let tunedCap = 0;
let bandMs = 0;

function yieldThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
    let rows = nextZoomBandRows(height, paint.cap | 0, bandRows, tunedCap, bandMs);
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
      bandRows = tall;
      tunedCap = paint.cap | 0;
      bandMs = dt;
      rows = nextZoomBandRows(height, paint.cap | 0, bandRows, tunedCap, bandMs);
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
