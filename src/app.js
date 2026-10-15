import {
  MAX_LENGTH,
  MAX_VALUE,
  nearlySortedArray,
  parseArrayText,
  randomArray,
  reversedArray,
} from "./arrays.js";
import { createRun, PROGRAMS } from "./algorithms.js";
import { comparisonLowerBound } from "./bounds.js";
import { draw, VIEWS } from "./views.js";

const programSelect = document.querySelector("#program");
const viewSelect = document.querySelector("#view");
const sizeInput = document.querySelector("#size");
const sizeOut = document.querySelector("#size-out");
const capInput = document.querySelector("#cap");
const capOut = document.querySelector("#cap-out");
const speedInput = document.querySelector("#speed");
const speedOut = document.querySelector("#speed-out");
const blurb = document.querySelector("#blurb");
const viewBlurb = document.querySelector("#view-blurb");
const toggleButton = document.querySelector("#toggle");
const stepButton = document.querySelector("#step");
const resetButton = document.querySelector("#reset");
const customForm = document.querySelector("#custom-form");
const customInput = document.querySelector("#custom");
const error = document.querySelector("#error");
const canvas = document.querySelector("#canvas");
const statusEl = document.querySelector("#status");
const comparisonsEl = document.querySelector("#comparisons");
const boundEl = document.querySelector("#bound");
const swapsEl = document.querySelector("#swaps");
const writesEl = document.querySelector("#writes");
const meter = document.querySelector("#meter");
const meterFill = document.querySelector("#meter-fill");
const note = document.querySelector("#note");
const presetButtons = {
  random: document.querySelector("#preset-random"),
  reversed: document.querySelector("#preset-reversed"),
  nearly: document.querySelector("#preset-nearly"),
};

const ctx = canvas.getContext("2d");

const state = {
  preset: "random",
  programId: "merge",
  viewId: "bars",
  maxValue: MAX_VALUE,
  original: [],
  generator: null,
  frame: null,
  running: false,
  finished: false,
};

sizeInput.max = String(MAX_LENGTH);
capInput.max = String(MAX_VALUE);

for (const program of PROGRAMS) {
  const option = document.createElement("option");
  option.value = program.id;
  option.textContent = `${program.name} · ${program.complexity}`;
  programSelect.append(option);
}
programSelect.value = state.programId;

for (const view of VIEWS) {
  const option = document.createElement("option");
  option.value = view.id;
  option.textContent = view.name;
  viewSelect.append(option);
}
viewSelect.value = state.viewId;

function stepsFor(speed) {
  const t = (Number(speed) - 1) / 99;
  const clamped = Math.min(1, Math.max(0, t));
  return Math.max(1, Math.round(4000 ** clamped));
}

function scaleOf(array) {
  let peak = 1;
  for (const value of array) peak = Math.max(peak, value);
  return peak;
}

function idleFrame(array) {
  return {
    array,
    maxValue: scaleOf(array),
    indices: [],
    mark: "idle",
    comparisons: 0,
    writes: 0,
    swaps: 0,
    sorted: new Set(),
    pivot: -1,
  };
}

