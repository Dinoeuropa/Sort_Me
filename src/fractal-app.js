import katex from "../vendor/katex/katex.js";
import { FRACTALS, buildGeometry, escapeBand, fractalById, iterateIfs, presetById } from "./fractals.js";
import { PALETTES, boundsOf, drawPaths, drawPoints, drawTriangles, paintEscape } from "./palettes.js";
import { runControlLabel } from "./session.js";

const fractalSelect = document.querySelector("#fractal");
const paletteSelect = document.querySelector("#palette");
const depthInput = document.querySelector("#depth");
const depthOut = document.querySelector("#depth-out");
const depthLabel = document.querySelector("#depth-label");
const speedInput = document.querySelector("#speed");
const speedOut = document.querySelector("#speed-out");
const complexityEl = document.querySelector("#complexity");
const blurb = document.querySelector("#blurb");
const paletteBlurb = document.querySelector("#palette-blurb");
const presets = document.querySelector("#presets");
const toggleButton = document.querySelector("#toggle");
const stepButton = document.querySelector("#step");
const dock = document.querySelector("#viz-dock");
const dockSpeed = document.querySelector("#dock-speed");
const dockToggle = document.querySelector("#dock-toggle");
const canvas = document.querySelector("#canvas");
const statusEl = document.querySelector("#status");
const depthStat = document.querySelector("#depth-stat");
const samplesEl = document.querySelector("#samples");
const kindEl = document.querySelector("#kind");
const presetStat = document.querySelector("#preset-stat");
const note = document.querySelector("#note");
const error = document.querySelector("#error");
const legend = [
  document.querySelector("#legend-a"),
  document.querySelector("#legend-b"),
  document.querySelector("#legend-c"),
];

const ctx = canvas.getContext("2d");
const KIND = { escape: "Escape", curve: "Curve", gasket: "Gasket", ifs: "Iterated" };
let loopId = 0;

const state = {
  fractalId: "mandelbrot",
  paletteId: "classic",
  presetId: "classic",
  running: false,
  paused: false,
  finished: false,
  dock: false,
  samples: 0,
  level: 0,
  hold: 0,
  nextRow: 0,
  raster: null,
  iterations: null,
  basins: null,
  paths: null,
  vertices: null,
  frameBounds: null,
  points: null,
  filled: 0,
  cursor: null,
};

for (const fractal of FRACTALS) {
  const option = document.createElement("option");
  option.value = fractal.id;
  option.textContent = fractal.name;
  fractalSelect.append(option);
}
fractalSelect.value = state.fractalId;

for (const palette of PALETTES) {
  const option = document.createElement("option");
  option.value = palette.id;
  option.textContent = palette.name;
  paletteSelect.append(option);
}
paletteSelect.value = state.paletteId;

function currentFractal() {
  return fractalById(state.fractalId);
}

function currentPreset() {
  return presetById(state.fractalId, state.presetId);
}

function depthValue() {
  const fractal = currentFractal();
  return clampNumber(depthInput.value, fractal.minDepth, fractal.maxDepth);
}

function bandRows(speed, height) {
  const t = clampUnit(speed);
  return Math.max(1, Math.round(1 + (height - 1) * t * t));
}

function pointBatch(speed, step) {
  if (step) return 160;
  const t = clampUnit(speed);
  return Math.max(40, Math.round(40 * 200 ** t));
}

function framesPerLevel(speed) {
  const t = clampUnit(speed);
  return Math.max(1, Math.round(16 ** (1 - t)));
}

function clampUnit(speed) {
  return Math.min(1, Math.max(0, (Number(speed) - 1) / 99));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function rasterSize(width, height, dpr) {
  const ratio = Math.min(dpr || 1, 2);
  let pixelW = Math.max(1, Math.floor(width * ratio));
  let pixelH = Math.max(1, Math.floor(height * ratio));
  const edge = Math.max(pixelW, pixelH);
  if (edge > 680) {
    const fit = 680 / edge;
    pixelW = Math.max(1, Math.floor(pixelW * fit));
    pixelH = Math.max(1, Math.floor(pixelH * fit));
  }
  return { width: pixelW, height: pixelH };
}

function viewBox() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  return { width, height, dpr };
}

