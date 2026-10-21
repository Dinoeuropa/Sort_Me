import katex from "../vendor/katex/katex.js";
import { FRACTALS, buildGeometry, constructionOrder, escapeBand, fractalById, iterateIfs, presetById } from "./fractals.js";
import { framesFor, unitsPerFrame } from "./fractal-pace.js";
import {
  boundsMagnification,
  escapeMagnification,
  escapeWindow,
  iterationCap,
  mapPointsInto,
  panBounds,
  panEscape,
  pointBudget,
  rasterSize,
  recursionLevel,
  zoomBounds,
  zoomEscape,
} from "./fractal-view.js";
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
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomResetButton = document.querySelector("#zoom-reset");
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
  home: null,
  view: null,
  baseDepth: 0,
  exploreToken: 0,
  exploring: false,
  shownCap: 0,
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

function viewedPreset() {
  const preset = currentPreset();
  if (currentFractal().kind !== "escape" || !state.view) return preset;
  return {
    ...preset,
    centerX: state.view.centerX,
    centerY: state.view.centerY,
    scale: state.view.scale,
  };
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

function escapeRaster(box) {
  const sharp = state.finished || state.exploring || currentMagnification() > 1.02;
  return rasterSize(box.width, box.height, box.dpr, sharp);
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
  note.textContent = zoomNote(fractal);
  fractal.legend.forEach((label, index) => {
    legend[index].textContent = label;
  });
  syncDepthControls();
  const depth = depthValue();
  const drawing = state.running || state.paused || state.finished;
  const generation = state.finished && state.home
    ? exploredLevel()
    : state.stages && drawing
      ? fractal.minDepth + state.stage
      : depth;
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
  if (state.exploring) statusEl.textContent = "Zooming";
  else if (state.running) statusEl.textContent = "Drawing";
  else if (state.paused) statusEl.textContent = "Paused";
  else if (state.finished) statusEl.textContent = "Drawn";
  else statusEl.textContent = "Ready";
  const canZoom = state.finished && !state.running;
  for (const button of [zoomInButton, zoomOutButton, zoomResetButton]) {
    button.disabled = !canZoom;
  }
  canvas.classList.toggle("exploring", canZoom);
  const box = viewBox();
  const deviceW = box.width * box.dpr;
  const upscaled = fractal.kind === "escape" && state.raster && state.raster.width + 1 < deviceW;
  canvas.classList.toggle("pixelated", upscaled);
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
  state.home = null;
  state.view = null;
  state.baseDepth = 0;
  state.exploreToken += 1;
  state.exploring = false;
  state.shownCap = 0;
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
  const raster = escapeRaster(box);
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
  const complete = state.nextRow >= state.raster.height;
  if (!complete && !state.exploring) return;
  if (state.revealIter <= 0 && !state.exploring) return;
  if (canvas.width !== state.raster.width || canvas.height !== state.raster.height) {
    canvas.width = state.raster.width;
    canvas.height = state.raster.height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const shown = state.shownCap || depthValue();
  const pixels = paintEscape(
    state.paletteId,
    state.iterations,
    state.basins,
    state.raster.width,
    state.raster.height,
    shown,
    complete ? state.raster.height : state.nextRow,
    state.exploring ? shown : state.revealIter,
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
      viewedPreset(),
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
  if (!state.home) captureHome();
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

function arm() {
  stop();
  state.dock = false;
  state.paused = false;
  resetProgress();
  renderChrome();
}

function restart() {
  stop();
  state.paused = false;
  resetProgress();
  startLoop();
  renderChrome();
}

function captureHome() {
  const fractal = currentFractal();
  state.baseDepth = depthValue();
  if (fractal.kind === "escape") {
    state.home = escapeWindow(currentPreset());
  } else {
    state.home = { ...state.frameBounds };
  }
  state.view = { ...state.home };
}

function currentMagnification() {
  if (!state.home || !state.view) return 1;
  if (currentFractal().kind === "escape") return escapeMagnification(state.home, state.view);
  return boundsMagnification(state.home, state.view);
}

function exploredLevel() {
  const fractal = currentFractal();
  const magnification = currentMagnification();
  const base = state.baseDepth || depthValue();
  if (fractal.kind === "escape") return iterationCap(base, magnification);
  if (fractal.kind === "ifs") return pointBudget(base, magnification, 80000);
  return recursionLevel(fractal.id, base, magnification, fractal.minDepth, fractal.maxDepth);
}

function zoomNote(fractal) {
  if (!state.finished || !state.home || !state.view) return fractal.note;
  const magnification = currentMagnification();
  if (magnification < 1.05 && magnification > 0.95) return fractal.note;
  const rounded = magnification >= 10 ? Math.round(magnification) : Math.round(magnification * 10) / 10;
  return `${fractal.note} View is ${rounded}× closer, drawn at level ${exploredLevel().toLocaleString()}.`;
}

function canExplore() {
  return state.finished && !state.running && state.home && state.view;
}

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function applyZoom(px, py, factor) {
  if (!canExplore()) return;
  const box = viewBox();
  const fractal = currentFractal();
  if (fractal.kind === "escape") {
    state.view = zoomEscape(state.view, factor, px, py, box.width, box.height, state.home.scale);
    scheduleEscape();
    return;
  }
  state.view = zoomBounds(state.view, factor, px, py, box.width, box.height, state.home);
  redrawExplored();
}

function applyPan(dx, dy) {
  if (!canExplore() || (dx === 0 && dy === 0)) return;
  const box = viewBox();
  const fractal = currentFractal();
  if (fractal.kind === "escape") {
    state.view = panEscape(state.view, dx, dy, box.width, box.height);
    scheduleEscape();
    return;
  }
  state.view = panBounds(state.view, dx, dy, box.width, box.height);
  redrawExplored();
}

function resetExplore() {
  if (!state.home) return;
  state.view = { ...state.home };
  if (currentFractal().kind === "escape") scheduleEscape();
  else redrawExplored();
}

function redrawExplored() {
  const fractal = currentFractal();
  const level = exploredLevel();
  state.exploring = false;
  state.exploreToken += 1;
  if (fractal.kind === "ifs") {
    if (!state.points || state.points.length / 2 < level) {
      const next = iterateIfs(state.fractalId, state.presetId, { x: 0, y: 0, seed: 1 }, level);
      state.points = next.points;
    }
    state.total = state.points.length / 2;
    state.revealed = state.total;
    state.samples = state.total;
  } else {
    let geometry = buildGeometry(state.fractalId, state.presetId, level);
    if (fractal.id === "dragon" || fractal.id === "hilbert") {
      geometry = placeGeometry(geometry, state.home);
    }
    if (geometry.mode === "triangles") {
      state.vertices = geometry.vertices;
      state.paths = null;
      state.total = geometry.vertices.length / 6;
    } else {
      state.paths = geometry.paths;
      state.vertices = null;
      state.total = segmentCount(geometry.paths);
    }
    state.stages = null;
    state.revealed = state.total;
    state.samples = state.total;
  }
  state.frameBounds = { ...state.view };
  state.inked = 0;
  state.inkKey = "";
  state.finished = true;
  paint();
  renderChrome();
}

function placeGeometry(geometry, home) {
  const source = geometry.mode === "polyline" ? geometry.paths : [geometry.vertices];
  const native = boundsOf(source);
  if (geometry.mode === "polyline") {
    return { mode: "polyline", paths: source.map((path) => mapPointsInto(path, native, home)) };
  }
  return { mode: "triangles", vertices: mapPointsInto(geometry.vertices, native, home) };
}

function scheduleEscape() {
  const token = ++state.exploreToken;
  state.exploring = true;
  renderChrome();
  const box = viewBox();
  const raster = rasterSize(box.width, box.height, box.dpr, true);
  const cap = exploredLevel();
  const preset = viewedPreset();
  const iterations = new Uint16Array(raster.width * raster.height);
  const basins = new Int8Array(iterations.length);
  basins.fill(-1);
  let row = 0;
  const step = () => {
    if (token !== state.exploreToken) return;
    const count = Math.max(1, Math.ceil(raster.height / 8));
    const rows = Math.min(count, raster.height - row);
    const band = escapeBand(
      state.fractalId,
      preset,
      raster.width,
      raster.height,
      cap,
      row,
      rows,
    );
    iterations.set(band.iterations, row * raster.width);
    basins.set(band.basins, row * raster.width);
    row += rows;
    if (row < raster.height) {
      requestAnimationFrame(step);
      return;
    }
    if (token !== state.exploreToken) return;
    state.raster = raster;
    state.iterations = iterations;
    state.basins = basins;
    state.nextRow = raster.height;
    state.revealIter = cap;
    state.shownCap = cap;
    state.samples = iterations.length;
    state.exploring = false;
    state.finished = true;
    paint();
    renderChrome();
  };
  requestAnimationFrame(step);
}

const pointers = new Map();

function pointerDistance(points) {
  const [a, b] = points;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!canExplore()) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // A synthetic event cannot capture the pointer. The move events still pan.
  }
  pointers.set(event.pointerId, localPoint(event));
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;
  const point = localPoint(event);
  const previous = pointers.get(event.pointerId);
  pointers.set(event.pointerId, point);
  if (pointers.size === 1) {
    applyPan(point.x - previous.x, point.y - previous.y);
    return;
  }
  if (pointers.size !== 2) return;
  const now = [...pointers.values()];
  const before = now.map((item) => (item === point ? previous : item));
  const span = pointerDistance(before);
  if (span < 1) return;
  const midX = (now[0].x + now[1].x) / 2;
  const midY = (now[0].y + now[1].y) / 2;
  applyZoom(midX, midY, pointerDistance(now) / span);
});

canvas.addEventListener("pointerup", (event) => pointers.delete(event.pointerId));
canvas.addEventListener("pointercancel", (event) => pointers.delete(event.pointerId));
canvas.addEventListener("dblclick", (event) => {
  if (!canExplore()) return;
  const point = localPoint(event);
  applyZoom(point.x, point.y, 2);
});
canvas.addEventListener("wheel", (event) => {
  if (!canExplore()) return;
  event.preventDefault();
  const point = localPoint(event);
  if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    const factor = Math.exp(-event.deltaY * 0.0015);
    applyZoom(point.x, point.y, factor);
    return;
  }
  applyPan(-event.deltaX, -event.deltaY);
}, { passive: false });

