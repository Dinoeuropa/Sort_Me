import assert from "node:assert/strict";
import test from "node:test";
import { autoZoomFloor, autoZoomTarget, boundaryAnchor, escapeValue, planePoint } from "../src/fractals.js";
import { fitTransform } from "../src/palettes.js";
import {
  AUTO_ZOOM_STEP,
  FIT_PAD,
  SHARP_RASTER_EDGE,
  advanceAutoZoom,
  autoZoomIterations,
  autoZoomPath,
  autoZoomView,
  boundsMagnification,
  clampViewToPlate,
  coverViews,
  easeFactor,
  escapeBlitRect,
  escapeSourceBlit,
  fitZoomOut,
  escapeMagnification,
  iterationCap,
  levelBlend,
  mapPointsInto,
  panBounds,
  panEscape,
  plateCovers,
  plateRasterEdge,
  pointBudget,
  rasterSize,
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
  assert.equal(iterationCap(48, 2), 144);
  assert.ok(iterationCap(48, 2e8) > 1600);
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
  assert.equal(autoZoomIterations(48, 2 ** 40), 3888);
  assert.ok(autoZoomIterations(48, 2e8) > 1600);
});

test("zooming out stays inside the plate until a wider one exists", () => {
  const from = { centerX: 0, centerY: 0, scale: 0.4, flipY: false };
  const plate = { ...from, width: 960, height: 540 };
  const proposed = { ...from, scale: 1.2 };
  const held = fitZoomOut(plate, from, proposed, 960 / 540);
  assert.ok(Math.abs(held.scale - from.scale) < 1e-9);
  const wide = { ...from, scale: 2.4, width: 960, height: 540 };
  const opened = fitZoomOut(wide, from, proposed, 960 / 540);
  assert.ok(Math.abs(opened.scale - proposed.scale) < 1e-9);
});

test("zooming in is not paused while the next plate is still drawing", () => {
  const camera = { centerX: 0, centerY: 0, scale: 2, flipY: false };
  const path = autoZoomPath(camera, { x: 1, y: 0 });
  const look = advanceAutoZoom(path, 3, 36, 1);
  const ahead = autoZoomView(path, look.octave);
  const now = autoZoomView(path, 3);
  const grown = now.scale / ahead.scale;
  assert.ok(grown > 1.2);
  assert.ok(grown < 2.2);
  const cover = coverViews([now, ahead], 1.5);
  assert.ok(cover.scale >= now.scale * 1.65 - 1e-9);
  assert.equal(plateCovers(cover, now, 1.5), true);
  assert.equal(plateCovers(cover, ahead, 1.5), true);
  const plate = { centerX: 0, centerY: 0, scale: 2, width: 300, height: 200, flipY: false };
  const held = clampViewToPlate(plate, { centerX: 0.1, centerY: -0.05, scale: 0.4, flipY: false }, 1.5);
  assert.ok(Math.abs(held.scale - 0.4) < 1e-9);
  assert.ok(Math.abs(held.centerX - 0.1) < 1e-9);
  assert.equal(plateRasterEdge(32), 2560);
  assert.equal(plateRasterEdge(180), 2560);
  assert.ok(plateRasterEdge(4000) < 2560);
  assert.ok(plateRasterEdge(4000) >= 480);
  const close = { centerX: 0, centerY: 0, scale: 0.2, flipY: false };
  const wide = { centerX: 0.05, centerY: -0.02, scale: 0.8, flipY: false };
  const outward = coverViews([wide, close], 1.5);
  assert.ok(plateCovers(outward, wide, 1.5));
  assert.ok(plateCovers(outward, close, 1.5));
  assert.ok(outward.scale >= wide.scale * 1.65 - 1e-9);
});

test("a deep zoom still samples the plate instead of stretching it off the canvas", () => {
  const width = 200;
  const height = 100;
  const plate = { centerX: -0.74, centerY: 0.13, scale: 1e-4, width, height, flipY: false };
  const view = { ...plate, scale: plate.scale / 1000 };
  const blit = escapeSourceBlit(plate, view, width, height);
  assert.ok(blit);
  assert.ok(blit.dw > width * 0.9);
  assert.ok(blit.dh > height * 0.9);
  assert.ok(blit.sw < 2);
  assert.ok(blit.sh < 2);
  assert.ok(blit.sx >= 0 && blit.sx < width);
  assert.ok(blit.sy >= 0 && blit.sy < height);
});