function renderMath(latex) {
  if (complexityEl.dataset.latex === latex) return;
  complexityEl.dataset.latex = latex;
  katex.render(latex, complexityEl, { throwOnError: false, displayMode: false });
}

function renderPresets() {
  const fractal = currentFractal();
  if (!fractal.presets.some((preset) => preset.id === state.presetId)) {
    state.presetId = fractal.presets[0].id;
  }
  presets.replaceChildren();
  for (const preset of fractal.presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.name;
    button.dataset.preset = preset.id;
    button.setAttribute("aria-pressed", String(preset.id === state.presetId));
    presets.append(button);
  }
}

function syncDepthControls() {
  const fractal = currentFractal();
  depthInput.min = String(fractal.minDepth);
  depthInput.max = String(fractal.maxDepth);
  depthOut.min = String(fractal.minDepth);
  depthOut.max = String(fractal.maxDepth);
  const depth = clampNumber(depthInput.value, fractal.minDepth, fractal.maxDepth);
  depthInput.value = String(depth);
  depthOut.value = String(depth);
  depthLabel.textContent = fractal.depthLabel;
}

function renderChrome() {
  const fractal = currentFractal();
  const palette = PALETTES.find((item) => item.id === state.paletteId);
  const preset = currentPreset();
  renderMath(fractal.latex);
  blurb.textContent = fractal.blurb;
  paletteBlurb.textContent = palette.blurb;
  note.textContent = fractal.note;
  fractal.legend.forEach((label, index) => {
    legend[index].textContent = label;
  });
  syncDepthControls();
  const depth = depthValue();
  const shown = fractal.kind === "escape" ? depth : Math.max(fractal.minDepth, state.level);
  depthStat.textContent = `${shown.toLocaleString()} / ${depth.toLocaleString()}`;
  samplesEl.textContent = state.samples.toLocaleString();
  kindEl.textContent = KIND[fractal.kind];
  presetStat.textContent = preset.name;
  for (const button of presets.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.preset === state.presetId));
  }
  const pace = paceLabel(fractal);
  speedOut.textContent = pace;
  const control = runControlLabel({ running: state.running, paused: state.paused, idle: "Draw" });
  toggleButton.textContent = control;
  dockToggle.textContent = control;
  dock.hidden = !state.dock;
  dockSpeed.value = speedInput.value;
  if (state.running) statusEl.textContent = "Drawing";
  else if (state.paused) statusEl.textContent = "Paused";
  else if (state.finished) statusEl.textContent = "Drawn";
  else statusEl.textContent = "Ready";
  canvas.classList.toggle("pixelated", fractal.kind === "escape");
}

function paceLabel(fractal) {
  const speed = speedInput.value;
  if (fractal.kind === "escape") {
    const rows = state.raster ? bandRows(speed, state.raster.height) : bandRows(speed, 8);
    return `${rows.toLocaleString()} rows / frame`;
  }
  if (fractal.kind === "ifs") return `${pointBatch(speed, false).toLocaleString()} pts / frame`;
  const frames = framesPerLevel(speed);
  return frames === 1 ? "1 level / frame" : `1 level / ${frames} frames`;
}

function stop() {
  state.running = false;
  loopId += 1;
}

function resetProgress() {
  const fractal = currentFractal();
  state.finished = false;
  state.paused = false;
  state.samples = 0;
  state.level = fractal.minDepth - 1;
  state.hold = 0;
  state.nextRow = 0;
  state.iterations = null;
  state.basins = null;
  state.paths = null;
  state.vertices = null;
  state.frameBounds = null;
  state.points = null;
  state.filled = 0;
  state.cursor = { x: 0, y: 0, seed: 1 };
  state.raster = null;
  error.textContent = "";
  if (fractal.frame === "final") {
    const depth = depthValue();
    state.frameBounds = boundsOf(pathsOf(buildGeometry(state.fractalId, state.presetId, depth)));
  }
}