function paint() {
  if (!state.frame) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const pixelWidth = Math.floor(width * dpr);
  const pixelHeight = Math.floor(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(state.viewId, ctx, state.frame, width, height);
}

function currentProgram() {
  return PROGRAMS.find((program) => program.id === state.programId);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function renderChrome() {
  const program = currentProgram();
  const view = VIEWS.find((item) => item.id === state.viewId);
  blurb.textContent = program.blurb;
  viewBlurb.textContent = view.blurb;
  sizeOut.value = sizeInput.value;
  capOut.value = capInput.value;
  speedOut.textContent = `${stepsFor(speedInput.value)} / frame`;

  for (const [name, button] of Object.entries(presetButtons)) {
    button.setAttribute("aria-pressed", String(state.preset === name));
  }

  if (state.running) toggleButton.textContent = "Pause";
  else if (state.generator && !state.finished) toggleButton.textContent = "Resume";
  else toggleButton.textContent = "Sort";

  if (state.running) statusEl.textContent = "Sorting";
  else if (state.finished) statusEl.textContent = "Sorted";
  else if (state.generator) statusEl.textContent = "Paused";
  else statusEl.textContent = "Ready";

  const bound = comparisonLowerBound(state.original.length);
  const comparisons = state.frame.comparisons;
  comparisonsEl.textContent = comparisons.toLocaleString();
  boundEl.textContent = bound.toLocaleString();
  swapsEl.textContent = state.frame.swaps.toLocaleString();
  writesEl.textContent = state.frame.writes.toLocaleString();

  if (!program.comparison) {
    meter.classList.remove("over");
    meterFill.style.width = "0%";
    note.textContent =
      "This program does not compare values, so the ⌈log₂(n!)⌉ lower bound does not apply. The bound is still shown for reference.";
    return;
  }

  if (bound === 0) {
    meter.classList.remove("over");
    meterFill.style.width = "0%";
    note.textContent = "One value is already in order.";
    return;
  }

  const ratio = comparisons / bound;
  meter.classList.toggle("over", ratio > 1);
  meterFill.style.width = `${Math.min(100, ratio * 100)}%`;
  if (state.finished && ratio > 1) {
    note.textContent = `${ratio.toFixed(1)}× the worst-case comparison lower bound ⌈log₂(n!)⌉.`;
  } else if (state.finished) {
    note.textContent = "Finished at or under the worst-case lower bound. Typical inputs often do.";
  } else {
    note.textContent = "The meter fills as comparisons approach ⌈log₂(n!)⌉, the worst-case lower bound.";
  }
}

function stop() {
  state.running = false;
}

function useArray(values, preset) {
  stop();
  state.preset = preset;
  state.original = values.slice();
  state.generator = null;
  state.finished = false;
  state.frame = idleFrame(state.original);
  error.textContent = "";
  paint();
  renderChrome();
}

function readSize() {
  const length = Number(sizeInput.value);
  const maxValue = Number(capInput.value);
  state.maxValue = maxValue;
  return { length, maxValue };
}

function applyPreset(preset) {
  const { length, maxValue } = readSize();
  let values;
  if (preset === "reversed") values = reversedArray(length, maxValue);
  else if (preset === "nearly") values = nearlySortedArray(length, maxValue);
  else values = randomArray(length, maxValue);
  useArray(values, preset);
}

function ensureRun() {
  if (state.finished || !state.generator) {
    state.generator = createRun(state.programId, state.original);
    state.finished = false;
    state.frame = idleFrame(state.original);
  }
}

function advance(count) {
  ensureRun();
  for (let i = 0; i < count; i += 1) {
    const next = state.generator.next();
    if (next.done) {
      state.finished = true;
      state.running = false;
      break;
    }
    state.frame = next.value;
    state.frame.maxValue = scaleOf(state.frame.array);
  }
  paint();
  renderChrome();
}

function loop() {
  if (!state.running) return;
  advance(stepsFor(speedInput.value));
  if (state.running) requestAnimationFrame(loop);
}

function toggle() {
  if (state.running) {
    stop();
    renderChrome();
    return;
  }
  ensureRun();
  state.running = true;
  renderChrome();
  requestAnimationFrame(loop);
}

programSelect.addEventListener("change", () => {
  state.programId = programSelect.value;
  stop();
  state.generator = null;
  state.finished = false;
  state.frame = idleFrame(state.original);
  paint();
  renderChrome();
});

viewSelect.addEventListener("change", () => {
  state.viewId = viewSelect.value;
  paint();
  renderChrome();
});

sizeInput.addEventListener("input", () => {
  sizeOut.value = sizeInput.value;
});
capInput.addEventListener("input", () => {
  capOut.value = capInput.value;
});
sizeOut.addEventListener("change", () => {
  sizeInput.value = String(clampNumber(sizeOut.value, 1, MAX_LENGTH));
  sizeInput.dispatchEvent(new Event("change"));
});
capOut.addEventListener("change", () => {
  capInput.value = String(clampNumber(capOut.value, 1, MAX_VALUE));
  capInput.dispatchEvent(new Event("change"));
});
speedInput.addEventListener("input", renderChrome);

sizeInput.addEventListener("change", () => applyPreset(state.preset === "custom" ? "random" : state.preset));
capInput.addEventListener("change", () => {
  state.maxValue = Number(capInput.value);
  if (state.preset === "custom") {
    state.frame = idleFrame(state.original);
    paint();
    renderChrome();
    return;
  }
  applyPreset(state.preset);
});

presetButtons.random.addEventListener("click", () => applyPreset("random"));
presetButtons.reversed.addEventListener("click", () => applyPreset("reversed"));
presetButtons.nearly.addEventListener("click", () => applyPreset("nearly"));
toggleButton.addEventListener("click", toggle);
stepButton.addEventListener("click", () => {
  stop();
  advance(1);
});
resetButton.addEventListener("click", () => {
  useArray(state.original, state.preset);
});

customForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const values = parseArrayText(customInput.value);
    sizeInput.value = String(values.length);
    const peak = values.reduce((max, value) => Math.max(max, value), 1);
    if (peak > Number(capInput.value)) capInput.value = String(peak);
    state.maxValue = Number(capInput.value);
    useArray(values, "custom");
  } catch (err) {
    error.textContent = err.message;
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target.closest("button, input, select, textarea, a")) return;
  if (event.code === "Space") {
    event.preventDefault();
    toggle();
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    stop();
    advance(1);
  }
});

new ResizeObserver(() => paint()).observe(canvas.parentElement);

applyPreset("random");
