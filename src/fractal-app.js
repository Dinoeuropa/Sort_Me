import katex from "../vendor/katex/katex.js";
import {
  FRACTALS,
  autoZoomFloor,
  autoZoomTarget,
  buildGeometry,
  constructionOrder,
  cursorParameter,
  escapeBand,
  openPaletteProbe,
  paletteRange,
  fractalById,
  iterateIfs,
  levelFrame,
  newtonCursor,
  presetById,
} from "./fractals.js";
import { framesFor, unitsPerFrame } from "./fractal-pace.js";
import {
  COVER_SLACK,
  ZOOM_PLATE_MS,
  PLATE_BLEND_MS,
  PLATE_TARGET_MS,
  advanceAutoZoom,
  autoZoomPath,
  autoZoomView,
  boundsMagnification,
  coverViews,
  easeFactor,
  escapeSourceBlit,
  fitZoomOut,
  escapeIterationCap,
  escapeMagnification,
  escapeWindow,
  FIT_PAD,
  incomingLevelFade,
  levelBlend,
  levelRatio,
  placeLevel,
  panBounds,
  panEscape,
  panPixels,
  panRepaint,
  DRAW_RASTER_EDGE,
  PLATE_EDGE_MAX,
  MOTION_SCALE_MIN,
  zoomShareNext,
  pickPlate,
  plateBudget,
  plateCovers,
  plateFrame,
  plateMargin,
  plateRasterEdge,
  pointBudget,
  gpuDepthMode,
  rasterSize,
  zoomRaster,
  settledRaster,
  recursionLevel,
  wheelZoomFactor,
  zoomBounds,
  zoomEscape,
  gpuZoomPlan,
  zoomFrameBlit,
} from "./fractal-view.js";
import { renderEscape } from "./escape-pool.js";
import {
  GPU_ITER_LIMIT,
  cancelGpuFrame,
  finishGpuFrame,
  gpuDrawLimit,
  gpuFrameReady,
  paintGpuEscape,
  pollGpuCost,
  queueGpuEscape,
} from "./escape-gpu.js";
import { hasDeepCenter, viewOffset } from "./precision.js";
import {
  PALETTES,
  boundsOf,
  colorSample,
  drawPaths,
  drawPoints,
  drawTriangles,
  easeWindow,
  fitScale,
  paintEscape,
  sampledSegmentLength,
  strokeWidth,
} from "./palettes.js";
import { runControlLabel } from "./session.js";
import { createBlankShow } from "./blank-show.js";
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
const variationButton = document.querySelector("#variation");
const presets = document.querySelector("#presets");
const toggleButton = document.querySelector("#toggle");
const stageDraw = document.querySelector("#stage-draw");
const blankShow = createBlankShow(document.querySelector("#blank-show"));
const stepButton = document.querySelector("#step");
const soundButton = document.querySelector("#sound");
const dock = document.querySelector("#viz-dock");
const dockSpeed = document.querySelector("#dock-speed");
const dockToggle = document.querySelector("#dock-toggle");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomResetButton = document.querySelector("#zoom-reset");
const autoZoomButton = document.querySelector("#auto-zoom");
const paramEl = document.querySelector("#param");
const modeBadge = document.querySelector("#mode-badge");
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
  epoch: 0,
  shownJob: 0,
  plateFlight: 0,
  flightJob: 0,
  flightView: null,
  autoZoom: false,
  reactive: true,
  autoToken: 0,
  cursorParam: null,
  frozenParam: null,
  cursorRedraw: false,
  autoPath: null,
  autoOctave: 0,
  autoStart: null,
  autoFade: null,
  autoPlates: [],
  autoDeep: null,
  plateEdge: 2560,
  plateTook: 0,
  plate: null,
  gpu: false,
  gpuHold: false,
  gpuKey: "",
  gpuShare: 1,
  gpuPan: null,
  reactiveView: null,
  autoHold: false,
  zoomJob: null,
  zoomShare: 1,
  zoomTook: 32,
  zoomExpect: 32,
  zoomSerial: 0,
  zoomMisses: 0,
  zoomGpuOk: true,
  cursorDirty: false,
};

const REACTIVE = new Set(["mandelbrot", "julia", "burning", "newton"]);
const glide = { factor: 1, px: 0, py: 0, panX: 0, panY: 0, raf: 0, movedAt: 0 };
let curveFrame = 0;
const levelCache = new Map();
let homeFrame = null;

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

function viewBox() {
  const rect = canvas.getBoundingClientRect();
  const rawDpr = window.devicePixelRatio || 1;
  const dpr = Math.min(rawDpr, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  return { width, height, dpr, rawDpr };
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
    button.setAttribute("role", "menuitemradio");
    button.dataset.preset = preset.id;
    button.textContent = preset.name;
    button.setAttribute("aria-checked", String(preset.id === state.presetId));
    presets.append(button);
  }
}