test("a finished escape picture is sampled at 4K", () => {
  const drawing = rasterSize(1400, 800, 2, false);
  assert.ok(Math.max(drawing.width, drawing.height) <= 960);
  const sharp = rasterSize(900, 520, 1, true);
  assert.equal(Math.max(sharp.width, sharp.height), SHARP_RASTER_EDGE);
  assert.equal(SHARP_RASTER_EDGE, 3840);
  const moving = rasterSize(900, 520, 1, true, 1920);
  assert.equal(Math.max(moving.width, moving.height), 1920);
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

test("auto zoom follows one fixed path into its target", () => {
  const start = { centerX: -0.75, centerY: 0, scale: 2.6, flipY: false };
  const target = { x: -0.7436, y: 0.1318 };
  const path = autoZoomPath(start, target);
  const first = autoZoomView(path, 0);
  assert.ok(Math.abs(first.centerX - start.centerX) < 1e-12);
  assert.ok(Math.abs(first.centerY - start.centerY) < 1e-12);
  assert.ok(Math.abs(first.scale - start.scale) < 1e-12);
  const deep = autoZoomView(path, 20);
  assert.ok(Math.abs(deep.centerX - target.x) < deep.scale * 1e-6);
  assert.ok(Math.abs(deep.centerY - target.y) < deep.scale * 1e-6);
  assert.ok(Math.abs(start.scale / deep.scale - 2 ** 20) < 1);
  assert.ok(path.maxOctave > 30);
  let previous = autoZoomView(path, 0);
  let biggest = 0;
  for (let o = 0.01; o <= 12; o += 0.01) {
    const view = autoZoomView(path, o);
    const step = Math.hypot(view.centerX - previous.centerX, view.centerY - previous.centerY) / view.scale;
    biggest = Math.max(biggest, step);
    previous = view;
  }
  assert.ok(biggest < 0.05);
});

test("auto zoom paces itself into a crawl at both ends and reports the deepest point", () => {
  const path = autoZoomPath({ centerX: 0, centerY: 0, scale: 2, flipY: false }, { x: 0, y: 0 });
  const early = advanceAutoZoom(path, 0, 1, 1);
  const middle = advanceAutoZoom(path, 10, 1, 1);
  assert.ok(early.octave > 0);
  assert.ok(early.octave < (middle.octave - 10));
  assert.ok(Math.abs(middle.octave - 10 - Math.log2(AUTO_ZOOM_STEP)) < 1e-9);
  assert.equal(middle.done, false);
  const late = advanceAutoZoom(path, path.maxOctave - 1, 1, 1);
  assert.ok(late.octave - (path.maxOctave - 1) < middle.octave - 10);
  let octave = path.maxOctave - 0.001;
  let done = false;
  for (let i = 0; i < 60 && !done; i += 1) {
    const step = advanceAutoZoom(path, octave, 1, 1);
    octave = step.octave;
    done = step.done;
  }
  assert.equal(done, true);
  assert.equal(octave, path.maxOctave);
});

test("auto zoom doubles about once a second", () => {
  const mag = AUTO_ZOOM_STEP ** 60;
  assert.ok(mag > 1.8);
  assert.ok(mag < 2.6);
});

test("each reactive fractal has a fixed point to dive into", () => {
  const mandelbrot = autoZoomTarget("mandelbrot", {});
  assert.ok(Math.hypot(mandelbrot.x + 0.7436, mandelbrot.y - 0.1318) < 1e-3);
  const preset = { cx: -0.8, cy: 0.156 };
  const beta = autoZoomTarget("julia", preset);
  const x2 = beta.x * beta.x - beta.y * beta.y + preset.cx;
  const y2 = 2 * beta.x * beta.y + preset.cy;
  assert.ok(Math.hypot(x2 - beta.x, y2 - beta.y) < 1e-12);
  for (const [id, base] of [["mandelbrot", {}], ["burning", { centerX: -1.76, centerY: -0.03, scale: 0.1 }], ["newton", {}]]) {
    const point = autoZoomTarget(id, base);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    const classes = new Set();
    for (let j = -3; j <= 3; j += 1) {
      for (let i = -3; i <= 3; i += 1) {
        const value = escapeValue(id, base, point.x + i * 1e-9, point.y + j * 1e-9, 2400);
        classes.add(id === "newton" ? value.basin : value.iteration >= 2400 ? 1 : 0);
      }
    }
    assert.ok(classes.size >= 2, id + " target sits on an edge");
  }
  assert.ok(autoZoomFloor("burning") > autoZoomFloor("mandelbrot"));
  assert.ok(autoZoomFloor("mandelbrot") > 0);
});

test("a boundary anchor lands on the edge of the set", () => {
  const point = boundaryAnchor("mandelbrot", {}, { x: 0.3, y: 0 }, 0.1);
  const classes = new Set();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const value = escapeValue("mandelbrot", {}, point.x + dx * 1e-9, point.y + dy * 1e-9, 2400);
    classes.add(value.iteration >= 2400);
  }
  assert.ok(Math.hypot(point.x - 0.3, point.y) < 0.15);
  assert.equal(classes.size, 2);
  assert.deepEqual(boundaryAnchor("mandelbrot", {}, { x: 5, y: 5 }, 0.01), { x: 5, y: 5 });
});
