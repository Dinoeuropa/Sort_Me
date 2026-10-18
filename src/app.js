import katex from "../vendor/katex/katex.js";
import { MAX_LENGTH, isSorted, nearlySortedArray, randomArray, reversedArray, shuffleSteps } from "./arrays.js";
import { createRun, PROGRAMS } from "./algorithms.js";
import { boundMeter, comparisonLowerBound } from "./bounds.js";
import { MAX_COMPARE, continueComparison, laneScale, startComparison, stepLanes } from "./compare.js";
import { runControlLabel } from "./session.js";
import { createSpeaker } from "./sound.js";
import { draw, quadrantFrame, usesQuadrants, VIEWS } from "./views.js";

const programSelect = document.querySelector("#program");
const viewSelect = document.querySelector("#view");
const sizeInput = document.querySelector("#size");
const sizeOut = document.querySelector("#size-out");
const speedInput = document.querySelector("#speed");
const speedOut = document.querySelector("#speed-out");
const complexityEl = document.querySelector("#complexity");
const caseLabel = document.querySelector("#case-label");
const boundFormula = document.querySelector("#bound-formula");
const blurb = document.querySelector("#blurb");
const viewBlurb = document.querySelector("#view-blurb");
const toggleButton = document.querySelector("#toggle");
const stepButton = document.querySelector("#step");
const compareButton = document.querySelector("#compare");
const dock = document.querySelector("#viz-dock");
const dockSpeed = document.querySelector("#dock-speed");
const dockToggle = document.querySelector("#dock-toggle");
const compareList = document.querySelector("#compare-list");
const soundButton = document.querySelector("#sound");
const error = document.querySelector("#error");
const canvas = document.querySelector("#canvas");
const statusEl = document.querySelector("#status");
const comparisonsEl = document.querySelector("#comparisons");
const boundEl = document.querySelector("#bound");
const swapsEl = document.querySelector("#swaps");
const writesEl = document.querySelector("#writes");
const results = document.querySelector("#results");
const stage = document.querySelector(".stage");
const readout = document.querySelector("#readout");
const meter = document.querySelector("#meter");
const meterFill = document.querySelector("#meter-fill");
const note = document.querySelector("#note");
const presetButtons = {
  random: document.querySelector("#preset-random"),
  reversed: document.querySelector("#preset-reversed"),
  nearly: document.querySelector("#preset-nearly"),
};

const ctx = canvas.getContext("2d");
const speaker = createSpeaker();
let loopId = 0;

const state = {
  preset: "random",
  programId: "merge",
  viewId: "bars",
  original: [],
  generator: null,
  frame: null,
  lanes: null,
  running: false,
  paused: false,
  finished: false,
  shuffler: null,
  shuffleEnding: false,
  shuffleResult: null,
  pendingCompare: null,
  dock: false,
};

sizeInput.max = String(MAX_LENGTH);
sizeOut.max = String(MAX_LENGTH);

for (const program of PROGRAMS) {
  const option = document.createElement("option");
  option.value = program.id;
  option.textContent = program.name;
  programSelect.append(option);

  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = program.id;
  box.checked = program.id === "merge" || program.id === "quick";
  label.append(box, document.createTextNode(program.name));
  compareList.append(label);
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

function programById(id) {
  return PROGRAMS.find((program) => program.id === id);
}

function selectedCompareIds() {
  return [...compareList.querySelectorAll("input:checked")].map((box) => box.value);
}

function paint() {
  if (!state.frame && !state.lanes) return;
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
  if (state.lanes) drawLanes(width, height);
  else draw(state.viewId, ctx, state.frame, width, height);
}

function laneFrame(lane) {
  const frame = lane.frame ?? idleFrame(state.original);
  frame.maxValue = scaleOf(frame.array);
  return frame;
}

function drawLaneLabel(name, x, y, finished) {
  ctx.font = "15px Georgia, serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const width = ctx.measureText(name).width;
  ctx.fillStyle = "rgba(23, 20, 15, 0.88)";
  ctx.fillRect(x - 6, y - 4, width + 12, 24);
  ctx.fillStyle = finished ? "#79c2a8" : "#f6efe4";
  ctx.fillText(name, x, y);
}

function drawQuadrants(width, height) {
  state.lanes.forEach((lane, index) => {
    const cell = quadrantFrame(index, width, height, state.lanes.length);
    const frame = laneFrame(lane);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    ctx.translate(cell.x, cell.y);
    draw(state.viewId, ctx, frame, cell.width, cell.height);
    ctx.restore();
    drawLaneLabel(programById(lane.id).name, cell.x + 14, cell.y + 12, lane.finished);
  });
  ctx.strokeStyle = "#3d342b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  if (state.lanes.length !== 2) {
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
  }
  ctx.stroke();
}

