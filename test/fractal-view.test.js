import assert from "node:assert/strict";
import test from "node:test";
import { planePoint } from "../src/fractals.js";
import { fitTransform } from "../src/palettes.js";
import {
  FIT_PAD,
  boundsMagnification,
  easeFactor,
  escapeBlitRect,
  escapeMagnification,
  iterationCap,
  levelBlend,
  mapPointsInto,
  panBounds,
  panEscape,
  pointBudget,
  recursionLevel,
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

test("a wheel notch is a small zoom in every delta mode", () => {
  const pixel = wheelZoomFactor(-100, 0);
  assert.ok(pixel > 1);
  assert.ok(pixel < 1.5);
  const line = wheelZoomFactor(-3, 1);
  assert.ok(line > wheelZoomFactor(-3, 0));
  assert.ok(line < 2);
  const page = wheelZoomFactor(-1, 2);
  assert.ok(page > 1);
  assert.ok(page < 2);
  assert.ok(wheelZoomFactor(-100000, 0) < 2);
  assert.ok(Math.abs(wheelZoomFactor(0, 0) - 1) < 1e-12);
  assert.ok(wheelZoomFactor(100, 0) < 1);
});

test("easing spends part of a pending zoom and keeps the product", () => {
  const first = easeFactor(9);
  assert.ok(first.applied > 1);
  assert.ok(first.applied <= 1.12);
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
  const nudge = easeFactor(1.02);
  assert.ok(nudge.applied > 1);
  assert.ok(nudge.applied < 1.02);
});

test("a scaled escape plate stays anchored under the cursor", () => {
  const width = 200;
  const height = 100;
  const plate = { ...homeEscape, width, height };
  const same = escapeBlitRect(plate, homeEscape, width, height);
  assert.ok(Math.abs(same.x) < 1e-6);
  assert.ok(Math.abs(same.y) < 1e-6);
  assert.ok(Math.abs(same.w - width) < 1e-6);
  assert.ok(Math.abs(same.h - height) < 1e-6);
  const view = zoomEscape(homeEscape, 2, 30, 80, width, height, homeEscape.scale);
  const rect = escapeBlitRect(plate, view, width, height);
  const x = rect.x + (30 / width) * rect.w;
  const y = rect.y + (80 / height) * rect.h;
  assert.ok(Math.abs(x - 30) < 1e-6, `x ${x}`);
  assert.ok(Math.abs(y - 80) < 1e-6, `y ${y}`);
  assert.ok(rect.w > width);
  assert.ok(rect.h > height);
});

test("the next fractal level fades in across its scale factor", () => {
  const start = levelBlend("koch", 1);
  assert.equal(start.extra, 0);
  assert.ok(start.fade < 1e-9);
  const mid = levelBlend("koch", Math.sqrt(3));
  assert.equal(mid.extra, 0);
  assert.ok(Math.abs(mid.fade - 0.5) < 1e-9);
  const edge = levelBlend("koch", 3);
  assert.equal(edge.extra, 1);
  assert.ok(edge.fade < 1e-9);
  const before = levelBlend("koch", 3 * 0.999);
  assert.equal(before.extra, 0);
  assert.ok(before.fade > 0.99);
  assert.ok(Math.abs((before.extra + before.fade) - (edge.extra + edge.fade)) < 0.01);
  const sier = levelBlend("sierpinski", Math.SQRT2);
  assert.equal(sier.extra, 0);
  assert.ok(Math.abs(sier.fade - 0.5) < 1e-9);
  assert.deepEqual(levelBlend("mandelbrot", 4), { extra: 0, fade: 0 });
});

test("a curve mapped into its own bounds stays put", () => {
  const points = mapPointsInto(Float64Array.from([0, 0, 4, 4]), square, square);
  assert.ok(Math.abs(points[0]) < 1e-9);
  assert.ok(Math.abs(points[1]) < 1e-9);
  assert.ok(Math.abs(points[2] - 4) < 1e-9);
  assert.ok(Math.abs(points[3] - 4) < 1e-9);
});
