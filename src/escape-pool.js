import { renderPart } from "./escape-worker.js";

const CHUNK_ROWS = 80;

let workers = null;
let failed = false;
let nextJobId = 1;
let active = null;
let pending = null;

/** A zoom-out replaces a closer plate already on the workers. Zooming in keeps its place in line. */
function widerView(next, current) {
  const from = current?.view?.scale;
  const to = next?.view?.scale;
  return Number.isFinite(from) && Number.isFinite(to) && to > from * 1.08;
}

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
      worker.onmessage = (event) => onPart(event.data, worker);
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
  for (const resolve of bitmapWaits.values()) resolve(null);
  bitmapWaits.clear();
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
    bitmap: Boolean(request.bitmap),
    fallback: false,
  };
  const promise = new Promise((resolve) => {
    task.resolve = resolve;
  });
  promise.jobId = task.jobId;
  if (!boot()) {
    enqueueFallback(task);
    return promise;
  }
  enqueue(task);
  return promise;
}

function dropTask(task) {
  if (!task || task.settled) return;
  task.settled = true;
  task.cancelled = true;
  task.resolve({ dropped: true, jobId: task.jobId });
}

function enqueue(task) {
  if (!active) {
    dispatch(task);
    return;
  }
  if (widerView(task, active)) {
    dropTask(active);
    active = null;
    dropTask(pending);
    pending = null;
    dispatch(task);
    return;
  }
  dropTask(pending);
  pending = task;
}

function enqueueFallback(task) {
  if (active && active.fallback && widerView(task, active)) {
    dropTask(active);
    active = null;
    dropTask(pending);
    pending = null;
    fallback(task);
    return;
  }
  if (active && active.fallback) {
    dropTask(pending);
    pending = task;
    return;
  }
  fallback(task);
}

function allocate(task) {
  task.remaining = task.height;
  task.nextY = 0;
  if (task.bitmap) {
    task.parts = [];
    return;
  }
  task.iterations = new Uint16Array(task.width * task.height);
  task.basins = new Int8Array(task.iterations.length);
  task.basins.fill(-1);
  task.pixels = new Uint8ClampedArray(task.iterations.length * 4);
}

function postChunk(task, worker) {
  if (task !== active || task.cancelled || task.nextY >= task.height) return;
  const y0 = task.nextY;
  const rows = Math.min(CHUNK_ROWS, task.height - y0);
  task.nextY += rows;
  worker.postMessage({
    jobId: task.jobId,
    fractalId: task.fractalId,
    preset: task.preset,
    width: task.width,
    height: task.height,
    cap: task.cap,
    y0,
    rows,
    paletteId: task.paletteId,
  });
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
  allocate(task);
  for (const worker of group) postChunk(task, worker);
}

let nextBitmapId = 1;
const bitmapWaits = new Map();

/** Send a finished plate's bands to a worker and get back one ImageBitmap, or null if it cannot. */
function composeOnWorker(job) {
  const group = workers;
  if (!group || !group.length) return Promise.resolve(null);
  const id = nextBitmapId++;
  const worker = group[id % group.length];
  const buffers = job.parts.map((part) => part.pixels.buffer);
  return new Promise((resolve) => {
    bitmapWaits.set(id, resolve);
    try {
      worker.postMessage({ kind: "compose", id, width: job.width, height: job.height, parts: job.parts }, buffers);
    } catch {
      bitmapWaits.delete(id);
      resolve(null);
    }
  });
}

function onPart(message, worker) {
  if (message.kind === "bitmap") {
    const resolve = bitmapWaits.get(message.id);
    bitmapWaits.delete(message.id);
    if (resolve) resolve(message.bitmap || null);
    return;
  }
  const job = active;
  if (!job || message.jobId !== job.jobId || job.cancelled || job.fallback) return;
  if (job.bitmap && message.rows > 0 && message.pixels) {
    job.parts.push({ y0: message.y0, rows: message.rows, pixels: message.pixels });
  } else if (message.rows > 0 && message.iterations && message.pixels) {
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
  if (job.remaining > 0) {
    postChunk(job, worker);
    return;
  }
  finish(job);
}

function finish(job) {
  if (job.bitmap && job.parts && !job.fallback) {
    const parts = job.parts;
    job.parts = null;
    if (active === job) active = null;
    job.settled = true;
    composeOnWorker({ width: job.width, height: job.height, parts }).then((bitmap) => {
      if (bitmap) {
        job.resolve(plateResult(job, { bitmap }));
        return;
      }
      const pixels = new Uint8ClampedArray(job.width * job.height * 4);
      for (const part of parts) {
        if (part.pixels.byteLength) pixels.set(part.pixels, part.y0 * job.width * 4);
      }
      job.resolve(plateResult(job, { pixels }));
    });
    startNext();
    return;
  }
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
  job.settled = true;
  resolve(result);
  startNext();
}

function plateResult(job, picture) {
  return {
    dropped: false,
    stale: false,
    jobId: job.jobId,
    width: job.width,
    height: job.height,
    bitmap: picture.bitmap || null,
    pixels: picture.pixels || null,
    fractalId: job.fractalId,
    preset: job.preset,
    view: job.view,
    cap: job.cap,
    paletteId: job.paletteId,
  };
}

function startNext() {
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
    if (task.cancelled || task.settled) return;
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