function drawLanes(width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#17140f";
  ctx.fillRect(0, 0, width, height);
  if (usesQuadrants(state.viewId)) {
    drawQuadrants(width, height);
    return;
  }
  const labelWidth = Math.min(132, Math.max(72, width * 0.18));
  const laneHeight = height / state.lanes.length;
  state.lanes.forEach((lane, index) => {
    const y = index * laneHeight;
    const frame = laneFrame(lane);
    ctx.save();
    ctx.beginPath();
    ctx.rect(labelWidth, y, Math.max(1, width - labelWidth), laneHeight);
    ctx.clip();
    ctx.translate(labelWidth, y);
    draw(state.viewId, ctx, frame, Math.max(1, width - labelWidth), laneHeight);
    ctx.restore();
    ctx.fillStyle = "#3d342b";
    ctx.fillRect(labelWidth, y + laneHeight - 1, width - labelWidth, 1);
  });
  ctx.font = "13px Georgia, serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  state.lanes.forEach((lane, index) => {
    const y = index * laneHeight + laneHeight / 2;
    ctx.fillStyle = lane.finished ? "#79c2a8" : "#f6efe4";
    ctx.fillText(programById(lane.id).name, 10, y);
  });
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function renderMath(element, latex) {
  if (element.dataset.latex === latex) return;
  element.dataset.latex = latex;
  katex.render(latex, element, { throwOnError: false, displayMode: false });
}

function laneStatus(lane) {
  if (state.shuffler && state.running) return "Shuffling";
  if (lane.finished) return "Sorted";
  if (state.running) return "Sorting";
  if (state.paused) return "Paused";
  return "Ready";
}

function statBox(label, className) {
  const box = document.createElement("div");
  box.className = "stat";
  const caption = document.createElement("span");
  caption.textContent = label;
  const value = document.createElement("strong");
  value.className = className;
  box.append(caption, value);
  return box;
}

