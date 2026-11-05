import { paintGpuEscape, useGpuSurface } from "./escape-gpu.js";
import { nextZoomStrip } from "./fractal-view.js";

let canvas = null;
let busy = false;
let waiting = null;
// The strip that fit the last refresh. It starts short and changes by a little,
// so one finish stays inside a frame instead of locking the whole plate.
let strip = { rows: 0, cols: 0, cap: 0 };
let stripMs = 0;

function yieldThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderFrame(message) {
  const started = performance.now();
  let gpu = 0;
  let slowest = 0;
  try {
    const paint = message.paint;
    const width = paint.width | 0;
    const height = paint.height | 0;
    const acc = new OffscreenCanvas(width, height);
    const ctx = acc.getContext("2d");
    if (!ctx) throw new Error("no 2d");
    ctx.imageSmoothingEnabled = false;
    let x = 0;
    let y = 0;
    let plan = nextZoomStrip(width, height, paint.cap | 0, strip, stripMs);
    while (y < height) {
      const tall = Math.max(1, Math.min(plan.rows, height - y));
      const wide = Math.max(1, Math.min(plan.cols, width - x));
      const t0 = performance.now();
      const sheet = paintGpuEscape({
        ...paint,
        rows: { from: y, to: y + tall },
        cols: { from: x, to: x + wide },
      });
      if (!sheet) {
        self.postMessage({ type: "frame", id: message.id, failed: true });
        return;
      }
      const gl = sheet.getContext("webgl2");
      if (gl) gl.finish();
      const band = sheet.transferToImageBitmap();
      ctx.drawImage(band, x, y);
      band.close();
      const dt = performance.now() - t0;
      gpu += dt;
      if (dt > slowest) slowest = dt;
      // A short remainder at the edge of a row is not a measure of the strip size.
      if (tall === plan.rows && wide === plan.cols) {
        strip = { rows: plan.rows, cols: plan.cols, cap: paint.cap | 0 };
        stripMs = dt;
        plan = nextZoomStrip(width, height, paint.cap | 0, strip, stripMs);
      }
      x += wide;
      if (x >= width) {
        x = 0;
        y += tall;
      }
      if (y < height) await yieldThread();
    }
    const bitmap = acc.transferToImageBitmap();
    const wall = performance.now() - started;
    self.postMessage({
      type: "frame",
      id: message.id,
      ms: gpu,
      wall,
      band: slowest,
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
    // Link the shaders before a dive asks for a frame, so that compile does not land on a zoom frame.
    try {
      const sheet = paintGpuEscape({
        width: 1,
        height: 1,
        fractalId: "mandelbrot",
        preset: { centerX: 0, centerY: 0, scale: 2.5 },
        cap: 16,
        paletteId: "classic",
        depth: "direct",
      });
      const gl = sheet && sheet.getContext("webgl2");
      if (gl) gl.finish();
    } catch {
      // The first real frame reports its own failure.
    }
    return;
  }
  if (message.type !== "render" || !canvas) return;
  waiting = message;
  pump();
};