zoomInButton.addEventListener("click", () => {
  const box = viewBox();
  applyZoom(box.width / 2, box.height / 2, 2);
});
zoomOutButton.addEventListener("click", () => {
  const box = viewBox();
  applyZoom(box.width / 2, box.height / 2, 0.5);
});
zoomResetButton.addEventListener("click", resetExplore);

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
  arm();
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
  arm();
});
depthInput.addEventListener("change", () => arm());
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
  arm();
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
  } else if ((event.key === "+" || event.key === "=") && canExplore()) {
    event.preventDefault();
    zoomInButton.click();
  } else if (event.key === "-" && canExplore()) {
    event.preventDefault();
    zoomOutButton.click();
  } else if (event.key === "0" && canExplore()) {
    event.preventDefault();
    resetExplore();
  }
});

new ResizeObserver(() => {
  const fractal = currentFractal();
  if (fractal.kind !== "escape") {
    paint();
    return;
  }
  const box = viewBox();
  const raster = escapeRaster(box);
  if (state.raster && raster.width === state.raster.width && raster.height === state.raster.height) {
    paint();
    return;
  }
  if (state.running) restart();
  else if (state.finished && state.home) scheduleEscape();
}).observe(canvas.parentElement);

renderPresets();
depthInput.value = String(currentFractal().defaultDepth);
arm();