function renderResults() {
  if (!state.lanes) {
    results.hidden = true;
    results.dataset.key = "";
    stage.style.removeProperty("--lane-scale");
    stage.style.removeProperty("--lane-type");
    results.replaceChildren();
    return;
  }
  const { scale, type } = laneScale(state.lanes.length);
  stage.style.setProperty("--lane-scale", String(scale));
  stage.style.setProperty("--lane-type", String(type));
  const key = state.lanes.map((lane) => lane.id).join(",");
  if (results.dataset.key !== key) {
    results.dataset.key = key;
    results.hidden = false;
    results.replaceChildren();
    for (const lane of state.lanes) {
      const program = programById(lane.id);
      const item = document.createElement("li");
      item.dataset.id = lane.id;
      item.className = "lane-card";
      const title = document.createElement("span");
      title.className = "result-name";
      const name = document.createElement("strong");
      name.textContent = program.name;
      const math = document.createElement("span");
      math.className = "math";
      katex.render(program.latex, math, { throwOnError: false, displayMode: false });
      const formula = document.createElement("span");
      formula.className = "bound-line";
      title.append(name, math, formula);
      const row = document.createElement("div");
      row.className = "readout";
      row.append(
        statBox("Status", "lane-status"),
        statBox("Comparisons", "lane-comparisons"),
        statBox("Lower bound", "lane-bound"),
        statBox("Swaps", "lane-swaps"),
        statBox("Writes", "lane-writes"),
      );
      const meterRow = document.createElement("div");
      meterRow.className = "lane-meter";
      const bar = document.createElement("div");
      bar.className = "meter";
      bar.append(document.createElement("span"));
      const caption = document.createElement("p");
      caption.className = "note";
      meterRow.append(bar, caption);
      item.append(title, row, meterRow);
      results.append(item);
    }
  }
  const bound = comparisonLowerBound(state.original.length);
  for (const lane of state.lanes) {
    const program = programById(lane.id);
    const frame = lane.frame ?? idleFrame(state.original);
    const card = results.querySelector(`li[data-id="${lane.id}"]`);
    card.querySelector(".lane-status").textContent = laneStatus(lane);
    card.querySelector(".lane-comparisons").textContent = frame.comparisons.toLocaleString();
    card.querySelector(".lane-bound").textContent = bound.toLocaleString();
    card.querySelector(".lane-swaps").textContent = frame.swaps.toLocaleString();
    card.querySelector(".lane-writes").textContent = frame.writes.toLocaleString();
    renderMath(card.querySelector(".bound-line"), "\\lceil \\log_2(n!) \\rceil");
    const meterState = boundMeter(frame.comparisons, bound, {
      comparison: program.comparison,
      finished: lane.finished,
    });
    const bar = card.querySelector(".meter");
    bar.classList.toggle("over", meterState.over);
    bar.firstElementChild.style.width = `${meterState.width}%`;
    card.querySelector(".note").textContent = meterState.note;
  }
}

function renderChrome() {
  const program = programById(state.programId);
  const view = VIEWS.find((item) => item.id === state.viewId);
  blurb.textContent = state.lanes ? "Each lane sorts the same 1…n array." : program.blurb;
  if (state.lanes) {
    complexityEl.hidden = true;
    caseLabel.textContent = "";
  } else {
    complexityEl.hidden = false;
    renderMath(complexityEl, program.latex);
    caseLabel.textContent = program.caseLabel;
  }
  viewBlurb.textContent = view.blurb;
  sizeOut.value = sizeInput.value;
  speedOut.textContent = `${stepsFor(speedInput.value)} / frame`;

  for (const [name, button] of Object.entries(presetButtons)) {
    button.setAttribute("aria-pressed", String(state.preset === name));
  }

  const control = runControlLabel(state);
  toggleButton.textContent = control;
  dockToggle.textContent = control;
  dock.hidden = !state.dock;
  dockSpeed.value = speedInput.value;

  if (state.shuffler && state.running) statusEl.textContent = "Shuffling";
  else if (state.running) statusEl.textContent = state.lanes ? "Comparing" : "Sorting";
  else if (state.finished) statusEl.textContent = state.lanes ? "Compared" : "Sorted";
  else if (state.paused) statusEl.textContent = "Paused";
  else statusEl.textContent = "Ready";

  const comparing = Boolean(state.lanes);
  readout.hidden = comparing;
  boundFormula.hidden = comparing;
  meter.hidden = comparing;
  note.hidden = comparing;

  const bound = comparisonLowerBound(state.original.length);
  boundEl.textContent = bound.toLocaleString();
  const frame = state.frame ?? idleFrame(state.original);
  comparisonsEl.textContent = comparing ? "—" : frame.comparisons.toLocaleString();
  swapsEl.textContent = comparing ? "—" : frame.swaps.toLocaleString();
  writesEl.textContent = comparing ? "—" : frame.writes.toLocaleString();
  renderResults();
  if (comparing) return;

  const meterState = boundMeter(frame.comparisons, bound, {
    comparison: program.comparison,
    finished: state.finished,
  });
  meter.classList.toggle("over", meterState.over);
  meterFill.style.width = `${meterState.width}%`;
  note.textContent = meterState.note;
}

function stop() {
  state.running = false;
  loopId += 1;
}

function clearRun() {
  state.generator = null;
  state.lanes = null;
  state.finished = false;
  state.running = false;
  state.paused = false;
  state.shuffler = null;
  state.shuffleEnding = false;
  state.shuffleResult = null;
  state.pendingCompare = null;
  state.dock = false;
  loopId += 1;
}