function pathsOf(geometry) {
  if (geometry.mode === "polyline") return geometry.paths;
  return [geometry.vertices];
}

function ensureEscape() {
  const box = viewBox();
  const raster = rasterSize(box.width, box.height, box.dpr);
  if (
    state.raster &&
    state.iterations &&
    state.raster.width === raster.width &&
    state.raster.height === raster.height
  ) {
    return;
  }
  state.raster = raster;
  state.iterations = new Uint16Array(raster.width * raster.height);
  state.basins = new Int8Array(raster.width * raster.height);
  state.basins.fill(-1);
  state.nextRow = 0;
  state.samples = 0;
  state.finished = false;
}

function paint() {
  const fractal = currentFractal();
  const box = viewBox();
  if (fractal.kind === "escape") {
    if (!state.raster || !state.iterations) return;
    canvas.classList.add("pixelated");
    if (canvas.width !== state.raster.width || canvas.height !== state.raster.height) {
      canvas.width = state.raster.width;
      canvas.height = state.raster.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pixels = paintEscape(
      state.paletteId,
      state.iterations,
      state.basins,
      state.raster.width,
      state.raster.height,
      depthValue(),
      state.nextRow,
    );
    ctx.putImageData(new ImageData(pixels, state.raster.width, state.raster.height), 0, 0);
    return;
  }
  canvas.classList.remove("pixelated");
  const pixelWidth = Math.floor(box.width * box.dpr);
  const pixelHeight = Math.floor(box.height * box.dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
  if (fractal.kind === "ifs") {
    const count = state.filled * 2;
    drawPoints(
      state.paletteId,
      ctx,
      state.points ? state.points.subarray(0, count) : new Float64Array(),
      currentPreset().bounds,
      box.width,
      box.height,
    );
    return;
  }
  if (fractal.kind === "gasket" && state.vertices) {
    drawTriangles(state.paletteId, ctx, state.vertices, box.width, box.height, state.frameBounds);
    return;
  }
  if (state.paths) drawPaths(state.paletteId, ctx, state.paths, box.width, box.height, state.frameBounds);
}

function advance(step) {
  const fractal = currentFractal();
  try {
    if (fractal.kind === "escape") advanceEscape(step);
    else if (fractal.kind === "ifs") advanceIfs(step);
    else advanceCurve(step);
  } catch (cause) {
    stop();
    error.textContent = cause.message;
  }
  paint();
  renderChrome();
}

function advanceEscape(step) {
  ensureEscape();
  const rows = step ? 1 : bandRows(speedInput.value, state.raster.height);
  const count = Math.min(rows, state.raster.height - state.nextRow);
  if (count <= 0) {
    finish();
    return;
  }
  const band = escapeBand(
    state.fractalId,
    currentPreset(),
    state.raster.width,
    state.raster.height,
    depthValue(),
    state.nextRow,
    count,
  );
  state.iterations.set(band.iterations, state.nextRow * state.raster.width);
  state.basins.set(band.basins, state.nextRow * state.raster.width);
  state.nextRow += count;
  state.samples = state.nextRow * state.raster.width;
  if (state.nextRow >= state.raster.height) finish();
}

function advanceIfs(step) {
  const target = depthValue();
  if (!state.points || state.points.length < target * 2) state.points = new Float64Array(target * 2);
  const room = target - state.filled;
  if (room <= 0) {
    finish();
    return;
  }
  const batch = Math.min(room, pointBatch(speedInput.value, step));
  const next = iterateIfs(state.fractalId, state.presetId, state.cursor, batch);
  state.points.set(next.points, state.filled * 2);
  state.cursor = next.cursor;
  state.filled += batch;
  state.samples = state.filled;
  state.level = state.filled;
  if (state.filled >= target) finish();
}

function advanceCurve(step) {
  const fractal = currentFractal();
  const target = depthValue();
  if (!step && state.hold > 0) {
    state.hold -= 1;
    return;
  }
  if (state.level >= target) {
    finish();
    return;
  }
  state.level += 1;
  state.hold = step ? 0 : Math.max(0, framesPerLevel(speedInput.value) - 1);
  const geometry = buildGeometry(state.fractalId, state.presetId, state.level);
  if (geometry.mode === "triangles") {
    state.vertices = geometry.vertices;
    state.paths = null;
    state.samples = geometry.vertices.length / 6;
  } else {
    state.paths = geometry.paths;
    state.vertices = null;
    state.samples = geometry.paths.reduce((sum, path) => sum + path.length / 2, 0);
  }
  if (!state.frameBounds || fractal.frame === "level") {
    state.frameBounds = boundsOf(pathsOf(geometry));
  }
  if (state.level >= target) finish();
}

function finish() {
  state.finished = true;
  state.running = false;
  state.paused = false;
  state.hold = 0;
}

function startLoop() {
  const id = ++loopId;
  state.running = true;
  state.paused = false;
  const tick = () => {
    if (!state.running || id !== loopId) return;
    advance(false);
    if (state.running && id === loopId) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function toggle() {
  if (state.running) {
    stop();
    state.paused = true;
    renderChrome();
    return;
  }
  state.dock = true;
  revealVisualization();
  if (!state.paused) resetProgress();
  state.paused = false;
  startLoop();
  renderChrome();
}

function revealVisualization() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  document.querySelector(".canvas-frame")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function restart() {
  stop();
  state.paused = false;
  resetProgress();
  startLoop();
  renderChrome();
}

fractalSelect.addEventListener("change", () => {
  state.fractalId = fractalSelect.value;
  state.presetId = currentFractal().presets[0].id;
  const fractal = currentFractal();
  depthInput.min = String(fractal.minDepth);
  depthInput.max = String(fractal.maxDepth);
  depthOut.min = depthInput.min;
  depthOut.max = depthInput.max;
  depthInput.value = String(fractal.defaultDepth);
  depthOut.value = depthInput.value;
  renderPresets();
  restart();
});

paletteSelect.addEventListener("change", () => {
  state.paletteId = paletteSelect.value;
  paint();
  renderChrome();
});

depthInput.addEventListener("input", () => {
  depthOut.value = depthInput.value;
  renderChrome();
});
depthOut.addEventListener("change", () => {
  const fractal = currentFractal();
  depthInput.value = String(clampNumber(depthOut.value, fractal.minDepth, fractal.maxDepth));
  restart();
});
depthInput.addEventListener("change", () => restart());
speedInput.addEventListener("input", () => {
  dockSpeed.value = speedInput.value;
  renderChrome();
});
dockSpeed.addEventListener("input", () => {
  speedInput.value = dockSpeed.value;
  renderChrome();
});
dockToggle.addEventListener("click", toggle);
presets.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.presetId = button.dataset.preset;
  restart();
});
toggleButton.addEventListener("click", toggle);
stepButton.addEventListener("click", () => {
  const wasRunning = state.running;
  stop();
  if (!wasRunning && !state.paused && (state.finished || state.samples === 0)) resetProgress();
  state.paused = true;
  state.dock = true;
  advance(true);
});

window.addEventListener("keydown", (event) => {
  if (event.target.closest("button, input, select, textarea, a")) return;
  if (event.code === "Space") {
    event.preventDefault();
    toggle();
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    stepButton.click();
  }
});

new ResizeObserver(() => {
  const fractal = currentFractal();
  if (fractal.kind !== "escape") {
    paint();
    return;
  }
  const box = viewBox();
  const raster = rasterSize(box.width, box.height, box.dpr);
  if (state.raster && raster.width === state.raster.width && raster.height === state.raster.height) {
    paint();
    return;
  }
  if (state.finished || state.running || state.paused) restart();
}).observe(canvas.parentElement);

renderPresets();
depthInput.value = String(currentFractal().defaultDepth);
restart();
