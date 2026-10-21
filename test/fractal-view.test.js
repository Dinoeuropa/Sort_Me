import assert from "node:assert/strict";
import test from "node:test";
import { planePoint } from "../src/fractals.js";
import { fitTransform } from "../src/palettes.js";
import {
  FIT_PAD,
  boundsMagnification,
  escapeMagnification,
  iterationCap,
  mapPointsInto,
  panBounds,
  panEscape,
  pointBudget,
  recursionLevel,
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

test("a curve mapped into its own bounds stays put", () => {
  const points = mapPointsInto(Float64Array.from([0, 0, 4, 4]), square, square);
  assert.ok(Math.abs(points[0]) < 1e-9);
  assert.ok(Math.abs(points[1]) < 1e-9);
  assert.ok(Math.abs(points[2] - 4) < 1e-9);
  assert.ok(Math.abs(points[3] - 4) < 1e-9);
});