function shownValues() {
  if (state.lanes) {
    const lane = state.lanes.find((item) => item.frame?.array);
    if (lane) return lane.frame.array;
  }
  if (state.frame?.array) return state.frame.array;
  return state.original;
}

function revealVisualization() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  document.querySelector(".canvas-frame")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function shufflePace(length) {
  return Math.max(1, Math.ceil(Math.max(1, length - 1) / 28));
}

function showShuffle(frame) {
  if (state.lanes) {
    for (const lane of state.lanes) lane.frame = frame;
  } else {
    state.frame = frame;
  }
}

function beginReshuffle() {
  const values = shownValues().slice();
  state.pendingCompare = state.lanes ? state.lanes.map((lane) => lane.id) : null;
  state.generator = null;
  state.finished = false;
  state.shuffler = shuffleSteps(values);
  if (state.lanes) {
    for (const lane of state.lanes) lane.finished = false;
  }
  startLoop();
}

function finishReshuffle(values) {
  const nextValues = isSorted(values) ? randomArray(values.length) : values.slice();
  const ids = state.pendingCompare;
  state.shuffler = null;
  state.pendingCompare = null;
  state.original = nextValues;
  state.finished = false;
  if (ids && ids.length >= 2) {
    state.lanes = startComparison(ids, nextValues);
    state.frame = null;
    return;
  }
  state.lanes = null;
  state.generator = createRun(state.programId, nextValues);
  state.frame = idleFrame(nextValues);
}

function useArray(values, preset) {
  const compareIds = state.lanes ? state.lanes.map((lane) => lane.id) : null;
  const wasRunning = state.running;
  clearRun();
  state.preset = preset;
  state.original = values.slice();
  error.textContent = "";
  if (compareIds && compareIds.length >= 2 && compareIds.length <= MAX_COMPARE) {
    state.lanes = continueComparison(
      compareIds.map((id) => ({ id })),
      state.original,
    );
    state.frame = null;
  } else {
    state.frame = idleFrame(state.original);
  }
  paint();
  if (state.lanes && wasRunning) startLoop();
  renderChrome();
}

function applyPreset(preset) {
  const length = Number(sizeInput.value);
  let values;
  if (preset === "reversed") values = reversedArray(length);
  else if (preset === "nearly") values = nearlySortedArray(length);
  else values = randomArray(length);
  useArray(values, preset);
}

function ensureRun() {
  if (state.lanes) return;
  if (state.finished || !state.generator) {
    state.generator = createRun(state.programId, state.original);
    state.finished = false;
    state.frame = idleFrame(state.original);
  }
}

function hear(frame, limit) {
  if (!frame) return;
  speaker.play(frame, limit);
}

function settled(frame) {
  if (!frame) return frame;
  return { ...frame, indices: [], mark: "sorted", pivot: -1 };
}

function advance(count) {
  if (state.shuffler) {
    const pace = shufflePace(shownValues().length);
    let last = null;
    let done = false;
    for (let i = 0; i < pace; i += 1) {
      const next = state.shuffler.next();
      if (next.done) {
        done = true;
        break;
      }
      last = next.value;
    }
    if (last) {
      showShuffle(last);
      hear(last, 1);
    }
    if (done) {
      state.shuffleResult = (last ? last.array : shownValues()).slice();
      state.shuffler = null;
      state.shuffleEnding = true;
    }
    paint();
    renderChrome();
    return;
  }
  if (state.shuffleEnding) {
    finishReshuffle(state.shuffleResult ?? shownValues());
    state.shuffleEnding = false;
    state.shuffleResult = null;
  }
  const wasFinished = state.finished;
  if (state.lanes) {
    const done = stepLanes(state.lanes, count);
    if (done) {
      state.finished = true;
      state.running = false;
      state.paused = false;
    }
    if (!wasFinished) {
      for (const lane of state.lanes) hear(lane.frame, 1);
      if (state.finished) {
        const finished = state.lanes.find((lane) => lane.frame);
        if (finished) speaker.playSweep(finished.frame.array, scaleOf(finished.frame.array));
      }
    }
    for (const lane of state.lanes) {
      if (lane.finished) lane.frame = settled(lane.frame);
    }
    paint();
    renderChrome();
    return;
  }
  ensureRun();
  for (let i = 0; i < count; i += 1) {
    const next = state.generator.next();
    if (next.done) {
      state.finished = true;
      state.running = false;
      state.paused = false;
      break;
    }
    state.frame = next.value;
    state.frame.maxValue = scaleOf(state.frame.array);
  }
  if (state.finished && !wasFinished) {
    speaker.playSweep(state.frame.array, state.frame.maxValue);
    state.frame = settled(state.frame);
  } else hear(state.frame, 2);
  paint();
  renderChrome();
}

