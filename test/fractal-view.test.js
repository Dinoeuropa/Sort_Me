import assert from "node:assert/strict";
import test from "node:test";
import { planePoint } from "../src/fractals.js";
import { fitTransform } from "../src/palettes.js";
import {
  NAUTILUS,
  FIT_PAD,
  autoZoomIterations,
  boundsMagnification,
  detailTarget,
  easeZoom,
  escapeMagnification,
  iterationCap,
  mapPointsInto,
  panBounds,
  panEscape,
  pointBudget,
  recursionLevel,
  steerZoomTarget,
  unproject,
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

test("a curve mapped into its own bounds stays put", () => {
  const points = mapPointsInto(Float64Array.from([0, 0, 4, 4]), square, square);
  assert.ok(Math.abs(points[0]) < 1e-9);
  assert.ok(Math.abs(points[1]) < 1e-9);
  assert.ok(Math.abs(points[2] - 4) < 1e-9);
  assert.ok(Math.abs(points[3] - 4) < 1e-9);
});
