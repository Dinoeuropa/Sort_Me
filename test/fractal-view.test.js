import assert from "node:assert/strict";
import test from "node:test";
import { planePoint } from "../src/fractals.js";
import { fitTransform } from "../src/palettes.js";
import {
  AUTO_ZOOM_PULL,
  AUTO_ZOOM_STEP,
  FIT_PAD,
  NAUTILUS,
  SHARP_RASTER_EDGE,
  autoZoomIterations,
  boundsMagnification,
  detailTarget,
  easeFactor,
  easeZoom,
  escapeBlitRect,
  escapeMagnification,
  iterationCap,
  levelBlend,
  mapPointsInto,
  panBounds,
  panEscape,
  pointBudget,
  rasterSize,
  recursionLevel,
  steerZoomTarget,
  unproject,
  wheelZoomFactor,
  zoomBounds,
  zoomEscape,
} from "../src/fractal-view.js";

const homeEscape = { centerX: -0.75, centerY: 0, scale: 2.6, flipY: false };
const square = { minX: 0, maxX: 4, minY: 0, maxY: 4 };

test("zooming an escape window keeps the point under the cursor", () => {
  const next = zoomEscape(homeEscape, 2, 30, 80, 200, 100, homeEscape.scale);
  const before = planePoint(homeEscape, 200, 100, 30, 80);
  const after = planePoint(next, 200, 100, 30, 80);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
  assert.ok(Math.abs(escapeMagnification(homeEscape, next) - 2) < 1e-9);
});

test("dragging an escape window follows the pointer", () => {
  const next = panEscape(homeEscape, 20, 10, 200, 100);
  assert.ok(next.centerX < homeEscape.centerX);
  assert.ok(next.centerY > homeEscape.centerY);
});

test("a burning-ship drag follows the flipped axis", () => {
  const ship = { centerX: -0.4, centerY: -0.5, scale: 3, flipY: true };
  const next = panEscape(ship, 0, 10, 100, 100);
  assert.ok(next.centerY < ship.centerY);
});

test("zooming a curve keeps the same pixel on the same point", () => {
  const width = 220;
  const height = 140;
  const px = 70;
  const py = 40;
  const next = zoomBounds(square, 3, px, py, width, height, square);
  const map = fitTransform(next, width, height, FIT_PAD);
  const world = unproject(square, px, py, width, height);
  const pixel = map(world.x, world.y);
  assert.ok(Math.abs(pixel.x - px) < 1e-6);
  assert.ok(Math.abs(pixel.y - py) < 1e-6);
  assert.ok(Math.abs(boundsMagnification(square, next) - 3) < 1e-9);
});

test("dragging a curve moves the window opposite the pointer", () => {
  const next = panBounds(square, 18, 0, 220, 140);
  assert.ok(next.minX < square.minX);
  assert.equal(next.maxY - next.minY, square.maxY - square.minY);
});

test("closer views add a generation at the fractal's scale factor", () => {
  assert.equal(recursionLevel("koch", 4, 1, 0, 6), 4);
  assert.equal(recursionLevel("koch", 4, 3, 0, 6), 5);
  assert.equal(recursionLevel("koch", 4, 9, 0, 6), 6);
  assert.equal(recursionLevel("koch", 4, 80, 0, 6), 6);
  assert.equal(recursionLevel("sierpinski", 3, 2, 0, 7), 4);
  assert.equal(recursionLevel("hilbert", 4, 2, 1, 7), 5);
  assert.equal(recursionLevel("dragon", 8, Math.SQRT2, 0, 14), 9);
});

test("closer escape windows spend more iterations and ferns plot more points", () => {
  assert.equal(iterationCap(48, 1), 48);
  assert.equal(iterationCap(48, 2), 66);
  assert.equal(iterationCap(48, 1e8), 500);
  assert.equal(pointBudget(20000, 1, 80000), 20000);
  assert.equal(pointBudget(20000, 3, 80000), 60000);
  assert.equal(pointBudget(20000, 20, 80000), 80000);
});

test("auto zoom raises iterations with the log of magnification", () => {
  assert.equal(autoZoomIterations(48, 1), 48);
  const step = autoZoomIterations(48, 2) - autoZoomIterations(48, 1);
  assert.ok(step >= 1);
  assert.equal(autoZoomIterations(48, 4) - autoZoomIterations(48, 2), step);
  assert.equal(autoZoomIterations(48, 8) - autoZoomIterations(48, 4), step);
  assert.equal(autoZoomIterations(48, 2 ** 40), 500);
});

test("zoom targeting prefers a boundary over the empty interior", () => {
  const width = 5;
  const height = 5;
  const iterations = new Uint16Array(width * height);
  const basins = new Int8Array(iterations.length);
  basins.fill(-1);
  iterations.fill(4);
  iterations[12] = 40;
  iterations[6] = 30;
  iterations[7] = 12;
  iterations[5] = 18;
  iterations[1] = 22;
  iterations[11] = 8;
  const view = { centerX: 0, centerY: 0, scale: 2 };
  const target = detailTarget(iterations, basins, width, height, view, 40, "escape");
  const interior = planePoint(view, width, height, 2, 2);
  assert.ok(target.score > 0);
  assert.ok(Math.hypot(target.x - interior.x, target.y - interior.y) > 0.2);
});

test("Newton zoom targeting sits on a basin boundary", () => {
  const width = 6;
  const height = 4;
  const iterations = new Uint16Array(width * height);
  const basins = new Int8Array(iterations.length);
  iterations.fill(3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) basins[y * width + x] = x < 3 ? 0 : 1;
  }
  const view = { centerX: 0, centerY: 0, scale: 2 };
  const target = detailTarget(iterations, basins, width, height, view, 12, "newton");
  assert.ok(target.score > 0);
  assert.ok(Math.abs(target.x) < 0.8);
});

