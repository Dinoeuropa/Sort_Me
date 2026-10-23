import { escapeBand } from "./fractals.js";
import {
  FADE_MS,
  SCENES,
  fractalCamera,
  frameIndex,
  sceneAt,
  screensaverSize,
  showMode,
  sortFrames,
} from "./home-show.js";
import { paintEscape } from "./palettes.js";
import { draw } from "./views.js";

const canvas = document.querySelector("#home-canvas");
const stage = canvas.getContext("2d", { alpha: false });
const plate = document.createElement("canvas");
const plateCtx = plate.getContext("2d", { alpha: false });
const work = document.createElement("canvas");
const workCtx = work.getContext("2d", { alpha: false });
const previous = document.createElement("canvas");
const previousCtx = previous.getContext("2d", { alpha: false });

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const displayed = document.createElement("canvas");
const displayedCtx = displayed.getContext("2d", { alpha: false });

let plateCamera = null;
let plateW = 0;
let plateH = 0;
let plateRow = 0;
let plateMs = 0;
let plateIterations = null;
let plateBasins = null;
let displayedId = "";

let maxEdge = 1040;
let running = false;
let elapsed = FADE_MS;
let lastNow = 0;
let sceneIndex = -1;
let hasPrevious = false;
let frames = [];

function resize() {
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  work.width = width;
  work.height = height;
  previous.width = width;
  previous.height = height;
  sceneIndex = -1;
  hasPrevious = false;
  plateCamera = null;
}

function beginPlate(camera, width, height) {
  const size = screensaverSize(width, height, maxEdge);
  plateW = size.width;
  plateH = size.height;
  plateIterations = new Uint16Array(plateW * plateH);
  plateBasins = new Int8Array(plateW * plateH);
  plateBasins.fill(-1);
  plateRow = 0;
  plateMs = 0;
  plateCamera = camera;
  if (plate.width !== plateW || plate.height !== plateH) {
    plate.width = plateW;
    plate.height = plateH;
  }
}

function stepPlate(budget) {
  if (!plateCamera) return;
  const started = performance.now();
  const rows = Math.max(2, Math.round(plateH / 30));
  while (plateRow < plateH && performance.now() - started < budget) {
    const count = Math.min(rows, plateH - plateRow);
    const band = escapeBand(
      plateCamera.fractalId,
      plateCamera.preset,
      plateW,
      plateH,
      plateCamera.iterations,
      plateRow,
      count,
    );
    plateIterations.set(band.iterations, plateRow * plateW);
    plateBasins.set(band.basins, plateRow * plateW);
    plateRow += count;
  }
  plateMs += performance.now() - started;
  if (plateRow < plateH) return;
  const pixels = paintEscape(
    plateCamera.paletteId,
    plateIterations,
    plateBasins,
    plateW,
    plateH,
    plateCamera.iterations,
  );
  plateCtx.putImageData(new ImageData(pixels, plateW, plateH), 0, 0);
  if (displayed.width !== plateW || displayed.height !== plateH) {
    displayed.width = plateW;
    displayed.height = plateH;
  }
  displayedCtx.drawImage(plate, 0, 0);
  displayedId = plateCamera.fractalId;
  if (plateMs > 55 && maxEdge > 480) maxEdge = Math.round(maxEdge * 0.82);
  else if (plateMs < 20 && maxEdge < 1200) maxEdge = Math.min(1200, maxEdge + 40);
  plateCamera = null;
}

function paintFractal(ctx, camera, width, height, complete = false) {
  const size = screensaverSize(width, height, maxEdge);
  if (!plateCamera || plateW !== size.width || plateH !== size.height) beginPlate(camera, width, height);
  if (complete) {
    while (plateCamera) stepPlate(70);
  } else {
    stepPlate(displayed.width === 0 ? 70 : 12);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (displayed.width > 0 && displayedId === camera.fractalId) {
    ctx.drawImage(displayed, 0, 0, width, height);
    return;
  }
  ctx.fillStyle = "#17140f";
  ctx.fillRect(0, 0, width, height);
}

function paintScheduled(schedule) {
  const scene = SCENES[schedule.index];
  if (schedule.index !== sceneIndex) {
    if (sceneIndex >= 0) {
      previousCtx.drawImage(work, 0, 0);
      hasPrevious = true;
    }
    sceneIndex = schedule.index;
    if (scene.kind === "sort") frames = sortFrames(scene.programId, scene.length, scene.seed);
  }
  if (scene.kind === "fractal") {
    paintFractal(workCtx, fractalCamera(scene.id, schedule.progress), work.width, work.height);
  } else {
    const frame = frames[frameIndex(schedule.progress, frames.length)];
    draw(scene.viewId, workCtx, frame, work.width, work.height);
  }
  stage.globalAlpha = 1;
  if (hasPrevious && schedule.fade < 1) {
    stage.drawImage(previous, 0, 0);
    stage.globalAlpha = schedule.fade;
  }
  stage.drawImage(work, 0, 0);
  stage.globalAlpha = 1;
}

function paintStill() {
  resize();
  paintFractal(stage, fractalCamera("mandelbrot", 0), canvas.width, canvas.height, true);
}

function tick(now) {
  if (!running) return;
  if (!lastNow) lastNow = now;
  elapsed += Math.min(80, now - lastNow);
  lastNow = now;
  resize();
  try {
    paintScheduled(sceneAt(elapsed));
  } catch {
    // Keep the last frame on screen if one plate fails to draw.
  }
  requestAnimationFrame(tick);
}

function sync() {
  running = false;
  lastNow = 0;
  if (showMode(reducedMotion.matches) === "still") {
    paintStill();
    return;
  }
  if (document.hidden) return;
  running = true;
  requestAnimationFrame(tick);
}

reducedMotion.addEventListener("change", sync);
document.addEventListener("visibilitychange", sync);
window.addEventListener("resize", () => {
  if (showMode(reducedMotion.matches) === "still") paintStill();
});

sync();
