import assert from "node:assert/strict";
import test from "node:test";
import { autoZoomFloor, autoZoomTarget, boundaryAnchor, escapeValue, planePoint } from "../src/fractals.js";
import { fitTransform } from "../src/palettes.js";
import {
  AUTO_RAMP_MS,
  AUTO_ZOOM_STEP,
  MANUAL_MAGNIFICATION,
  PLATE_EDGE_MIN,
  PLATE_SCALE,
  PLATE_SCALE_SETTLED,
  PLATE_TARGET_MS,
  FIT_PAD,
  SHARP_RASTER_EDGE,
  advanceAutoZoom,
  autoZoomIterations,
  autoZoomPath,
  autoZoomRamp,
  autoZoomView,
  boundsMagnification,
  clampViewToPlate,
  coverViews,
  easeFactor,
  escapeBlitRect,
  escapeSourceBlit,
  fitZoomOut,
  escapeMagnification,
  escapeIterationCap,
  gpuDepthMode,
  iterationCap,
  MOTION_SCALE_MIN,
  motionScale,
  incomingLevelFade,
  levelBlend,
  mapPointsInto,
  panBounds,
  panEscape,
  panPixels,
  panRepaint,
  plateCovers,
  pickPlate,
  plateBudget,
  plateMargin,
  plateRasterEdge,
  pointBudget,
  gpuPrecisionHolds,
  rasterSize,
  recursionLevel,
  SETTLED_DPR_MAX,
  SETTLED_EDGE_MAX,
  SETTLED_SUPERSAMPLE,
  settledRaster,
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

test("manual zoom holds a view the auto zoom left past the manual limit", () => {
  const deep = { ...homeEscape, scale: homeEscape.scale / 1e16 };
  const zoomedIn = zoomEscape(deep, 2, 60, 40, 200, 100, homeEscape.scale);
  assert.equal(zoomedIn.scale, deep.scale);
  assert.equal(zoomedIn.centerX, deep.centerX);
  const zoomedOut = zoomEscape(deep, 0.5, 60, 40, 200, 100, homeEscape.scale);
  assert.ok(Math.abs(zoomedOut.scale / deep.scale - 2) < 1e-9);
  const shallow = { ...homeEscape, scale: homeEscape.scale / 8e5 };
  const capped = zoomEscape(shallow, 4, 60, 40, 200, 100, homeEscape.scale);
  assert.ok(Math.abs(escapeMagnification(homeEscape, capped) - MANUAL_MAGNIFICATION) < 1e-3);
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

test("a pan names the new strips and the overlap to keep", () => {
  const before = { centerX: 0, centerY: 0, scale: 2, flipY: false };
  const after = panEscape(before, 30, -12, 300, 200);
  const shift = panPixels(before, after, 300, 200);
  assert.deepEqual(shift, { x: 30, y: -12 });
  assert.equal(panPixels(before, { ...after, scale: 1 }, 300, 200), null);
  const paint = panRepaint(300, 200, shift.x, shift.y);
  assert.deepEqual(paint.copy, { sx: 0, sy: 12, sw: 270, sh: 188, dx: 30, dy: 0 });
  assert.deepEqual(paint.rects, [
    { x: 0, y: 0, w: 30, h: 200 },
    { x: 30, y: 188, w: 270, h: 12 },
  ]);
  assert.equal(panRepaint(300, 200, 0, 0), null);
  assert.equal(panRepaint(300, 200, 200, 0), null);
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

test("Newton's method gets a few more steps per octave, not the escape-time hundred", () => {
  assert.equal(escapeIterationCap("mandelbrot", 48, 2 ** 20), iterationCap(48, 2 ** 20));
  assert.equal(escapeIterationCap("julia", 48, 3), iterationCap(48, 3));
  assert.equal(escapeIterationCap("newton", 16, 1), 16);
  const million = escapeIterationCap("newton", 16, 1e6);
  assert.ok(million >= 110, `a million times in needs about 110 steps at the pole, got ${million}`);
  assert.ok(million <= 140);
  const deepest = escapeIterationCap("newton", 16, 1e28);
  assert.ok(deepest >= 330 && deepest <= 600);
  assert.ok(escapeIterationCap("newton", 40, 2) > escapeIterationCap("newton", 40, 1));
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

test("a settled raster is twice the device pixels, capped at 3x and a 7680 edge", () => {
  assert.equal(SETTLED_DPR_MAX, 3);
  assert.equal(SETTLED_SUPERSAMPLE, 2);
  assert.equal(SETTLED_EDGE_MAX, 7680);
  assert.deepEqual(settledRaster(800, 600, 1), { width: 1600, height: 1200 });
  assert.deepEqual(settledRaster(800, 600, 2), { width: 3200, height: 2400 });
  assert.deepEqual(settledRaster(800, 600, 4), { width: 4800, height: 3600 });
  const wide = settledRaster(4000, 2000, 2);
  assert.equal(Math.max(wide.width, wide.height), 7680);
  assert.equal(wide.width / wide.height, 2);
  assert.deepEqual(settledRaster(0, 10, 1), { width: 1, height: 20 });
});

test("a shallow escape view fits in float32 and a deep one does not", () => {
  const classic = { centerX: -0.75, centerY: 0, scale: 2.6 };
  assert.equal(gpuPrecisionHolds(classic, 800), true);
  const seahorse = { centerX: -0.75, centerY: 0.11, scale: 0.22 };
  assert.equal(gpuPrecisionHolds(seahorse, 1080), true);
  const deep = { centerX: -0.75, centerY: 0.1, scale: 1e-8 };
  assert.equal(gpuPrecisionHolds(deep, 800), false);
  const lowWord = { centerX: -0.75, centerY: 0, centerYLo: 0.01, scale: 2.6 };
  assert.equal(gpuPrecisionHolds(lowWord, 800), false);
  assert.equal(gpuPrecisionHolds(null, 800), false);
});

test("the shader draws plain coordinates while they hold and offsets from a reference past that", () => {
  assert.equal(gpuDepthMode({ centerX: -0.75, centerY: 0, scale: 2.6 }, 800), "direct");
  assert.equal(gpuDepthMode({ centerX: -0.75, centerY: 0.1, scale: 1e-8 }, 800), "perturb");
  assert.equal(gpuDepthMode({ centerX: -0.74, centerXLo: 1e-18, centerY: 0.13, centerYLo: 0, scale: 1e-26 }, 1080), "perturb");
  assert.equal(gpuDepthMode({ centerX: 0, centerXLo: 0, centerY: 0, centerYLo: 0, scale: 3e-27 }, 1080), "direct");
  assert.equal(gpuDepthMode({ centerX: -0.75, centerY: 0.1, scale: 1e-300 }, 800), null);
  assert.equal(gpuDepthMode(null, 800), null);
});

test("a moving picture is drawn at the share of full size that fits the frame budget", () => {
  assert.equal(motionScale(0, 1e6, 14), 1);
  assert.equal(motionScale(4, 1e6, 14), 1);
  const slow = motionScale(56, 1e6, 14);
  assert.ok(Math.abs(slow - 0.5) < 1e-9);
  assert.equal(motionScale(1e6, 1e6, 14), MOTION_SCALE_MIN);
  assert.equal(motionScale(Number.NaN, 1e6, 14), 1);
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
  assert.ok(Math.abs(first.applied - 1.03) < 1e-12);
  assert.ok(Math.abs(first.applied * first.rest - 9) < 1e-9);
  let rest = 9;
  let product = 1;
  for (let i = 0; i < 120; i += 1) {
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

test("a finer level stays off the picture until its segments are as wide as the stroke", () => {
  const ratio = 3;
  const minPx = 6;
  const thin = 1.4;
  const hidden = (progress) => incomingLevelFade(progress, thin * ratio ** progress, ratio, minPx);
  assert.equal(hidden(0), 0);
  assert.equal(hidden(0.2), 0);
  assert.equal(hidden(0.9), 0);
  assert.equal(hidden(1), 0);

  const alreadyWide = (progress) => incomingLevelFade(progress, 8 * 2 ** progress, 2, minPx);
  assert.equal(alreadyWide(0), 0);
  assert.ok(Math.abs(alreadyWide(0.4) - 0.4) < 1e-9);
  assert.ok(Math.abs(alreadyWide(1) - 1) < 1e-9);

  const opensMidway = (progress) => incomingLevelFade(progress, 2 * 4 ** progress, 4, 4);
  assert.equal(opensMidway(0.25), 0);
  assert.ok(Math.abs(opensMidway(0.5)) < 1e-9);
  assert.ok(Math.abs(opensMidway(0.75) - 0.5) < 1e-9);
  assert.ok(Math.abs(opensMidway(1) - 1) < 1e-9);
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

test("auto zoom keeps one steady pace and only reports passing the deepest point", () => {
  const path = autoZoomPath({ centerX: 0, centerY: 0, scale: 2, flipY: false }, { x: 0, y: 0 });
  const early = advanceAutoZoom(path, 0, 1, 1);
  const middle = advanceAutoZoom(path, 10, 1, 1);
  const late = advanceAutoZoom(path, path.maxOctave - 0.5, 1, 1);
  const step = Math.log2(AUTO_ZOOM_STEP);
  assert.ok(Math.abs(early.octave - step) < 1e-9);
  assert.ok(Math.abs(middle.octave - 10 - step) < 1e-9);
  assert.ok(Math.abs(late.octave - (path.maxOctave - 0.5) - step) < 1e-9);
  assert.equal(middle.done, false);
  const past = advanceAutoZoom(path, path.maxOctave - 0.001, 1, 1);
  assert.equal(past.done, true);
  assert.ok(past.octave > path.maxOctave);
  const beyond = autoZoomView(path, path.maxOctave + 1);
  assert.ok(Math.abs(beyond.scale - autoZoomView(path, path.maxOctave).scale / 2) < 1e-15);
  assert.equal(advanceAutoZoom(path, 5, 1, 0).octave, 5);
});

test("auto zoom starts from rest and the start is a smooth ramp", () => {
  assert.equal(autoZoomRamp(0), 0);
  assert.equal(autoZoomRamp(AUTO_RAMP_MS), 1);
  assert.equal(autoZoomRamp(AUTO_RAMP_MS * 5), 1);
  let previous = 0;
  for (let ms = 10; ms <= AUTO_RAMP_MS; ms += 10) {
    const pace = autoZoomRamp(ms);
    assert.ok(pace >= previous);
    assert.ok(pace - previous < 0.02);
    previous = pace;
  }
  assert.ok(autoZoomRamp(AUTO_RAMP_MS / 2) > 0.45 && autoZoomRamp(AUTO_RAMP_MS / 2) < 0.55);
});

test("plates shrink on a slow machine and grow back when they arrive early", () => {
  const slow = plateBudget(2560, PLATE_TARGET_MS * 4);
  assert.ok(slow < 2560);
  assert.ok(slow >= 2560 * 0.6 - 1);
  const crawl = plateBudget(500, PLATE_TARGET_MS * 100);
  assert.equal(crawl, PLATE_EDGE_MIN);
  assert.ok(PLATE_EDGE_MIN >= 400);
  const quick = plateBudget(1200, PLATE_TARGET_MS / 4);
  assert.ok(quick > 1200);
  assert.ok(quick <= 1500);
  assert.equal(plateBudget(2560, PLATE_TARGET_MS / 10), 2560);
  assert.equal(plateBudget(2000, PLATE_TARGET_MS / 10, 1600), 1600);
  assert.equal(plateBudget(NaN, NaN), 2560);
});

test("the finest plate that covers the frame is drawn, and none means every plate", () => {
  const wide = { view: { centerX: 0, centerY: 0, scale: 4, width: 400, height: 300, flipY: false } };
  const mid = { view: { centerX: 0.1, centerY: 0.1, scale: 1, width: 400, height: 300, flipY: false } };
  const fine = { view: { centerX: 0.2, centerY: 0.1, scale: 0.2, width: 400, height: 300, flipY: false } };
  const plates = [wide, mid, fine];
  assert.equal(pickPlate(plates, { centerX: 0.2, centerY: 0.1, scale: 0.1, flipY: false }, 4 / 3), 2);
  assert.equal(pickPlate(plates, { centerX: 0.2, centerY: 0.1, scale: 0.5, flipY: false }, 4 / 3), 1);
  assert.equal(pickPlate(plates, { centerX: 0, centerY: 0, scale: 3, flipY: false }, 4 / 3), 0);
  assert.equal(pickPlate(plates, { centerX: 0, centerY: 0, scale: 5, flipY: false }, 4 / 3), -1);
  assert.equal(pickPlate([], { centerX: 0, centerY: 0, scale: 1, flipY: false }), -1);
  const shot = { view: { centerX: 0, centerY: 0, scale: 2, width: 1279, height: 720, flipY: false } };
  const frame = { centerX: 0, centerY: 0, scale: 2, flipY: false };
  assert.equal(plateCovers(shot.view, frame, 1280 / 720), false);
  assert.equal(pickPlate([shot], frame, 1280 / 720), 0);
  assert.equal(pickPlate([shot], { ...frame, centerX: 0.05 }, 1280 / 720), -1);
});

test("plates lose their wide margin once the target sits in the middle of the frame", () => {
  assert.equal(plateMargin(0), PLATE_SCALE);
  assert.equal(plateMargin(5.9), PLATE_SCALE);
  assert.equal(plateMargin(6), PLATE_SCALE_SETTLED);
  assert.equal(plateMargin(80), PLATE_SCALE_SETTLED);
  assert.ok(PLATE_SCALE_SETTLED > 1 && PLATE_SCALE_SETTLED < PLATE_SCALE);
  const camera = { centerX: -0.74, centerY: 0.13, scale: 1e-10, flipY: false };
  const ahead = { ...camera, scale: 1e-11 };
  const wide = coverViews([camera, ahead], 1.5);
  const snug = coverViews([camera, ahead], 1.5, plateMargin(40));
  assert.ok(Math.abs(wide.scale - camera.scale * PLATE_SCALE) < 1e-20);
  assert.ok(Math.abs(snug.scale - camera.scale * PLATE_SCALE_SETTLED) < 1e-20);
  assert.ok(plateCovers(snug, camera, 1.5));
  assert.ok(plateCovers(snug, ahead, 1.5));
  assert.equal(coverViews([camera], 1.5, 0).scale, wide.scale);
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
  for (const [id, base] of [["mandelbrot", {}], ["newton", {}]]) {
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
  const ship = autoZoomTarget("burning", { centerX: -1.76, centerY: -0.03, scale: 0.1 });
  let previous = 0;
  for (const d of [1e-4, 1e-6, 1e-8, 1e-10]) {
    const escape = escapeValue("burning", {}, ship.x + d, ship.y, 2400).iteration;
    assert.ok(escape > previous && escape < 2400, `the ship's escape time rises toward its target at ${d}`);
    previous = escape;
  }
  const cursorShip = autoZoomTarget("burning", { cx: -1.76, cy: -0.03, centerX: 0, centerY: 0, scale: 3 });
  assert.ok(Number.isFinite(cursorShip.x) && Number.isFinite(cursorShip.y));
  assert.equal(autoZoomFloor("burning", { cx: -1.76, cy: -0.03 }), 2.5e-5);
  assert.equal(autoZoomFloor("burning"), autoZoomFloor("mandelbrot"));
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