test("Mandelbrot auto zoom homes on the nautilus, then follows detail", () => {
  const detail = { x: 0.3, y: -0.4, score: 5 };
  const wide = { centerX: -0.75, centerY: 0, scale: 2.6 };
  const early = steerZoomTarget(detail, wide, { anchor: NAUTILUS });
  assert.ok(Math.abs(early.x - NAUTILUS.x) < 1e-12);
  assert.ok(Math.abs(early.y - NAUTILUS.y) < 1e-12);
  const deep = { centerX: NAUTILUS.x, centerY: NAUTILUS.y, scale: 0.001 };
  const later = steerZoomTarget(detail, deep, { anchor: NAUTILUS });
  assert.ok(Math.abs(later.x - detail.x) < 1e-12);
  assert.ok(Math.abs(later.y - detail.y) < 1e-12);
  const local = { x: NAUTILUS.x, y: NAUTILUS.y, score: 5 };
  const biased = steerZoomTarget(local, deep, { anchor: NAUTILUS, bias: { x: 1, y: 0.5 }, aspect: 1 });
  assert.ok(biased.x > local.x);
});

test("each auto zoom step magnifies and eases toward the target", () => {
  const view = { centerX: 0, centerY: 0, scale: 2, flipY: false };
  const next = easeZoom(view, { x: 1, y: -1 }, 1.02, 0.5);
  assert.ok(Math.abs(view.scale / next.scale - 1.02) < 1e-9);
  assert.ok(next.centerX > view.centerX);
  assert.ok(next.centerY < view.centerY);
});

test("auto zoom creeps so the picture can keep up", () => {
  assert.ok(AUTO_ZOOM_STEP <= 1.003);
  assert.ok(AUTO_ZOOM_PULL <= 0.02);
  let view = { centerX: 0, centerY: 0, scale: 2, flipY: false };
  for (let i = 0; i < 60; i += 1) {
    view = easeZoom(view, { x: 1, y: 1 }, AUTO_ZOOM_STEP, AUTO_ZOOM_PULL);
  }
  assert.ok(2 / view.scale < 1.2);
  assert.ok(view.centerX < 0.7);
});

test("a finished escape picture is sampled at 4K", () => {
  const drawing = rasterSize(1400, 800, 2, false);
  assert.ok(Math.max(drawing.width, drawing.height) <= 960);
  const sharp = rasterSize(900, 520, 1, true);
  assert.equal(Math.max(sharp.width, sharp.height), SHARP_RASTER_EDGE);
  assert.equal(SHARP_RASTER_EDGE, 3840);
});

test("a wheel notch is a small zoom in every delta mode", () => {
  const pixel = wheelZoomFactor(-100, 0);
  assert.ok(pixel > 1);
  assert.ok(pixel < 1.5);
  assert.ok(wheelZoomFactor(-3, 1) > wheelZoomFactor(-3, 0));
  assert.ok(wheelZoomFactor(-1, 2) < 2);
  assert.ok(wheelZoomFactor(-100000, 0) < 2);
  assert.ok(Math.abs(wheelZoomFactor(0, 0) - 1) < 1e-12);
  assert.ok(wheelZoomFactor(100, 0) < 1);
});

test("easing spends part of a pending zoom and keeps the product", () => {
  const first = easeFactor(9);
  assert.ok(first.applied > 1);
  assert.ok(first.applied <= 1.06);
  assert.ok(Math.abs(first.applied * first.rest - 9) < 1e-9);
  let rest = 9;
  let product = 1;
  for (let i = 0; i < 80; i += 1) {
    const step = easeFactor(rest);
    product *= step.applied;
    rest = step.rest;
    if (rest === 1) break;
  }
  assert.equal(rest, 1);
  assert.ok(Math.abs(product - 9) < 1e-6);
});

test("a scaled escape plate stays anchored under the cursor", () => {
  const width = 200;
  const height = 100;
  const plate = { ...homeEscape, width, height };
  const same = escapeBlitRect(plate, homeEscape, width, height);
  assert.ok(Math.abs(same.x) < 1e-6);
  assert.ok(Math.abs(same.w - width) < 1e-6);
  const view = zoomEscape(homeEscape, 2, 30, 80, width, height, homeEscape.scale);
  const rect = escapeBlitRect(plate, view, width, height);
  const x = rect.x + (30 / width) * rect.w;
  const y = rect.y + (80 / height) * rect.h;
  assert.ok(Math.abs(x - 30) < 1e-6);
  assert.ok(Math.abs(y - 80) < 1e-6);
});

test("the next fractal level fades in across its scale factor", () => {
  const mid = levelBlend("koch", Math.sqrt(3));
  assert.equal(mid.extra, 0);
  assert.ok(Math.abs(mid.fade - 0.5) < 1e-9);
  const edge = levelBlend("koch", 3);
  assert.equal(edge.extra, 1);
  assert.ok(edge.fade < 1e-9);
  const before = levelBlend("koch", 3 * 0.999);
  assert.equal(before.extra, 0);
  assert.ok(before.fade > 0.99);
  assert.deepEqual(levelBlend("mandelbrot", 4), { extra: 0, fade: 0 });
});

test("a curve mapped into its own bounds stays put", () => {
  const points = mapPointsInto(Float64Array.from([0, 0, 4, 4]), square, square);
  assert.ok(Math.abs(points[0]) < 1e-9);
  assert.ok(Math.abs(points[1]) < 1e-9);
  assert.ok(Math.abs(points[2] - 4) < 1e-9);
  assert.ok(Math.abs(points[3] - 4) < 1e-9);
});
