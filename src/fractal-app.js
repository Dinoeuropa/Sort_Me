import katex from "../vendor/katex/katex.js";
import { FRACTALS, buildGeometry, constructionOrder, escapeBand, fractalById, iterateIfs, presetById } from "./fractals.js";
import { framesFor, unitsPerFrame } from "./fractal-pace.js";
import { PALETTES, boundsOf, drawPaths, drawPoints, drawTriangles, paintEscape } from "./palettes.js";
import { runControlLabel } from "./session.js";
import { createSpeaker } from "./sound.js";

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
const soundButton = document.querySelector("#sound");
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
const speaker = createSpeaker();
const PAPER = "#100e0c";
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
  revealed: 0,
  inked: 0,
  inkKey: "",
  total: 0,
  sweepPlayed: false,
  nextRow: 0,
  raster: null,
  iterations: null,
  basins: null,
  paths: null,
  vertices: null,
  frameBounds: null,
  points: null,
  cursor: null,
  stages: null,
  stage: 0,
  stageTick: 0,
  revealIter: 0,
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
  const generation = state.stages ? fractal.minDepth + state.stage : depth;
  depthStat.textContent = generation.toLocaleString();
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
    return perFrame(unitsPerFrame(speed, depthValue(), false), "iteration", "iterations");
  }
  if (state.stages) {
    const budget = generationBudget(false);
    const batch = Math.max(1, Math.ceil((state.total || 1) / budget));
    if (fractal.kind === "gasket") return perFrame(batch, "triangle", "triangles");
    return perFrame(batch, "segment", "segments");
  }
  const units = unitsPerFrame(speed, state.total || depthValue(), false);
  if (fractal.kind === "ifs") return perFrame(units, "pt", "pts");
  if (fractal.kind === "gasket") return perFrame(units, "triangle", "triangles");
  return perFrame(units, "segment", "segments");
}

function generationBudget() {
  const stages = Math.max(1, state.stages?.length || 1);
  return Math.max(4, Math.round(framesFor(speedInput.value) / stages));
}