function startLoop() {
  const id = ++loopId;
  state.running = true;
  const tick = () => {
    if (!state.running || id !== loopId) return;
    advance(stepsFor(speedInput.value));
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
  state.paused = false;
  state.dock = true;
  revealVisualization();
  if (state.shuffler || state.shuffleEnding) startLoop();
  else if (isSorted(shownValues()) && shownValues().length > 1) beginReshuffle();
  else {
    if (!state.lanes) ensureRun();
    startLoop();
  }
  renderChrome();
}

function syncCompareBoxes() {
  const boxes = [...compareList.querySelectorAll("input")];
  const checked = boxes.filter((box) => box.checked);
  if (checked.length > MAX_COMPARE) {
    checked.slice(MAX_COMPARE).forEach((box) => {
      box.checked = false;
    });
    error.textContent = "Compare at most four sorting programs.";
  }
  const full = boxes.filter((box) => box.checked).length >= MAX_COMPARE;
  for (const box of boxes) box.disabled = full && !box.checked;
}

function beginCompare() {
  const ids = selectedCompareIds();
  if (ids.length < 2) {
    error.textContent = "Pick at least two sorting programs.";
    return;
  }
  if (ids.length > MAX_COMPARE) {
    error.textContent = "Compare at most four sorting programs.";
    return;
  }
  stop();
  state.paused = false;
  state.shuffler = null;
  state.shuffleEnding = false;
  state.shuffleResult = null;
  state.pendingCompare = null;
  state.generator = null;
  state.finished = false;
  state.lanes = startComparison(ids, state.original);
  state.frame = null;
  error.textContent = "";
  paint();
  renderChrome();
}

programSelect.addEventListener("change", () => {
  state.programId = programSelect.value;
  clearRun();
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
sizeOut.addEventListener("change", () => {
  sizeInput.value = String(clampNumber(sizeOut.value, 1, MAX_LENGTH));
  sizeInput.dispatchEvent(new Event("change"));
});
speedInput.addEventListener("input", () => {
  dockSpeed.value = speedInput.value;
  renderChrome();
});
dockSpeed.addEventListener("input", () => {
  speedInput.value = dockSpeed.value;
  renderChrome();
});
dockToggle.addEventListener("click", toggle);
sizeInput.addEventListener("change", () => applyPreset(state.preset));

presetButtons.random.addEventListener("click", () => applyPreset("random"));
presetButtons.reversed.addEventListener("click", () => applyPreset("reversed"));
presetButtons.nearly.addEventListener("click", () => applyPreset("nearly"));
toggleButton.addEventListener("click", toggle);
compareButton.addEventListener("click", beginCompare);
compareList.addEventListener("change", syncCompareBoxes);
soundButton.addEventListener("click", () => {
  const on = soundButton.getAttribute("aria-pressed") !== "true";
  soundButton.setAttribute("aria-pressed", String(on));
  soundButton.textContent = on ? "Sound on" : "Sound";
  speaker.setEnabled(on);
});
stepButton.addEventListener("click", () => {
  stop();
  advance(1);
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

renderMath(boundFormula, "\\lceil \\log_2(n!) \\rceil");
applyPreset("random");