function setVariationMenu(open) {
  variationButton.setAttribute("aria-expanded", String(open));
  presets.hidden = !open;
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

function legendInk(iteration, max) {
  const [red, green, blue] = colorSample(state.paletteId, iteration, max, -1);
  return `rgb(${red}, ${green}, ${blue})`;
}

function paintLegend() {
  document.querySelector(".swatch.inside").style.background = legendInk(24, 24);
  document.querySelector(".swatch.early").style.background = legendInk(6, 24);
  document.querySelector(".swatch.late").style.background = legendInk(21, 24);
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
  paintLegend();
  syncDepthControls();
  const depth = depthValue();
  const drawing = state.running || state.paused || state.finished;
  const generation = state.finished && state.home
    ? exploredLevel()
    : state.stages && drawing
      ? fractal.minDepth + state.stage
      : depth;
  depthStat.textContent = state.autoZoom ? formatMag(currentMagnification()) : generation.toLocaleString();
  samplesEl.textContent = state.samples.toLocaleString();
  kindEl.textContent = KIND[fractal.kind];
  presetStat.textContent = preset.name;
  for (const button of presets.querySelectorAll("button")) {
    button.setAttribute("aria-checked", String(button.dataset.preset === state.presetId));
  }
  variationButton.setAttribute("aria-label", `Variation, ${preset.name}`);
  const pace = paceLabel(fractal);
  speedOut.textContent = pace;
  const control = runControlLabel({ running: state.running, paused: state.paused, idle: "Draw" });
  toggleButton.textContent = control;
  dockToggle.textContent = control;
  dock.hidden = !state.dock;
  stageDraw.hidden = !canvasIsBlank();
  blankShow.setVisible(canvasIsBlank());
  dockSpeed.value = speedInput.value;
  if (state.autoZoom) statusEl.textContent = "Deep zoom";
  else if (state.exploring && !state.cursorRedraw) statusEl.textContent = "Zooming";
  else if (state.running) statusEl.textContent = "Drawing";
  else if (state.paused) statusEl.textContent = "Paused";
  else if (state.finished) statusEl.textContent = "Drawn";
  else statusEl.textContent = "Ready";
  const reactive = isReactive();
  const canZoom = state.finished && !state.running && !state.autoZoom;
  zoomInButton.disabled = !canZoom;
  zoomOutButton.disabled = !canZoom;
  zoomResetButton.disabled = !(state.finished && !state.running && state.home);
  autoZoomButton.hidden = !canAutoZoom();
  autoZoomButton.disabled = !(state.finished && !state.running && canAutoZoom());
  autoZoomButton.setAttribute("aria-pressed", String(state.autoZoom));
  modeBadge.hidden = !(canAutoZoom() && state.finished && !state.running);
  modeBadge.setAttribute("aria-pressed", String(reactive));
  modeBadge.textContent = reactive ? "reactive on" : "reactive off";
  modeBadge.disabled = state.autoZoom;
  canvas.classList.toggle("exploring", canZoom && !reactive);
  canvas.classList.toggle("reactive", state.finished && !state.running && reactive);
  const box = viewBox();
  const sharpEnough = state.raster && Math.max(state.raster.width, state.raster.height) + 1 >= Math.max(box.width, box.height) * box.dpr;
  canvas.classList.toggle("pixelated", fractal.kind === "escape" && !sharpEnough && !state.plate && !state.gpu);
  const paramText = formatParam();
  paramEl.hidden = !paramText;
  paramEl.textContent = paramText;
}

function paceLabel(fractal) {
  const speed = speedInput.value;
  if (fractal.kind === "escape") {
    return perFrame(unitsPerFrame(speed, depthValue(), false), "iteration", "iterations");
  }
  if (state.stages) {
    const budget = generationBudget(false);
    const batch = Math.max(1, Math.ceil((state.total || 1) / budget));
    if (state.vertices) return perFrame(batch, "triangle", "triangles");
    return perFrame(batch, "segment", "segments");
  }
  const units = unitsPerFrame(speed, state.total || depthValue(), false);
  if (fractal.kind === "ifs") return perFrame(units, "pt", "pts");
  if (state.vertices) return perFrame(units, "triangle", "triangles");
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
  state.epoch += 1;
  state.shownJob = 0;
  haltAutoZoom();
  cancelGlide();
  state.cursorParam = null;
  state.reactiveView = null;
  state.plate = null;
  state.gpu = false;
  state.gpuHold = false;
  state.gpuKey = "";
  state.gpuPan = null;
  dropGpuWarp();
  cancelRefine();
  state.cursorDirty = false;
  state.cursorRedraw = false;
  levelCache.clear();
  homeFrame = null;
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
  if (canExplore()) {
    paintSettled(box);
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
  if (state.vertices) {
    paintTriangles(box);
    return;
  }
  paintSegments(box);
}

function paintRaster() {
  if (state.plate && pictureView() && viewMoved(state.plate, pictureView(), 0.004)) {
    blitPlate();
    return;
  }
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
  const y = state.vertices
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
  const y = state.vertices
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
  if (currentFractal().kind === "escape" && state.raster && state.iterations && state.nextRow >= state.raster.height) {
    rememberCurrentPlate();
    scheduleEscape();
  }
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
  if (fractal.kind === "escape") {
    return escapeIterationCap(state.fractalId, base, magnification);
  }
  if (fractal.kind === "ifs") return pointBudget(base, magnification, 80000);
  if (!state.view) return recursionLevel(fractal.id, base, magnification, fractal.minDepth, fractal.maxDepth, state.presetId);
  return settledCurve(viewBox()).level;
}

/** The note never changes during auto zoom, so the frame above it keeps its size while the view moves. */
function zoomNote(fractal) {
  if (state.autoZoom) return fractal.note;
  if (!state.finished || !state.home || !state.view) return fractal.note;
  const magnification = currentMagnification();
  if (magnification < 1.05 && magnification > 0.95) return fractal.note;
  const shown = magnification >= 1e9
    ? formatMag(magnification)
    : `${magnification >= 10 ? Math.round(magnification) : Math.round(magnification * 10) / 10}×`;
  return `${fractal.note} View is ${shown} closer, drawn at level ${exploredLevel().toLocaleString()}.`;
}

function canvasIsBlank() {
  return !state.running && !state.paused && !state.finished;
}

function canExplore() {
  return state.finished && !state.running && state.home && state.view && !state.autoZoom;
}

function canAutoZoom(id = state.fractalId) {
  return REACTIVE.has(id);
}

function isReactive(id = state.fractalId) {
  return canAutoZoom(id) && state.reactive && !state.autoZoom;
}

function formatMag(mag) {
  if (!Number.isFinite(mag) || mag < 1.05) return "1×";
  if (mag >= 1e9) {
    const power = Math.floor(Math.log10(mag));
    return `${(mag / 10 ** power).toFixed(1)}e${power}×`;
  }
  if (mag >= 1e6) return `${(mag / 1e6).toFixed(mag >= 1e7 ? 0 : 1)}M×`;
  if (mag >= 10000) return `${(mag / 1000).toFixed(1)}k×`;
  if (mag >= 10) return `${Math.round(mag).toLocaleString()}×`;
  return `${(Math.round(mag * 10) / 10).toLocaleString()}×`;
}

function formatComplex(x, y) {
  const real = `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(4)}`;
  const imag = `${Math.abs(y).toFixed(4)}`;
  return `${real} ${y < 0 ? "−" : "+"} ${imag}i`;
}

function autoZoomBadge() {
  return `Deep zoom ${formatMag(currentMagnification())} · ${exploredLevel().toLocaleString()} iterations`;
}

function formatParam() {
  if (state.autoZoom) return autoZoomBadge();
  if (!state.cursorParam) return "";
  if (state.fractalId === "newton") return `p = ${formatComplex(state.cursorParam.px, state.cursorParam.py)}`;
  const name = state.fractalId === "mandelbrot" ? "Julia c" : "c";
  return `${name} = ${formatComplex(state.cursorParam.x, state.cursorParam.y)}`;
}

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function usingReactiveFrame() {
  return state.fractalId === "mandelbrot" && state.cursorParam && !state.autoZoom;
}

function pictureView() {
  if (usingReactiveFrame()) return state.reactiveView;
  return state.view;
}

function applyZoom(px, py, factor) {
  glide.factor = 1;
  shiftPicture(px, py, factor, 0, 0, true);
}

function applyPan(dx, dy) {
  if (dx === 0 && dy === 0) return;
  glide.panX = 0;
  glide.panY = 0;
  shiftPicture(0, 0, 1, dx, dy, true);
}

function queueZoom(px, py, factor) {
  if (!canExplore() || !Number.isFinite(factor) || factor <= 0) return;
  glide.factor *= factor;
  glide.px = px;
  glide.py = py;
  glide.movedAt = performance.now();
  startGlide();
}

function zoomInsidePlate(view, factor, px, py, box, homeScale) {
  const proposed = zoomEscape(view, factor, px, py, box.width, box.height, homeScale);
  if (!(factor < 1) || !state.plate) return proposed;
  const aspect = box.width / Math.max(1, box.height);
  const fitted = fitZoomOut(state.plate, view, proposed, aspect);
  if (fitted.scale < proposed.scale * (1 - 1e-9)) glide.factor *= fitted.scale / proposed.scale;
  return fitted;
}

function shiftPicture(px, py, factor, dx, dy, soon = false) {
  if (!canExplore()) return;
  const box = viewBox();
  const fractal = currentFractal();
  if (fractal.kind === "escape") {
    if (usingReactiveFrame()) {
      if (!state.reactiveView) {
        state.reactiveView = { centerX: 0, centerY: 0, scale: 3.2, flipY: false };
      }
      if (factor !== 1) state.reactiveView = zoomInsidePlate(state.reactiveView, factor, px, py, box, 3.2);
      if (dx || dy) state.reactiveView = panEscape(state.reactiveView, dx, dy, box.width, box.height);
    } else {
      if (factor !== 1) state.view = zoomInsidePlate(state.view, factor, px, py, box, state.home.scale);
      if (dx || dy) state.view = panEscape(state.view, dx, dy, box.width, box.height);
    }
    if (paintGpuFrame(pictureView(), box)) {
      renderChrome();
      return;
    }
    if (state.plate && pictureView() && viewMoved(state.plate, pictureView(), 0.004)) blitPlate();
    renderChrome();
    requestDetail(false);
    return;
  }
  if (factor !== 1) state.view = zoomBounds(state.view, factor, px, py, box.width, box.height, state.home);
  if (dx || dy) state.view = panBounds(state.view, dx, dy, box.width, box.height);
  state.frameBounds = { ...state.view };
  if (soon) {
    paintNextFrame();
    return;
  }
  cancelNextFrame();
  paint();
  renderChrome();
}

/** Pointer moves can outnumber frames; the view follows every one but the canvas is drawn once per frame. */
function paintNextFrame() {
  if (curveFrame) return;
  curveFrame = requestAnimationFrame(() => {
    curveFrame = 0;
    if (!canExplore()) return;
    paint();
    renderChrome();
  });
}

function cancelNextFrame() {
  if (curveFrame) cancelAnimationFrame(curveFrame);
  curveFrame = 0;
}

function startGlide() {
  if (glide.raf) return;
  const step = () => {
    glide.raf = 0;
    if (!canExplore()) {
      cancelGlide();
      return;
    }
    const zoom = easeFactor(glide.factor);
    glide.factor = zoom.rest;
    let panX = glide.panX * 0.22;
    let panY = glide.panY * 0.22;
    const panLen = Math.hypot(panX, panY);
    if (panLen > 36) {
      panX *= 36 / panLen;
      panY *= 36 / panLen;
    }
    glide.panX -= panX;
    glide.panY -= panY;
    if (Math.abs(glide.panX) < 0.4) glide.panX = 0;
    if (Math.abs(glide.panY) < 0.4) glide.panY = 0;
    const before = pictureView()?.scale;
    if (zoom.applied !== 1 || panX || panY) shiftPicture(glide.px, glide.py, zoom.applied, panX, panY);
    if (zoom.applied !== 1 && Number.isFinite(before) && pictureView()?.scale === before) glide.factor = 1;
    if (glide.factor !== 1 || glide.panX || glide.panY) {
      glide.raf = requestAnimationFrame(step);
      return;
    }
    requestDetail(true);
  };
  glide.raf = requestAnimationFrame(step);
}

function cancelGlide() {
  if (glide.raf) cancelAnimationFrame(glide.raf);
  glide.raf = 0;
  glide.factor = 1;
  glide.panX = 0;
  glide.panY = 0;
}

/** The one curve generation to draw. The next generation replaces this one once it is the picture; it is never drawn on top of it. */
function settledCurve(box) {
  const fractal = currentFractal();
  const blend = levelBlend(fractal.id, currentMagnification(), state.presetId);
  const base = clampNumber((state.baseDepth || depthValue()) + blend.extra, fractal.minDepth, fractal.maxDepth);
  const next = Math.min(fractal.maxDepth, base + 1);
  const geometry = geometryAt(base);
  const ratio = levelRatio(fractal.id, state.presetId);
  const points = geometry.mode === "triangles" ? geometry.vertices : geometry.paths?.[0];
  const span = sampledSegmentLength(points, geometry.mode === "triangles" ? 3 : 0);
  const nextPx = ratio > 1 ? (span / ratio) * fitScale(state.view, box.width, box.height, FIT_PAD) : 0;
  const shown = incomingLevelFade(blend.fade, nextPx, ratio, strokeWidth(box.width, box.height));
  return shown > 0.5 && next > base ? { level: next, geometry: geometryAt(next) } : { level: base, geometry };
}

function paintSettled(box) {
  prepareVectorCanvas(box);
  const fractal = currentFractal();
  if (fractal.kind === "ifs") {
    const level = pointBudget(state.baseDepth || depthValue(), currentMagnification(), 80000);
    if (!state.points || state.points.length / 2 < level) {
      const next = iterateIfs(state.fractalId, state.presetId, { x: 0, y: 0, seed: 1 }, level);
      state.points = next.points;
    }
    state.total = state.points.length / 2;
    state.revealed = state.total;
    state.samples = state.total;
    state.frameBounds = { ...state.view };
    state.inked = 0;
    paintPoints(box);
    return;
  }
  const drawn = settledCurve(box);
  drawStored(drawn.geometry, box, true);
  if (drawn.geometry.mode === "triangles") {
    state.vertices = drawn.geometry.vertices;
    state.paths = null;
    state.total = drawn.geometry.vertices.length / 6;
  } else {
    state.paths = drawn.geometry.paths;
    state.vertices = null;
    state.total = segmentCount(drawn.geometry.paths);
  }
  state.revealed = state.total;
  state.samples = state.total;
  state.frameBounds = { ...state.view };
  state.inked = state.total;
}

function geometryAt(level) {
  const key = `${state.fractalId}:${state.presetId}:${level}`;
  let geometry = levelCache.get(key);
  if (!geometry) {
    geometry = buildGeometry(state.fractalId, state.presetId, level);
    if (growsInPlace(state.fractalId)) geometry = placeGeometry(geometry);
    levelCache.set(key, geometry);
  }
  return geometry;
}

function drawStored(geometry, box, clear) {
  if (geometry.mode === "triangles") {
    const total = geometry.vertices.length / 6;
    drawTriangles(state.paletteId, ctx, geometry.vertices, box.width, box.height, state.view, {
      from: 0,
      until: total,
      clear,
      total,
    });
    return;
  }
  const total = segmentCount(geometry.paths);
  drawPaths(state.paletteId, ctx, geometry.paths, box.width, box.height, state.view, {
    from: 0,
    until: total,
    clear,
    total,
  });
}

function viewMoved(a, b, tolerance) {
  if (!a || !b || !(a.scale > 0) || !(b.scale > 0)) return false;
  const scale = Math.abs(Math.log(a.scale / b.scale));
  const span = a.scale;
  const at = viewOffset(a, b);
  const center = Math.hypot(at.dx, at.dy) / span;
  return scale > tolerance || center > tolerance;
}

function blitPlate() {
  const box = viewBox();
  const moving = glide.factor !== 1 || glide.panX !== 0 || glide.panY !== 0;
  const dest = moving ? motionRaster(box) : rasterSize(box.width, box.height, box.dpr, true);
  if (canvas.width !== dest.width || canvas.height !== dest.height) {
    canvas.width = dest.width;
    canvas.height = dest.height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, dest.width, dest.height);
  drawEscapePlate(state.plate.canvas, state.plate, pictureView(), dest.width, dest.height);
}

function rememberCurrentPlate() {
  const view = pictureView() || state.view;
  if (!view || !state.raster || !state.iterations || state.nextRow < state.raster.height) return;
  const shown = state.shownCap || state.revealIter || depthValue();
  const pixels = paintEscape(
    state.paletteId,
    state.iterations,
    state.basins,
    state.raster.width,
    state.raster.height,
    shown,
    state.raster.height,
    shown,
  );
  rememberPlate(state.raster, pixels, view);
}

function rememberPlate(raster, pixels, view) {
  if (!view || !pixels) return;
  const plate = document.createElement("canvas");
  plate.width = raster.width;
  plate.height = raster.height;
  plate.getContext("2d").putImageData(new ImageData(pixels, raster.width, raster.height), 0, 0);
  state.plate = { canvas: plate, ...plateFrame(view, raster.width, raster.height) };
}

function glideDestination(view) {
  const box = viewBox();
  let next = { ...view };
  const homeScale = usingReactiveFrame() ? 3.2 : state.home?.scale || view.scale;
  if (glide.factor !== 1) {
    next = zoomEscape(next, glide.factor, glide.px, glide.py, box.width, box.height, homeScale);
  }
  if (glide.panX || glide.panY) next = panEscape(next, glide.panX, glide.panY, box.width, box.height);
  return next;
}

function viewIsMoving() {
  return glide.factor !== 1 || glide.panX !== 0 || glide.panY !== 0;
}

function requestDetail(idle) {
  if (state.autoZoom || !canExplore() || currentFractal().kind !== "escape") return;
  const view = pictureView();
  if (!view) return;
  const box = viewBox();
  const aspect = box.width / Math.max(1, box.height);
  if (viewIsMoving()) {
    const dest = glideDestination(view);
    const covered = state.plate && plateCovers(state.plate, dest, aspect);
    const inflight = state.flightView && plateCovers(state.flightView, dest, aspect);
    if (!covered && !inflight) scheduleEscape();
    return;
  }
  const limit = idle ? 0.01 : Math.log(1.12);
  if (!state.plate || state.plate.draft || viewMoved(state.plate, view, limit)) scheduleEscape();
}

function resetExplore() {
  if (!state.home) return;
  haltAutoZoom();
  state.cursorParam = null;
  state.view = { ...state.home };
  if (currentFractal().kind === "escape") scheduleEscape();
  else redrawExplored();
  renderChrome();
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
    if (growsInPlace(fractal.id)) geometry = placeGeometry(geometry);
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

function growsInPlace(fractalId) {
  return fractalId === "dragon" || fractalId === "hilbert" || fractalId === "gosper" || fractalId === "levy" || fractalId === "tree";
}

/** A level carried into the coordinates of the level the zoom started from, where it lies on that level. */
function placeGeometry(geometry) {
  if (!homeFrame) {
    const home = buildGeometry(state.fractalId, state.presetId, state.baseDepth || depthValue());
    homeFrame = levelFrame(state.fractalId, state.presetId, home);
  }
  return placeLevel(geometry, levelFrame(state.fractalId, state.presetId, geometry), homeFrame);
}

function renderJob(view = pictureView() || state.view) {
  const preset = currentPreset();
  const fractal = currentFractal();
  const framed = { ...preset };
  let fractalId = state.fractalId;
  const param = state.autoZoom ? state.frozenParam : state.cursorParam;
  if (view && fractal.kind === "escape") {
    framed.centerX = view.centerX;
    framed.centerY = view.centerY;
    framed.scale = view.scale;
    framed.flipY = Boolean(view.flipY);
    if (hasDeepCenter(view)) {
      framed.centerXLo = view.centerXLo || 0;
      framed.centerYLo = view.centerYLo || 0;
    }
  }
  if (param && state.fractalId === "mandelbrot" && !state.autoZoom && Number.isFinite(param.x)) {
    framed.cx = param.x;
    framed.cy = param.y;
    fractalId = "julia";
  } else if (param && state.fractalId === "julia" && Number.isFinite(param.x)) {
    framed.cx = param.x;
    framed.cy = param.y;
  } else if (param && state.fractalId === "burning" && Number.isFinite(param.x)) {
    framed.cx = param.x;
    framed.cy = param.y;
  } else if (param && state.fractalId === "newton" && Number.isFinite(param.px)) {
    framed.px = param.px;
    framed.py = param.py;
  }
  return { fractalId, preset: framed };
}

let newestBand = 0;

/** Milliseconds a settled band of the sharp picture may spend. */
const BAND_BUDGET_MS = 24;
const BAND_SHARE = 16;

/** What the shader has cost lately, in milliseconds per million pixels per iteration of the cap. */
const gpuClock = { cost: Number.NaN };
const refine = { raf: 0, key: "" };
const paletteFit = { key: "", window: null, scene: "", shown: null };
let paletteProbe = null;
let gpuPanScratch = null;

function cancelRefine() {
  if (refine.raf) cancelAnimationFrame(refine.raf);
  refine.raf = 0;
  refine.key = "";
}

function timeGpu(width, height, cap, paint) {
  const sample = pollGpuCost();
  const sheet = paint();
  if (Number.isFinite(sample) && sample > 0) {
    gpuClock.cost = Number.isFinite(gpuClock.cost) ? gpuClock.cost * 0.5 + sample * 0.5 : sample;
  }
  return sheet;
}

/**
 * The palette window a deep plate from the workers would get, so the shader's picture looks the
 * same. Sampled again each quarter octave rather than every frame. Past a pair of doubles the
 * seahorse grid is one cell a frame, refreshed each octave, so the fit does not stall the dive.
 * A frame that moves the picture eases the colors shown toward the newest fit.
 */
function gpuPaletteWindow(job, width, height, cap, moving) {
  const preset = job.preset;
  const scene = [job.fractalId, preset.cx, preset.cy, preset.px, preset.py, width, height].join(":");
  const depth = Math.min(1, Math.max(0, -Math.log10(preset.scale) / 2));
  if (!(depth > 0)) {
    paletteProbe = null;
    paletteFit.scene = scene;
    paletteFit.shown = { floor: 0, top: cap };
    return { floor: 0, top: null };
  }
  const deepMandelbrot = job.fractalId === "mandelbrot" && preset.scale < 1e-30;
  const slices = moving || deepMandelbrot ? 1 : 4;
  const key = [scene, Math.round(Math.log2(preset.scale) * slices)].join(":");
  if (paletteFit.key !== key) {
    paletteFit.key = key;
    if (moving) {
      paletteProbe = openPaletteProbe(job.fractalId, preset, width, height, cap, 4);
    } else if (deepMandelbrot) {
      paletteProbe = openPaletteProbe(job.fractalId, preset, width, height, cap);
    } else {
      paletteProbe = null;
      paletteFit.window = paletteRange(job.fractalId, preset, width, height, cap);
    }
  }
  if (paletteProbe) {
    const started = performance.now();
    let fitted = null;
    do {
      fitted = paletteProbe.step();
    } while (moving && !fitted && performance.now() - started < 3);
    if (fitted) {
      paletteFit.window = fitted;
      paletteProbe = null;
    }
  }
  if (!paletteFit.window) paletteFit.window = { floor: 0, top: cap };
  if (!paletteFit.shown || paletteFit.scene !== scene) {
    paletteFit.scene = scene;
    paletteFit.shown = paletteFit.window;
  } else if (moving) {
    paletteFit.shown = easeWindow(paletteFit.shown, paletteFit.window);
  }
  return paletteFit.shown;
}

/**
 * Color the pixels on screen from the formula. A settled frame uses settledRaster, which can be larger than the screen and is limited by the GPU's drawing buffer.
 * Deep views are offsets from a reference orbit. Past a pair of doubles the Mandelbrot seahorse
 * uses the refined center. A moving frame is drawn at 4K, full size, so a zoom does not enlarge
 * a screen-sized picture into pixels.
 * Returns false where the GPU cannot draw the view, and the workers take over.
 */
const gpuWarp = { canvas: null, view: null, pending: false, pendingView: null, width: 0, height: 0 };

function dropGpuWarp() {
  gpuWarp.canvas = null;
  gpuWarp.view = null;
  gpuWarp.previous = null;
  gpuWarp.previousView = null;
  gpuWarp.born = 0;
  gpuWarp.pending = false;
  gpuWarp.pendingView = null;
  gpuWarp.width = 0;
  gpuWarp.height = 0;
  cancelGpuFrame();
}

function sameGpuView(a, b) {
  if (!a || !b) return false;
  return a.scale === b.scale
    && a.centerX === b.centerX
    && a.centerY === b.centerY
    && (a.centerXLo || 0) === (b.centerXLo || 0)
    && (a.centerYLo || 0) === (b.centerYLo || 0)
    && Boolean(a.flipY) === Boolean(b.flipY);
}

function rememberGpuFrame(sheet, view, width, height, blend = false) {
  if (!sheet || !view || width < 1 || height < 1) return;
  if (blend && gpuWarp.canvas && gpuWarp.view) {
    const kept = gpuWarp.previous;
    gpuWarp.previous = gpuWarp.canvas;
    gpuWarp.previousView = gpuWarp.view;
    gpuWarp.canvas = kept;
  }
  if (blend) gpuWarp.born = performance.now();
  if (!gpuWarp.canvas) gpuWarp.canvas = document.createElement("canvas");
  if (gpuWarp.canvas.width !== width || gpuWarp.canvas.height !== height) {
    gpuWarp.canvas.width = width;
    gpuWarp.canvas.height = height;
  }
  const copy = gpuWarp.canvas.getContext("2d");
  copy.setTransform(1, 0, 0, 1, 0, 0);
  copy.drawImage(sheet, 0, 0, width, height);
  gpuWarp.view = { ...view };
  gpuWarp.width = width;
  gpuWarp.height = height;
}

function showStoredFrame(view, dest, warp) {
  if (!gpuWarp.canvas || gpuWarp.width !== dest.width || gpuWarp.height !== dest.height) return false;
  const blit = warp ? zoomFrameBlit(gpuWarp.view, view, dest.width, dest.height) : null;
  if (warp && !blit) return false;
  if (canvas.width !== dest.width || canvas.height !== dest.height) {
    canvas.width = dest.width;
    canvas.height = dest.height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (blit) {
    ctx.drawImage(gpuWarp.canvas, blit.sx, blit.sy, blit.sw, blit.sh, blit.dx, blit.dy, blit.dw, blit.dh);
  } else {
    ctx.drawImage(gpuWarp.canvas, 0, 0);
  }
  return true;
}

function paintGpuFrame(view, box, settle = false) {
  if (!view || state.running || !box) {
    state.gpuPan = null;
    return false;
  }
  const dest = settle
    ? settledRaster(box.width, box.height, box.rawDpr || box.dpr, gpuDrawLimit())
    : motionRaster(box);
  if (
    state.gpuPan
    && (state.gpuPan.width !== dest.width || state.gpuPan.height !== dest.height || state.gpuPan.view.scale !== view.scale)
  ) {
    state.gpuPan = null;
  }
  const cap = exploredLevel();
  const depth = gpuDepthMode(view, dest.height);
  if (!depth || (depth !== "deep" && cap > GPU_ITER_LIMIT)) {
    state.gpuPan = null;
    return false;
  }
  const job = renderJob(view);
  const key = [
    job.fractalId, view.centerX, view.centerXLo, view.centerY, view.centerYLo, view.scale,
    job.preset.cx, job.preset.cy, job.preset.px, job.preset.py, cap, state.paletteId, dest.width, dest.height,
  ].join(":");
  const repaint = !(settle && state.gpuKey === key && (refine.key === key || state.gpuShare < 1));
  const fit = gpuPaletteWindow(job, dest.width, dest.height, cap, repaint);
  const shared = {
    fractalId: job.fractalId,
    preset: job.preset,
    cap,
    paletteId: state.paletteId,
    depth,
    floor: fit.floor,
    top: fit.top,
  };
  const share = 1;
  if (settle && refine.key === key) return true;
  cancelRefine();
  if (!(settle && state.gpuKey === key && state.gpuShare < 1)) {
    const width = Math.max(1, Math.round(dest.width * share));
    const height = Math.max(1, Math.round(dest.height * share));
    const panned = !settle && share === 1 && paintGpuPan(view, dest, shared);
    let matched = panned;
    if (panned) {
      rememberGpuFrame(canvas, view, dest.width, dest.height);
    } else {
      if (gpuWarp.pending && (gpuWarp.width !== width || gpuWarp.height !== height)) {
        cancelGpuFrame();
        gpuWarp.pending = false;
      }
      const stored = gpuWarp.view && gpuWarp.width === width && gpuWarp.height === height;
      const ready = Boolean(stored && gpuWarp.pending && gpuFrameReady());
      const shown = ready ? gpuWarp.pendingView : gpuWarp.view;
      const blit = stored && shown ? zoomFrameBlit(shown, view, width, height) : null;
      const covered = Boolean(blit) && blit.dw >= width - 1 && blit.dh >= height - 1 && blit.dx <= 1 && blit.dy <= 1;
      const plan = !settle && stored
        ? gpuZoomPlan({
          hasSnapshot: true,
          pending: gpuWarp.pending,
          ready,
          sameView: sameGpuView(shown, view),
          covered,
        })
        : { show: "fresh", start: true, adopt: false };
      if (settle && gpuWarp.pending) {
        if (ready && sameGpuView(gpuWarp.pendingView, view)) {
          plan.adopt = true;
          plan.show = "sharp";
          plan.start = false;
        } else {
          cancelGpuFrame();
          gpuWarp.pending = false;
        }
      }
      if (plan.adopt) {
        const finished = finishGpuFrame();
        if (finished) rememberGpuFrame(finished, gpuWarp.pendingView, width, height);
        gpuWarp.pending = false;
      }
      if (plan.show === "warp") matched = showStoredFrame(view, dest, true);
      else if (plan.show === "sharp") matched = showStoredFrame(view, dest, false);
      if (plan.show === "fresh" || (plan.show === "hold" && !matched) || ((plan.show === "warp" || plan.show === "sharp") && !matched)) {
        let sheet = null;
        try {
          sheet = timeGpu(width, height, cap, () => paintGpuEscape({ ...shared, width, height }));
        } catch {
          state.gpuPan = null;
          dropGpuWarp();
          return false;
        }
        if (!sheet) {
          state.gpuPan = null;
          dropGpuWarp();
          return false;
        }
        if (canvas.width !== dest.width || canvas.height !== dest.height) {
          canvas.width = dest.width;
          canvas.height = dest.height;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(sheet, 0, 0, width, height, 0, 0, dest.width, dest.height);
        rememberGpuFrame(canvas, view, dest.width, dest.height);
        gpuWarp.pending = false;
        matched = true;
        plan.start = false;
      }
      if (plan.start) {
        const sample = pollGpuCost();
        if (Number.isFinite(sample) && sample > 0) {
          gpuClock.cost = Number.isFinite(gpuClock.cost) ? gpuClock.cost * 0.5 + sample * 0.5 : sample;
        }
        let queued = null;
        try {
          queued = queueGpuEscape({ ...shared, width, height });
        } catch {
          queued = null;
        }
        if (queued) {
          gpuWarp.pending = true;
          gpuWarp.pendingView = { ...view };
        } else {
          gpuWarp.pending = false;
          let sheet = null;
          try {
            sheet = timeGpu(width, height, cap, () => paintGpuEscape({ ...shared, width, height }));
          } catch {
            sheet = null;
          }
          if (sheet) {
            if (canvas.width !== dest.width || canvas.height !== dest.height) {
              canvas.width = dest.width;
              canvas.height = dest.height;
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(sheet, 0, 0, width, height, 0, 0, dest.width, dest.height);
            rememberGpuFrame(canvas, view, dest.width, dest.height);
            matched = true;
          }
        }
      }
    }
    state.gpuKey = key;
    state.gpuShare = share;
    if (share === 1 && matched) {
      state.gpuPan = { view: { ...view }, width: dest.width, height: dest.height };
    } else if (!matched) {
      state.gpuPan = null;
    }
  }
  if (settle && state.gpuShare < 1) sharpenGpuFrame(key, dest, shared);
  state.gpu = true;
  state.gpuHold = true;
  state.plate = null;
  state.iterations = null;
  state.basins = null;
  state.raster = null;
  state.samples = dest.width * dest.height;
  state.shownCap = cap;
  state.finished = true;
  state.exploring = false;
  if (state.flightJob) {
    state.shownJob = Math.max(state.shownJob, state.flightJob);
    newestBand = Math.max(newestBand, state.flightJob);
    state.flightJob = 0;
    state.flightView = null;
  }
  return true;
}

/**
 * Reuse the last full-share GPU picture for a pan: copy the overlap, then redraw only the
 * strips that came into view. Returns false when the pan cannot be applied, so the caller
 * draws a full frame.
 */
function paintGpuPan(view, dest, shared) {
  if (!state.gpuPan || state.gpuPan.width !== dest.width || state.gpuPan.height !== dest.height) return false;
  if (canvas.width !== dest.width || canvas.height !== dest.height) return false;
  const shift = panPixels(state.gpuPan.view, view, dest.width, dest.height);
  if (!shift) return false;
  const plan = panRepaint(dest.width, dest.height, shift.x, shift.y);
  if (!plan) return false;
  if (!gpuPanScratch) gpuPanScratch = document.createElement("canvas");
  if (gpuPanScratch.width !== dest.width || gpuPanScratch.height !== dest.height) {
    gpuPanScratch.width = dest.width;
    gpuPanScratch.height = dest.height;
  }
  const scratchCtx = gpuPanScratch.getContext("2d");
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.globalAlpha = 1;
  scratchCtx.drawImage(canvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  const { copy } = plan;
  ctx.drawImage(gpuPanScratch, copy.sx, copy.sy, copy.sw, copy.sh, copy.dx, copy.dy, copy.sw, copy.sh);
  for (const rect of plan.rects) {
    let strip = null;
    try {
      strip = paintGpuEscape({
        ...shared,
        width: dest.width,
        height: dest.height,
        rows: { from: rect.y, to: rect.y + rect.h },
        cols: { from: rect.x, to: rect.x + rect.w },
      });
    } catch {
      strip = null;
    }
    if (!strip) return false;
    ctx.drawImage(strip, rect.x, rect.y);
  }
  return true;
}

/**
 * Redraw a stretched GPU frame at full size, a band of rows per animation frame sized to the
 * budget, so the page keeps answering the pointer while a deep picture sharpens.
 */
function sharpenGpuFrame(key, dest, shared) {
  refine.key = key;
  let y = 0;
  const band = () => {
    refine.raf = 0;
    if (refine.key !== key || state.gpuKey !== key || state.running || state.autoZoom) return;
    if (canvas.width !== dest.width || canvas.height !== dest.height) {
      refine.key = "";
      return;
    }
    const perRow = Number.isFinite(gpuClock.cost) ? (gpuClock.cost * shared.cap * dest.width) / 1e6 : 0;
    // Thin strips leave a GPU mostly idle, so a band is never under a sixteenth of the frame.
    const least = Math.ceil(dest.height / BAND_SHARE);
    const rows = perRow > 0 ? Math.max(least, Math.floor(BAND_BUDGET_MS / perRow)) : dest.height;
    const to = Math.min(dest.height, y + rows);
    let sheet = null;
    try {
      sheet = paintGpuEscape({ ...shared, width: dest.width, height: dest.height, rows: { from: y, to } });
    } catch {
      sheet = null;
    }
    if (!sheet) {
      refine.key = "";
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(sheet, 0, 0, dest.width, to - y, 0, y, dest.width, to - y);
    y = to;
    if (y < dest.height) {
      refine.raf = requestAnimationFrame(band);
      return;
    }
    state.gpuShare = 1;
    refine.key = "";
  };
  refine.raf = requestAnimationFrame(band);
}

/**
 * A quick plate is the moving raster and marks itself a draft, so the sharp picture follows once it
 * is on screen. Stopping a deep dive takes this road: the full raster there runs for many seconds.
 */
function scheduleEscape(quick = false) {
  if (state.autoZoom) return;
  const targetView = pictureView() || state.view;
  if (!targetView) return;
  if (paintGpuFrame(targetView, viewBox(), true)) return;
  const epoch = state.epoch;
  const fractalAt = state.fractalId;
  state.exploreToken += 1;
  state.cursorRedraw = Boolean(state.cursorParam);
  const box = viewBox();
  const aspect = box.width / Math.max(1, box.height);
  let target = { ...targetView };
  let longEdge = quick ? DRAW_RASTER_EDGE : 0;
  let cap = exploredLevel();
  if (viewIsMoving() && state.home) {
    const dest = glideDestination(targetView);
    const cover = coverViews([dest, targetView], aspect);
    target = { ...cover, flipY: Boolean(targetView.flipY) };
    const homeScale = usingReactiveFrame() ? 3.2 : state.home.scale;
    cap = escapeIterationCap(state.fractalId, state.baseDepth || depthValue(), homeScale / Math.max(1e-12, target.scale));
  }
  const raster = viewIsMoving() && !quick
    ? zoomRaster(box.width, box.height, box.dpr)
    : rasterSize(box.width, box.height, box.dpr, true, longEdge);
  const job = renderJob(target);
  const task = renderEscape({
    fractalId: job.fractalId,
    preset: job.preset,
    width: raster.width,
    height: raster.height,
    cap,
    paletteId: state.paletteId,
    view: target,
  });
  state.flightJob = task.jobId;
  state.flightView = plateFrame(target, raster.width, raster.height);
  task.then((result) => {
    if (state.flightJob === result?.jobId) {
      state.flightJob = 0;
      state.flightView = null;
    }
    if (!result || result.dropped) {
      if (viewIsMoving() && state.flightJob === 0) requestDetail(false);
      return;
    }
    if (state.epoch !== epoch || state.fractalId !== fractalAt || state.autoZoom) return;
    if (result.jobId < newestBand || result.jobId <= state.shownJob) return;
    const adopted = applyEscapeResult(result);
    if (state.plate) state.plate.draft = adopted && longEdge > 0;
    state.cursorDirty = false;
    requestDetail(glide.factor === 1 && glide.panX === 0 && glide.panY === 0);
  }).catch(() => {
    state.exploring = false;
  });
}

function recolorPlate(result, width, height) {
  const window = paletteRange(result.fractalId, result.preset, width, height, result.cap);
  return paintEscape(
    state.paletteId,
    result.iterations,
    result.basins,
    width,
    height,
    result.cap,
    height,
    result.cap,
    window.floor,
    window.top,
  );
}

function applyEscapeResult(result) {
  const width = result.width;
  const height = result.height;
  newestBand = Math.max(newestBand, result.jobId);
  state.shownJob = result.jobId;
  state.raster = { width, height };
  state.iterations = result.iterations;
  state.basins = result.basins;
  state.nextRow = height;
  state.revealIter = result.cap;
  state.shownCap = result.cap;
  state.samples = result.iterations.length;
  state.exploring = false;
  state.finished = true;
  state.cursorRedraw = false;
  const pixels = result.paletteId === state.paletteId
    ? result.pixels
    : recolorPlate(result, width, height);
  const current = pictureView();
  const box = viewBox();
  const aspect = box.width / Math.max(1, box.height);
  const finished = plateFrame(result.view, width, height);
  if (
    current
    && state.plate
    && !plateCovers(finished, current, aspect, COVER_SLACK)
    && plateCovers(state.plate, current, aspect)
  ) {
    return false;
  }
  const plate = document.createElement("canvas");
  plate.width = width;
  plate.height = height;
  plate.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
  state.gpu = false;
  state.gpuHold = false;
  state.gpuPan = null;
  dropGpuWarp();
  state.plate = { canvas: plate, ...finished };
  if (current && viewMoved(finished, current, 0.004)) blitPlate();
  else {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(plate, 0, 0);
  }
  renderChrome();
  return true;
}

/** Rows per strip when pixels are copied in on the main thread, about a megabyte at a time. */
const STRIP_BYTES = 1 << 20;

/**
 * Finished pixels become a canvas in short strips, one task each, when a worker could not make a bitmap.
 */
function installPixels(pixels, width, height, done) {
  const snap = document.createElement("canvas");
  snap.width = width;
  snap.height = height;
  const context = snap.getContext("2d");
  const strip = Math.max(1, Math.floor(STRIP_BYTES / (width * 4)));
  let y = 0;
  const step = () => {
    const rows = Math.min(strip, height - y);
    const start = y * width * 4;
    const slice = new Uint8ClampedArray(pixels.subarray(start, start + rows * width * 4));
    context.putImageData(new ImageData(slice, width, rows), 0, y);
    y += rows;
    if (y < height) setTimeout(step, 0);
    else done(snap);
  };
  setTimeout(step, 0);
}

function haltAutoZoom() {
  state.autoZoom = false;
  state.autoHold = false;
  state.autoPath = null;
  state.autoStart = null;
  state.autoFade = null;
  state.autoPlates = [];
  state.autoDeep = null;
  state.autoToken += 1;
  state.plateFlight = 0;
  state.frozenParam = null;
  state.zoomJob = null;
  state.zoomShare = 1;
  state.zoomTook = 32;
  state.zoomExpect = 32;
  state.zoomSerial += 1;
  state.zoomMisses = 0;
  state.zoomGpuOk = true;
}

function stopAutoZoom() {
  const was = state.autoZoom;
  haltAutoZoom();
  if (was && state.finished && state.home && state.view) scheduleEscape(true);
  renderChrome();
}

function freezeCursor() {
  if (!state.cursorParam) return null;
  if (state.fractalId === "julia" || state.fractalId === "burning") {
    return { x: state.cursorParam.x, y: state.cursorParam.y };
  }
  if (state.fractalId === "newton") return { px: state.cursorParam.px, py: state.cursorParam.py };
  return null;
}

/** The picture on screen becomes the first plate, so the glide starts from exactly what is shown. */
function capturePlate(view) {
  if (!canvas.width || !canvas.height || !view) return null;
  const snap = document.createElement("canvas");
  snap.width = canvas.width;
  snap.height = canvas.height;
  snap.getContext("2d").drawImage(canvas, 0, 0);
  return {
    canvas: snap,
    view: { ...view, width: snap.width, height: snap.height },
    born: -Infinity,
  };
}

function startAutoZoom() {
  if (!state.finished || state.running || !state.home || !state.view || !canAutoZoom()) return;
  const hoveringMandelbrot = state.fractalId === "mandelbrot" && state.cursorParam;
  cancelGlide();
  state.frozenParam = freezeCursor();
  state.cursorParam = null;
  state.cursorDirty = false;
  state.cursorRedraw = false;
  state.plateFlight = 0;
  const drawn = Boolean(hoveringMandelbrot) && paintGpuFrame(state.view, viewBox());
  state.autoHold = Boolean(hoveringMandelbrot) && !drawn;
  const first = state.autoHold ? null : capturePlate(state.view);
  state.autoPlates = first ? [first] : [];
  state.autoStart = first;
  state.autoDeep = null;
  state.autoZoom = true;
  const job = renderJob(state.view);
  state.autoPath = autoZoomPath(state.view, autoZoomTarget(job.fractalId, job.preset), autoZoomFloor(job.fractalId, job.preset));
  state.autoOctave = 0;
  state.autoFade = null;
  state.plateEdge = Math.min(PLATE_EDGE_MAX, plateRasterEdge(escapeIterationCap(state.fractalId, state.baseDepth || depthValue(), 1)));
  state.plateTook = 0;
  state.exploring = false;
  state.zoomStamp = performance.now();
  const token = ++state.autoToken;
  state.exploreToken += 1;
  const tick = () => {
    if (!state.autoZoom || token !== state.autoToken) return;
    stepAutoZoom(token);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  renderChrome();
}

const AUTO_FADE_MS = 1400;

let plateSerial = 1;

/**
 * One frame of deep zoom. Magnification grows by 3 percent, and only by that one step, so a
 * late refresh does not skip ahead. The picture already on screen is what moves. A new frame
 * is only copied in once the GPU has finished it, so a slow render never holds the dive.
 * Passing the deepest point fades back to the opening picture and the dive continues.
 */
function stepAutoZoom(token) {
  const now = performance.now();
  const gap = Math.max(0, now - (state.zoomStamp || now));
  if (gap > 0 && gap < 250) state.zoomFrameMs = gap;
  state.zoomStamp = now;
  const path = state.autoPath;
  if (path && !state.autoHold && state.autoPlates.length) {
    const next = advanceAutoZoom(path, state.autoOctave, 1);
    state.autoOctave = next.octave;
    if (next.done && !state.autoFade && state.autoStart) beginAutoFade();
    if (state.autoFade) {
      state.autoFade.t = Math.min(1, state.autoFade.t + 16.7 / AUTO_FADE_MS);
      if (state.autoFade.t >= 1) {
        state.autoFade = null;
        state.autoDeep = null;
      }
    }
    state.zoomStamp = now;
    state.view = autoZoomView(state.autoPath, state.autoOctave);
  }
  const box = viewBox();
  ensureAutoPlate(token, box);
  if (!state.autoHold && state.autoPlates.length) drawAutoFrame(box, now);
  renderAutoChrome();
}

function beginAutoFade() {
  const path = state.autoPath;
  state.autoDeep = state.autoPlates;
  state.autoPlates = [state.autoStart];
  state.autoOctave -= path.maxOctave;
  state.autoFade = { t: 0 };
}

/** Octaves the view is expected to travel before the plate now being requested is ready. */
function plateLookahead() {
  const path = state.autoPath;
  if (!path) return 0;
  const seconds = Math.max(0.05, Math.min(1.2, (state.zoomExpect || state.zoomTook || 40) / 1000));
  const frameMs = Math.min(50, Math.max(8, state.zoomFrameMs || 16.7));
  const frames = Math.max(1, (seconds * 1000) / frameMs);
  const next = advanceAutoZoom(path, state.autoOctave, frames);
  return Math.min(2, Math.max(0.05, next.octave - (Number(state.autoOctave) || 0)));
}

function ensureAutoPlate(token, box) {
  if (state.plateFlight || !state.autoPath) return;
  const screenHeight = motionRaster(box).height;
  const aheadView = autoZoomView(state.autoPath, state.autoOctave + 0.4);
  if (state.zoomGpuOk !== false && gpuDepthMode(state.view, screenHeight) && gpuDepthMode(aheadView, screenHeight)) return;
  const aspect = box.width / Math.max(1, box.height);
  const path = state.autoPath;
  const from = state.autoOctave;
  const to = from + plateLookahead();
  const samples = [];
  for (let i = 0; i <= 4; i += 1) samples.push(autoZoomView(path, from + ((to - from) * i) / 4));
  const cover = coverViews(samples, aspect, plateMargin(from));
  const deepest = samples[samples.length - 1].scale;
  const cap = escapeIterationCap(state.fractalId, state.baseDepth || depthValue(), (state.home?.scale || deepest) / deepest);
  const edge = Math.min(state.plateEdge || plateRasterEdge(cap), PLATE_EDGE_MAX);
  const raster = rasterSize(box.width, box.height, box.dpr, true, edge);
  const view = { ...cover, flipY: Boolean(path.start.flipY) };
  const job = renderJob(view);
  const flightId = plateSerial++;
  const epoch = state.epoch;
  const fractalAt = state.fractalId;
  const requested = performance.now();
  state.plateFlight = flightId;
  renderEscape({
    fractalId: job.fractalId,
    preset: job.preset,
    width: raster.width,
    height: raster.height,
    cap,
    paletteId: state.paletteId,
    view,
    bitmap: true,
  }).then((result) => {
    if (state.plateFlight === flightId) state.plateFlight = 0;
    if (!result || result.dropped) return;
    if (!state.autoZoom || token !== state.autoToken || state.epoch !== epoch) return;
    if (state.fractalId !== fractalAt) return;
    state.plateTook = performance.now() - requested;
    state.plateEdge = plateBudget(edge, state.plateTook, PLATE_EDGE_MAX);
    adoptAutoPlate(result, token);
    if (state.autoZoom && token === state.autoToken) {
      ensureAutoPlate(token, viewBox());
    }
  }).catch(() => {
    if (state.plateFlight === flightId) state.plateFlight = 0;
  });
}

const AUTO_PLATES_KEPT = 4;

function adoptAutoPlate(result, token) {
  if (!state.autoZoom || token !== state.autoToken || !result.view) return;
  const place = (snap) => {
    if (!state.autoZoom || token !== state.autoToken || result.jobId < state.shownJob) return;
    const box = viewBox();
    const aspect = box.width / Math.max(1, box.height);
    const finished = plateFrame(result.view, result.width, result.height);
    if (!plateCovers(finished, state.view, aspect, COVER_SLACK)) return;
    state.shownJob = result.jobId;
    const plate = { canvas: snap, view: finished, born: performance.now() };
    const plates = state.autoPlates.filter((item) => item.view.scale > finished.scale);
    plates.push(plate);
    while (plates.length > AUTO_PLATES_KEPT) {
      const index = plates[0] === state.autoStart ? 1 : 0;
      plates.splice(index, 1);
    }
    state.autoPlates = plates;
    if (!state.autoStart) state.autoStart = plate;
    state.autoHold = false;
    state.samples = result.width * result.height;
    state.shownCap = result.cap;
    state.finished = true;
    state.exploring = false;
    state.plate = { canvas: snap, ...finished, width: snap.width, height: snap.height };
  };
  if (result.bitmap) place(result.bitmap);
  else if (result.pixels) installPixels(result.pixels, result.width, result.height, place);
}


function drawEscapePlate(source, plate, view, width, height) {
  const blit = escapeSourceBlit(plate, view, width, height);
  if (!blit) return;
  ctx.drawImage(source, blit.sx, blit.sy, blit.sw, blit.sh, blit.dx, blit.dy, blit.dw, blit.dh);
}

function motionRaster(box) {
  return zoomRaster(box.width, box.height, box.dpr, gpuDrawLimit());
}

/**
 * Draw one layer of plates for a camera. The finest plate that covers the frame is used, blended in
 * over the plate beneath it while it is new. When no plate covers the whole frame every plate that
 * touches it is drawn, widest first, so the paper never shows through.
 */
function drawPlateLayer(plates, view, width, height, aspect, alpha, now) {
  const index = pickPlate(plates, view, aspect);
  if (index < 0) {
    ctx.globalAlpha = alpha;
    for (const plate of plates) drawEscapePlate(plate.canvas, plate.view, view, width, height);
    return;
  }
  const top = plates[index];
  const age = now - top.born;
  const blend = age < PLATE_BLEND_MS && index > 0 ? age / PLATE_BLEND_MS : 1;
  if (blend < 1) {
    ctx.globalAlpha = alpha;
    drawEscapePlate(plates[index - 1].canvas, plates[index - 1].view, view, width, height);
    ctx.globalAlpha = alpha * blend * blend * (3 - 2 * blend);
  } else {
    ctx.globalAlpha = alpha;
  }
  drawEscapePlate(top.canvas, top.view, view, width, height);
}

function drawAutoFrame(box, now) {
  const aspectNow = box.width / Math.max(1, box.height);
  const covered = pickPlate(state.autoPlates, state.view, aspectNow) >= 0 || Boolean(state.autoFade && state.autoDeep);
  if (state.gpuHold && !covered) {
    queueGpuZoom(box);
    return;
  }
  state.gpuHold = false;
  const dest = displayRaster(box);
  const width = dest.width;
  const height = dest.height;
  const aspect = box.width / Math.max(1, box.height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  const fade = state.autoFade;
  if (fade && state.autoDeep) {
    const deepView = autoZoomView(state.autoPath, state.autoOctave + state.autoPath.maxOctave);
    drawPlateLayer(state.autoDeep, deepView, width, height, aspect, 1, now);
    const t = fade.t;
    drawPlateLayer(state.autoPlates, state.view, width, height, aspect, t * t * (3 - 2 * t), now);
  } else {
    drawPlateLayer(state.autoPlates, state.view, width, height, aspect, 1, now);
  }
  ctx.globalAlpha = 1;
  queueGpuZoom(box);
}

/** Device pixels of the frame, capped by what the GPU can allocate. */
function displayRaster(box) {
  const ratio = Math.min(Math.max(Number(box.dpr) || 1, 1), 2);
  let width = Math.max(1, Math.floor(Math.max(0, box.width) * ratio));
  let height = Math.max(1, Math.floor(Math.max(0, box.height) * ratio));
  const limit = gpuDrawLimit();
  const edge = Math.max(width, height);
  if (limit && edge > limit) {
    const fit = limit / edge;
    width = Math.max(1, Math.floor(width * fit));
    height = Math.max(1, Math.floor(height * fit));
  }
  return { width, height };
}

function zoomJobSize(box) {
  const full = displayRaster(box);
  const share = Math.min(1, Math.max(MOTION_SCALE_MIN, state.zoomShare || 1));
  return {
    width: Math.max(1, Math.round(full.width * share)),
    height: Math.max(1, Math.round(full.height * share)),
  };
}

function retirePlate(plate) {
  if (!plate || plate === state.autoStart) return;
  if (typeof plate.canvas?.close === "function") plate.canvas.close();
}

let zoomWorker = null;

function zoomGpuWorker() {
  if (zoomWorker) return zoomWorker;
  if (state.zoomGpuOk === false || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    state.zoomGpuOk = false;
    return null;
  }
  try {
    const canvas = new OffscreenCanvas(64, 64);
    const worker = new Worker(new URL("./zoom-gpu-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = onZoomGpuFrame;
    worker.onerror = () => {
      state.zoomJob = null;
      state.zoomGpuOk = false;
      if (zoomWorker) {
        zoomWorker.terminate();
        zoomWorker = null;
      }
    };
    worker.postMessage({ type: "init", canvas }, [canvas]);
    zoomWorker = worker;
    return worker;
  } catch {
    zoomWorker = null;
    state.zoomGpuOk = false;
    return null;
  }
}

/** A sharp frame finished off the page thread. The picture already moving is what it replaces. */
function onZoomGpuFrame(event) {
  const message = event.data;
  const job = state.zoomJob;
  if (!job || message?.id !== job.id || !state.autoZoom) {
    message?.bitmap?.close?.();
    return;
  }
  state.zoomJob = null;
  if (!message.bitmap || message.failed) {
    state.zoomMisses = (state.zoomMisses || 0) + 1;
    if (state.zoomMisses >= 2) state.zoomGpuOk = false;
    return;
  }
  state.zoomMisses = 0;
  const took = Number(message.ms);
  const wall = Number(message.wall);
  const previous = state.zoomShare || 1;
  state.zoomTook = took > 0 ? took : state.zoomTook;
  state.zoomShare = zoomShareNext(previous, state.zoomTook, ZOOM_PLATE_MS);
  const ratio = previous > 0 ? state.zoomShare / previous : 1;
  const elapsed = wall > 0 ? wall : state.zoomTook;
  state.zoomExpect = Math.max(8, elapsed * ratio * ratio);
  placeAutoPlate(message.bitmap, job.view, job.cap);
}

/** Ask the worker for the next sharp picture, covering the zoom it will take to arrive. */
function queueGpuZoom(box) {
  if (state.zoomJob || !state.autoPath || !state.view || !state.home || state.zoomGpuOk === false) return;
  const worker = zoomGpuWorker();
  if (!worker) return;
  const screen = displayRaster(box);
  const ahead = state.autoOctave + plateLookahead();
  const aheadView = autoZoomView(state.autoPath, ahead);
  if (!gpuDepthMode(state.view, screen.height) || !gpuDepthMode(aheadView, screen.height)) return;
  const aspect = box.width / Math.max(1, box.height);
  const from = state.autoOctave;
  const samples = [];
  for (let i = 0; i <= 4; i += 1) samples.push(autoZoomView(state.autoPath, from + ((ahead - from) * i) / 4));
  const cover = { ...coverViews(samples, aspect, plateMargin(from)), flipY: Boolean(state.autoPath.start.flipY) };
  const raster = zoomJobSize(box);
  const cap = escapeIterationCap(
    state.fractalId,
    state.baseDepth || depthValue(),
    state.home.scale / Math.max(1e-300, samples[samples.length - 1].scale),
  );
  const depth = gpuDepthMode(cover, raster.height);
  if (!depth || (depth !== "deep" && cap > GPU_ITER_LIMIT)) return;
  const job = renderJob(cover);
  let paint = null;
  try {
    const fit = gpuPaletteWindow(job, raster.width, raster.height, cap, true);
    paint = {
      fractalId: job.fractalId,
      preset: job.preset,
      width: raster.width,
      height: raster.height,
      cap,
      paletteId: state.paletteId,
      depth,
      floor: fit.floor,
      top: fit.top,
    };
  } catch {
    paint = null;
  }
  if (!paint) return;
  const id = ++state.zoomSerial;
  state.zoomJob = { id, view: cover, width: raster.width, height: raster.height, cap };
  try {
    worker.postMessage({ type: "render", id, paint });
  } catch {
    state.zoomJob = null;
  }
}

function placeAutoPlate(snap, view, cap) {
  const box = viewBox();
  const aspect = box.width / Math.max(1, box.height);
  const finished = plateFrame(view, snap.width, snap.height);
  const plate = { canvas: snap, view: finished, born: performance.now(), pooled: true };
  if (!plateCovers(finished, state.view, aspect, COVER_SLACK)) {
    retirePlate(plate);
    return;
  }
  const kept = [];
  for (const item of state.autoPlates) {
    if (item === state.autoStart || item.view.scale > finished.scale) kept.push(item);
    else retirePlate(item);
  }
  kept.push(plate);
  while (kept.length > AUTO_PLATES_KEPT) {
    const index = kept[0] === state.autoStart ? 1 : 0;
    if (kept[index]) retirePlate(kept[index]);
    kept.splice(index, 1);
  }
  state.autoPlates = kept;
  if (!state.autoStart) state.autoStart = plate;
  state.autoHold = false;
  state.samples = snap.width * snap.height;
  state.shownCap = cap;
  state.finished = true;
  state.exploring = false;
}

/** The parts of the page that change every frame of auto zoom, written only when their text changes. */
function renderAutoChrome() {
  const mag = formatMag(currentMagnification());
  if (depthStat.textContent !== mag) depthStat.textContent = mag;
  const badge = autoZoomBadge();
  if (paramEl.textContent !== badge) {
    paramEl.hidden = false;
    paramEl.textContent = badge;
  }
  const samples = state.samples.toLocaleString();
  if (samplesEl.textContent !== samples) samplesEl.textContent = samples;
}


const pointers = new Map();

function pointerDistance(points) {
  const [a, b] = points;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onReactivePointer(point) {
  const box = viewBox();
  if (state.autoZoom) return;
  if (state.fractalId === "mandelbrot" && !state.reactiveView) {
    state.reactiveView = { centerX: 0, centerY: 0, scale: 3.2, flipY: false };
  }
  state.cursorParam = state.fractalId === "newton"
    ? newtonCursor(point.x, point.y, box.width, box.height)
    : cursorParameter(point.x, point.y, box.width, box.height);
  state.cursorDirty = true;
  renderChrome();
  if (state.finished && !state.running) scheduleEscape();
}

canvas.addEventListener("pointerdown", (event) => {
  if (isReactive() && state.finished && !state.running) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic event cannot capture the pointer. Move events still update the picture.
    }
    onReactivePointer(localPoint(event));
    event.preventDefault();
    return;
  }
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
  if (isReactive() && state.finished && !state.running) {
    onReactivePointer(localPoint(event));
    return;
  }
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
canvas.addEventListener("pointerleave", () => {
  if (state.autoZoom || !isReactive() || !state.finished || state.running) return;
  state.cursorParam = null;
  state.cursorDirty = false;
  scheduleEscape();
});
canvas.addEventListener("dblclick", (event) => {
  if (!canExplore()) return;
  const point = localPoint(event);
  queueZoom(point.x, point.y, 2);
});
canvas.addEventListener("wheel", (event) => {
  if (state.autoZoom) {
    event.preventDefault();
    return;
  }
  if (!canExplore()) return;
  event.preventDefault();
  const point = localPoint(event);
  glide.movedAt = performance.now();
  if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    glide.factor *= wheelZoomFactor(event.deltaY, event.deltaMode);
    glide.px = point.x;
    glide.py = point.y;
    startGlide();
    return;
  }
  const mode = event.deltaMode | 0;
  const scale = mode === 1 ? 32 : mode === 2 ? 800 : 1;
  glide.panX += -event.deltaX * scale;
  glide.panY += -event.deltaY * scale;
  startGlide();
}, { passive: false });

zoomInButton.addEventListener("click", () => {
  const box = viewBox();
  queueZoom(box.width / 2, box.height / 2, 2);
});
zoomOutButton.addEventListener("click", () => {
  const box = viewBox();
  queueZoom(box.width / 2, box.height / 2, 0.5);
});
zoomResetButton.addEventListener("click", resetExplore);
autoZoomButton.addEventListener("click", () => {
  if (state.autoZoom) stopAutoZoom();
  else startAutoZoom();
});

modeBadge.addEventListener("click", () => {
  state.reactive = !state.reactive;
  if (!state.reactive) {
    state.cursorParam = null;
    state.cursorDirty = false;
    state.cursorRedraw = false;
    state.reactiveView = null;
    if (state.finished && !state.running && !state.autoZoom) scheduleEscape();
  }
  renderChrome();
});

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
  if (state.gpu && canExplore() && currentFractal().kind === "escape") scheduleEscape();
  else paint();
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
variationButton.addEventListener("click", () => {
  const open = variationButton.getAttribute("aria-expanded") !== "true";
  setVariationMenu(open);
  if (open) presets.querySelector('[aria-checked="true"]')?.focus();
});
variationButton.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  setVariationMenu(true);
  presets.querySelector("button")?.focus();
});
presets.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.presetId = button.dataset.preset || currentFractal().presets[0].id;
  setVariationMenu(false);
  variationButton.focus();
  arm();
});
presets.addEventListener("keydown", (event) => {
  const items = [...presets.querySelectorAll("button")];
  const index = items.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    setVariationMenu(false);
    variationButton.focus();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const step = event.key === "ArrowDown" ? 1 : -1;
  items[(index + step + items.length) % items.length]?.focus();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".preset-menu")) setVariationMenu(false);
});
toggleButton.addEventListener("click", toggle);
stageDraw.addEventListener("click", toggle);
soundButton.addEventListener("click", () => {
  const on = soundButton.getAttribute("aria-pressed") !== "true";
  soundButton.setAttribute("aria-pressed", String(on));
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
  const raster = rasterSize(box.width, box.height, box.dpr, Boolean(state.finished && state.home));
  if (state.raster && raster.width === state.raster.width && raster.height === state.raster.height) {
    paint();
    return;
  }
  if (state.autoZoom) return;
  if (state.running) restart();
  else if (state.finished && state.home) scheduleEscape();
}).observe(canvas.parentElement);

renderPresets();
depthInput.value = String(currentFractal().defaultDepth);
arm();