function perFrame(count, singular, plural) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural} / frame`;
}

function stop() {
  state.running = false;
  loopId += 1;
}

function resetProgress() {
  const fractal = currentFractal();
  const depth = depthValue();
  state.finished = false;
  state.paused = false;
  state.samples = 0;
  state.revealed = 0;
  state.inked = 0;
  state.inkKey = "";
  state.sweepPlayed = false;
  state.nextRow = 0;
  state.iterations = null;
  state.basins = null;
  state.paths = null;
  state.vertices = null;
  state.frameBounds = null;
  state.points = null;
  state.total = 0;
  state.cursor = { x: 0, y: 0, seed: 1 };
  state.raster = null;
  state.stages = null;
  state.stage = 0;
  state.stageTick = 0;
  state.revealIter = 0;
  error.textContent = "";
  if (constructionOrder(state.fractalId) === "generations") {
    const stages = [];
    for (let level = fractal.minDepth; level <= depth; level += 1) {
      stages.push(buildGeometry(state.fractalId, state.presetId, level));
    }
    state.stages = stages;
    state.frameBounds = boundsOf(pathsOf(stages[stages.length - 1]));
    showStage(0);
  } else if (fractal.kind === "curve" || fractal.kind === "gasket") {
    const geometry = buildGeometry(state.fractalId, state.presetId, depth);
    if (geometry.mode === "triangles") {
      state.vertices = geometry.vertices;
      state.total = geometry.vertices.length / 6;
    } else {
      state.paths = geometry.paths;
      state.total = segmentCount(geometry.paths);
    }
    state.frameBounds = boundsOf(pathsOf(geometry));
  } else if (fractal.kind === "ifs") {
    state.total = depth;
    state.points = new Float64Array(depth * 2);
    state.frameBounds = currentPreset().bounds;
  }
  clearPaper();
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
  state.revealed = 0;
  state.revealIter = 0;
  state.samples = 0;
  state.finished = false;
  state.sweepPlayed = false;
}

function prepareVectorCanvas(box) {
  canvas.classList.remove("pixelated");
  const pixelWidth = Math.max(1, Math.floor(box.width * box.dpr));
  const pixelHeight = Math.max(1, Math.floor(box.height * box.dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
}

function clearPaper() {
  const box = viewBox();
  prepareVectorCanvas(box);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  state.inked = 0;
  state.inkKey = "";
}

function paint() {
  const fractal = currentFractal();
  const box = viewBox();
  if (fractal.kind === "escape") {
    paintRaster();
    return;
  }
  prepareVectorCanvas(box);
  const key = `${box.width}x${box.height}x${box.dpr}:${state.paletteId}`;
  if (key !== state.inkKey) {
    state.inkKey = key;
    state.inked = 0;
  }
  if (fractal.kind === "ifs") {
    paintPoints(box);
    return;
  }
  if (fractal.kind === "gasket") {
    paintTriangles(box);
    return;
  }
  paintSegments(box);
}

function paintRaster() {
  if (!state.raster || !state.iterations) return;
  if (state.nextRow < state.raster.height || state.revealIter <= 0) return;
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
    state.raster.height,
    state.revealIter,
  );
  ctx.putImageData(new ImageData(pixels, state.raster.width, state.raster.height), 0, 0);
}

function paintSegments(box) {
  if (!state.paths || state.revealed <= 0) return;
  const done = state.finished || state.revealed >= state.total;
  drawPaths(state.paletteId, ctx, state.paths, box.width, box.height, state.frameBounds, {
    from: 0,
    until: state.revealed,
    clear: true,
    total: state.total,
    tip: !done,
  });
  state.inked = state.revealed;
}

function paintTriangles(box) {
  if (!state.vertices || state.revealed <= 0) return;
  drawTriangles(state.paletteId, ctx, state.vertices, box.width, box.height, state.frameBounds, {
    from: 0,
    until: state.revealed,
    clear: true,
    total: state.total,
  });
  state.inked = state.revealed;
}

function paintPoints(box) {
  if (!state.points || state.revealed <= 0) return;
  if (state.inked === state.revealed) return;
  const slice = state.points.subarray(state.inked * 2, state.revealed * 2);
  drawPoints(state.paletteId, ctx, slice, state.frameBounds, box.width, box.height, {
    clear: state.inked === 0,
    total: state.total,
  });
  state.inked = state.revealed;
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
  if (state.nextRow < state.raster.height) {
    const rows = Math.max(1, Math.ceil(state.raster.height / 6));
    const count = Math.min(rows, state.raster.height - state.nextRow);
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
    return;
  }
  const cap = depthValue();
  if (state.revealIter >= cap) {
    finish();
    return;
  }
  const batch = unitsPerFrame(speedInput.value, cap, step);
  state.revealIter = Math.min(cap, state.revealIter + batch);
  speaker.playNotes([state.revealIter], cap, 1);
  state.samples = visibleSamples(cap);
  if (state.revealIter >= cap) finish();
}

function advanceIfs(step) {
  const room = state.total - state.revealed;
  if (room <= 0) {
    finish();
    return;
  }
  const batch = Math.min(room, unitsPerFrame(speedInput.value, state.total, step));
  const next = iterateIfs(state.fractalId, state.presetId, state.cursor, batch);
  state.points.set(next.points, state.revealed * 2);
  state.cursor = next.cursor;
  const lastY = next.points[(batch - 1) * 2 + 1];
  speaker.playNotes([pitchFromY(lastY, state.frameBounds)], 100, 1);
  state.revealed += batch;
  state.samples = state.revealed;
  if (state.revealed >= state.total) finish();
}

function advanceCurve(step) {
  if (state.stages) {
    advanceGeneration(step);
    return;
  }
  if (state.total <= 0 || state.revealed >= state.total) {
    finish();
    return;
  }
  const batch = unitsPerFrame(speedInput.value, state.total, step);
  const next = Math.min(state.total, state.revealed + batch);
  const fractal = currentFractal();
  const y = fractal.kind === "gasket"
    ? triangleCentroidY(state.vertices, next - 1)
    : pointAtSegmentEnd(state.paths, next - 1)?.y;
  if (Number.isFinite(y)) speaker.playNotes([pitchFromY(y, state.frameBounds)], 100, 1);
  state.revealed = next;
  state.samples = next;
  if (state.revealed >= state.total) finish();
}

function advanceGeneration(step) {
  const budget = generationBudget();
  if (state.stageTick >= budget && state.revealed >= state.total) {
    if (state.stage + 1 >= state.stages.length) {
      finish();
      return;
    }
    showStage(state.stage + 1);
  }
  const jump = step ? Math.max(1, Math.ceil(budget / 4)) : 1;
  state.stageTick = Math.min(budget, state.stageTick + jump);
  const shown = Math.min(state.total, Math.max(1, Math.ceil((state.total * state.stageTick) / budget)));
  const fractal = currentFractal();
  const y = fractal.kind === "gasket"
    ? triangleCentroidY(state.vertices, shown - 1)
    : pointAtSegmentEnd(state.paths, shown - 1)?.y;
  if (Number.isFinite(y)) speaker.playNotes([pitchFromY(y, state.frameBounds)], 100, 1);
  state.revealed = shown;
  state.samples = shown;
  if (state.stage + 1 >= state.stages.length && state.stageTick >= budget) finish();
}

function showStage(index) {
  const geometry = state.stages[index];
  state.stage = index;
  state.stageTick = 0;
  state.revealed = 0;
  state.inked = 0;
  state.inkKey = "";
  if (geometry.mode === "triangles") {
    state.vertices = geometry.vertices;
    state.paths = null;
    state.total = geometry.vertices.length / 6;
  } else {
    state.paths = geometry.paths;
    state.vertices = null;
    state.total = segmentCount(geometry.paths);
  }
}

function visibleSamples(cap) {
  if (state.revealIter >= cap) return state.iterations.length;
  let count = 0;
  for (let i = 0; i < state.iterations.length; i += 1) {
    if (state.iterations[i] <= state.revealIter) count += 1;
  }
  return count;
}

function finish() {
  const first = !state.finished;
  state.finished = true;
  state.running = false;
  state.paused = false;
  if (first && !state.sweepPlayed) {
    state.sweepPlayed = true;
    const ramp = [];
    for (let i = 1; i <= 16; i += 1) ramp.push(i);
    speaker.playSweep(ramp, 16);
  }
}

function segmentCount(paths) {
  let total = 0;
  for (const path of paths) total += Math.max(0, path.length / 2 - 1);
  return total;
}

function pointAtSegmentEnd(paths, segmentIndex) {
  let index = 0;
  for (const path of paths) {
    const segments = Math.max(0, path.length / 2 - 1);
    if (segmentIndex < index + segments) {
      const local = segmentIndex - index;
      return { x: path[(local + 1) * 2], y: path[(local + 1) * 2 + 1] };
    }
    index += segments;
  }
  return null;
}

function triangleCentroidY(vertices, index) {
  const offset = index * 6;
  return (vertices[offset + 1] + vertices[offset + 3] + vertices[offset + 5]) / 3;
}

function pitchFromY(y, bounds) {
  if (!bounds || !Number.isFinite(y)) return 1;
  const span = Math.max(1e-9, bounds.maxY - bounds.minY);
  const t = Math.min(1, Math.max(0, (y - bounds.minY) / span));
  return 1 + Math.round(t * 99);
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
soundButton.addEventListener("click", () => {
  const on = soundButton.getAttribute("aria-pressed") !== "true";
  soundButton.setAttribute("aria-pressed", String(on));
  soundButton.textContent = on ? "Sound on" : "Sound";
  speaker.setEnabled(on);
});
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
