import { renderPart } from "./escape-worker.js";

let workers = null;
let failed = false;
let nextJobId = 1;
let active = null;
let pending = null;

function poolSize() {
  const cores = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.min(4, Math.max(2, cores));
}

function boot() {
  if (workers || failed) return workers;
  try {
    const count = poolSize();
    const group = [];
    for (let index = 0; index < count; index += 1) {
      const worker = new Worker(new URL("./escape-worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (event) => onPart(event.data);
      worker.onerror = () => failPool();
      group.push(worker);
    }
    workers = group;
    return workers;
  } catch {
    failed = true;
    workers = null;
    return null;
  }
}

function failPool() {
  if (failed) return;
  failed = true;
  const group = workers;
  workers = null;
  if (group) {
    for (const worker of group) worker.terminate();
  }
  const job = active;
  if (job) fallback(job);
}

export function renderEscape(request) {
  const task = {
    fractalId: request.fractalId,
    preset: request.preset,
    width: request.width | 0,
    height: request.height | 0,
    cap: request.cap,
    paletteId: request.paletteId,
    view: request.view,
    jobId: nextJobId++,
    onBand: request.onBand,
    fallback: false,
  };
  const promise = new Promise((resolve) => {
    task.resolve = resolve;
  });
  promise.jobId = task.jobId;
  if (!boot()) {
    fallback(task);
    return promise;
  }
  if (!active) dispatch(task);
  else {
    if (pending) pending.resolve({ dropped: true, jobId: pending.jobId });
    pending = task;
  }
  return promise;
}

function dispatch(task) {
  active = task;
  const group = workers;
  if (task.height <= 0 || task.width <= 0) {
    task.iterations = new Uint16Array(0);
    task.basins = new Int8Array(0);
    task.pixels = new Uint8ClampedArray(0);
    finish(task);
    return;
  }
  const parts = Math.min(group.length, Math.max(1, task.height));
  task.remaining = task.height;
  task.iterations = new Uint16Array(task.width * task.height);
  task.basins = new Int8Array(task.iterations.length);
  task.basins.fill(-1);
  task.pixels = new Uint8ClampedArray(task.iterations.length * 4);
  let y = 0;
  for (let part = 0; part < parts; part += 1) {
    const rows = Math.floor(task.height / parts) + (part < task.height % parts ? 1 : 0);
    group[part].postMessage({
      jobId: task.jobId,
      fractalId: task.fractalId,
      preset: task.preset,
      width: task.width,
      height: task.height,
      cap: task.cap,
      y0: y,
      rows,
      paletteId: task.paletteId,
    });
    y += rows;
  }
}

function onPart(message) {
  const job = active;
  if (!job || message.jobId !== job.jobId || job.fallback) return;
  if (message.rows > 0 && message.iterations && message.pixels) {
    job.iterations.set(message.iterations, message.y0 * job.width);
    job.basins.set(message.basins, message.y0 * job.width);
    job.pixels.set(message.pixels, message.y0 * job.width * 4);
    if (job.onBand) {
      try {
        job.onBand(message);
      } catch {
        // A preview band must not cancel the finished picture.
      }
    }
  }
  job.remaining -= message.rows || 0;
  if (job.remaining > 0) return;
  finish(job);
}

function finish(job) {
  const resolve = job.resolve;
  const result = {
    dropped: false,
    stale: Boolean(pending),
    jobId: job.jobId,
    width: job.width,
    height: job.height,
    iterations: job.iterations,
    basins: job.basins,
    pixels: job.pixels,
    fractalId: job.fractalId,
    preset: job.preset,
    view: job.view,
    cap: job.cap,
    paletteId: job.paletteId,
  };
  if (active === job) active = null;
  resolve(result);
  const next = pending;
  pending = null;
  if (!next) return;
  if (workers && !failed) dispatch(next);
  else fallback(next);
}

function fallback(task) {
  if (task.fallback) return;
  task.fallback = true;
  if (!active) active = task;
  const width = task.width;
  const height = task.height;
  const iterations = new Uint16Array(Math.max(0, width * height));
  const basins = new Int8Array(iterations.length);
  basins.fill(-1);
  const pixels = new Uint8ClampedArray(iterations.length * 4);
  task.iterations = iterations;
  task.basins = basins;
  task.pixels = pixels;
  let y = 0;
  const slice = Math.max(1, Math.ceil(height / 8) || 1);
  const step = () => {
    if (active !== task) return;
    const rows = Math.min(slice, height - y);
    if (rows <= 0) {
      finish(task);
      return;
    }
    const part = renderPart({
      fractalId: task.fractalId,
      preset: task.preset,
      width,
      height,
      cap: task.cap,
      y0: y,
      rows,
      paletteId: task.paletteId,
    });
    iterations.set(part.iterations, y * width);
    basins.set(part.basins, y * width);
    pixels.set(part.pixels, y * width * 4);
    if (task.onBand) {
      try {
        task.onBand({
          jobId: task.jobId,
          y0: y,
          rows,
          width,
          iterations: part.iterations,
          basins: part.basins,
          pixels: part.pixels,
        });
      } catch {
        // A preview band must not cancel the finished picture.
      }
    }
    y += rows;
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
