import assert from "node:assert/strict";
import test from "node:test";
import { autoZoomFloor, autoZoomTarget, escapeBand, escapeValue, presetById } from "../src/fractals.js";
import {
  autoZoomIterations,
  autoZoomPath,
  autoZoomView,
  coverViews,
  escapeBlitRect,
  panEscape,
  plateCovers,
  plateFrame,
  zoomEscape,
} from "../src/fractal-view.js";
import {
  ddAdd,
  ddMandelbrotIterations,
  ddMul,
  ddSub,
  deepCenter,
  hasDeepCenter,
  perturbIterations,
  referenceOrbit,
  shiftView,
  viewOffset,
} from "../src/precision.js";

test("double-double sums and products keep the digits a double drops", () => {
  const [hi, lo] = ddAdd(1, 0, 1e-20, 0);
  assert.equal(hi, 1);
  assert.ok(Math.abs(lo - 1e-20) < 1e-36);
  const [back, rest] = ddSub(hi, lo, 1e-20, 0);
  assert.equal(back, 1);
  assert.equal(rest, 0);
  const third = [1 / 3, 1 / 3 - 1 / 3];
  for (let i = 0; i < 3; i += 1) {
    const [phi, plo] = ddMul(third[0], third[1], 3, 0);
    const [rhi, rlo] = ddSub(1, 0, phi, plo);
    const [chi, clo] = ddMul(third[0], third[1], rhi, rlo);
    [third[0], third[1]] = ddAdd(third[0], third[1], chi, clo);
  }
  assert.equal(third[0], 1 / 3);
  assert.ok(Math.abs(third[1]) > 1e-18);
  const [one, slack] = ddMul(third[0], third[1], 3, 0);
  assert.equal(one, 1);
  assert.ok(Math.abs(slack) < 1e-31);
  const big = ddMul(12345678.9, 0, 0.000123456789, 0);
  const exact = 12345678.9 * 0.000123456789;
  assert.equal(big[0], exact);
  assert.ok(Math.abs(big[1]) > 0 && Math.abs(big[1]) < 1e-12);
});

test("double-double iteration agrees with plain doubles where doubles are exact enough", () => {
  let same = 0;
  let total = 0;
  for (let j = 0; j < 24; j += 1) {
    for (let i = 0; i < 24; i += 1) {
      const cx = -2.2 + (i / 23) * 3;
      const cy = -1.3 + (j / 23) * 2.6;
      const plain = escapeValue("mandelbrot", {}, cx, cy, 400).iteration;
      const deep = ddMandelbrotIterations(cx, 0, cy, 0, 400);
      total += 1;
      if (plain === deep) same += 1;
    }
  }
  assert.ok(same / total > 0.97, `${same} of ${total} agree`);
  assert.equal(ddMandelbrotIterations(1, 0, 0, 0, 100), 3);
  assert.equal(ddMandelbrotIterations(-1, 0, 0, 0, 100), 100);
});

test("perturbation from a reference orbit matches direct iteration in the shallow regime", () => {
  const preset = presetById("mandelbrot", "seahorse");
  const width = 96;
  const height = 54;
  const cap = 300;
  const plain = escapeBand("mandelbrot", preset, width, height, cap, 0, height);
  const deep = escapeBand("mandelbrot", { ...preset, centerXLo: 0, centerYLo: 0 }, width, height, cap, 0, height);
  let same = 0;
  let inside = 0;
  for (let k = 0; k < plain.iterations.length; k += 1) {
    if (plain.iterations[k] === deep.iterations[k]) same += 1;
    if (plain.iterations[k] >= cap) inside += 1;
  }
  assert.ok(inside > 0);
  assert.ok(same / plain.iterations.length > 0.985, `${same} of ${plain.iterations.length} agree`);
  assert.equal(deep.iterations.length, width * height);
  assert.ok(deep.basins.every((basin) => basin === -1));
});

test("a pixel outliving its reference rebases onto the start of the orbit", () => {
  const escaping = referenceOrbit(1, 0, 0, 0, 200);
  assert.equal(escaping.count, 4);
  assert.equal(perturbIterations(escaping, -1.5, 0, 200), 200);
  assert.equal(perturbIterations(escaping, 0, 0, 200), 3);
  const bounded = referenceOrbit(0, 0, 0, 0, 200);
  assert.equal(bounded.count, 201);
  assert.equal(perturbIterations(bounded, 1, 0, 200), 3);
  assert.equal(perturbIterations(bounded, -1, 0, 200), 200);
  assert.equal(referenceOrbit(0, 0, 0, 0, 200), bounded);
});

test("perturbation matches double-double iteration at a depth doubles cannot reach", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const scale = 1e-20;
  const cap = autoZoomIterations(48, 2.6 / scale);
  const reference = referenceOrbit(target.x, target.xLo, target.y, target.yLo, cap);
  let same = 0;
  let distinct = new Set();
  for (let j = 0; j < 6; j += 1) {
    for (let i = 0; i < 6; i += 1) {
      const dcx = ((i + 0.5) / 6 - 0.5) * scale;
      const dcy = ((j + 0.5) / 6 - 0.5) * scale;
      const fast = perturbIterations(reference, dcx, dcy, cap);
      const [cx, cxLo] = ddAdd(target.x, target.xLo, dcx, 0);
      const [cy, cyLo] = ddAdd(target.y, target.yLo, dcy, 0);
      const exact = ddMandelbrotIterations(cx, cxLo, cy, cyLo, cap);
      if (fast === exact) same += 1;
      distinct.add(fast);
    }
  }
  assert.ok(same >= 34, `${same} of 36 agree`);
  assert.ok(distinct.size > 6, "the frame still has structure");
});

test("the Mandelbrot dive target is a spiral center on the edge, held to double-double precision", () => {
  const target = autoZoomTarget("mandelbrot", {});
  assert.ok(hasDeepCenter({ centerXLo: target.xLo }));
  assert.ok(Math.abs(target.xLo) > 0 && Math.abs(target.xLo) < 1e-16);
  const floorCap = autoZoomIterations(48, 2.6 / autoZoomFloor("mandelbrot"));
  assert.ok(ddMandelbrotIterations(target.x, target.xLo, target.y, target.yLo, 16384) > floorCap);
  let previous = 0;
  for (const exponent of [9, 15, 21, 27]) {
    const d = 10 ** -exponent;
    const cap = autoZoomIterations(48, 2.6 / d);
    const [cx, cxLo] = ddAdd(target.x, target.xLo, d, 0);
    const escape = ddMandelbrotIterations(cx, cxLo, target.y, target.yLo, 16384);
    assert.ok(escape > previous, `escape time rises toward the point at 1e-${exponent}`);
    assert.ok(escape < cap, `an edge is drawn at 1e-${exponent} with a cap of ${cap}`);
    assert.ok(escape > cap * 0.5, `the edge is not trivial at 1e-${exponent}`);
    previous = escape;
  }
  // The critical orbit reaches the fixed point after 63 steps and stays there.
  let zx = [0, 0];
  let zy = [0, 0];
  const steps = [];
  for (let n = 0; n < 70; n += 1) {
    const xx = ddMul(zx[0], zx[1], zx[0], zx[1]);
    const yy = ddMul(zy[0], zy[1], zy[0], zy[1]);
    const xy = ddMul(zx[0], zx[1], zy[0], zy[1]);
    const re = ddSub(xx[0], xx[1], yy[0], yy[1]);
    const nx = ddAdd(re[0], re[1], target.x, target.xLo);
    const ny = ddAdd(2 * xy[0], 2 * xy[1], target.y, target.yLo);
    const dx = ddSub(nx[0], nx[1], zx[0], zx[1]);
    const dy = ddSub(ny[0], ny[1], zy[0], zy[1]);
    steps.push(Math.hypot(dx[0] + dx[1], dy[0] + dy[1]));
    zx = nx;
    zy = ny;
  }
  assert.ok(steps[62] > 1e-3);
  assert.ok(steps[63] < 1e-26);
  assert.ok(steps[69] < 1e-24);
  assert.ok(autoZoomFloor("mandelbrot") <= 1e-28);
  assert.ok(autoZoomFloor("julia") > autoZoomFloor("mandelbrot"));
});

test("a double-double camera keeps its offset from a plate below the double floor", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const scale = 1e-27;
  const plate = { ...deepCenter(target, 0, 0), scale: scale * 1.65, flipY: false, width: 400, height: 300 };
  const nudge = 2e-28;
  const still = { ...deepCenter(target, 0, 0), scale, flipY: false };
  const view = shiftView(still, nudge, -nudge);
  assert.ok(hasDeepCenter(view));
  const at = viewOffset(view, plate);
  assert.ok(Math.abs(at.dx - nudge) < nudge * 1e-3);
  assert.ok(Math.abs(at.dy + nudge) < nudge * 1e-3);
  assert.equal(plateCovers(plate, view, 4 / 3), true);
  const centered = escapeBlitRect(plate, still, 400, 300);
  const moved = escapeBlitRect(plate, view, 400, 300);
  assert.ok(Math.abs(centered.x + 130) < 1e-6);
  const expected = (nudge / (scale * (4 / 3))) * 400;
  assert.ok(expected > 50);
  assert.ok(Math.abs(centered.x - moved.x - expected) < 0.05);
  assert.ok(Math.abs(moved.w - centered.w) < 1e-9);
  const far = { ...shiftView(view, scale, 0), scale };
  assert.equal(plateCovers(plate, far, 4 / 3), false);
  const frame = plateFrame(view, 400, 300);
  assert.equal(frame.centerXLo, view.centerXLo);
  assert.equal(hasDeepCenter(plateFrame({ centerX: 0, centerY: 0, scale: 1 }, 10, 10)), false);
});

test("covering, panning, and zooming keep a double-double center", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const scale = 1e-24;
  const camera = { ...deepCenter(target, 0, 0), scale, flipY: false };
  const ahead = { ...shiftView(camera, 3e-25, 1e-25), scale: scale / 4 };
  const cover = coverViews([camera, ahead], 1.5);
  assert.ok(hasDeepCenter(cover));
  assert.ok(plateCovers(cover, camera, 1.5));
  assert.ok(plateCovers(cover, ahead, 1.5));
  const panned = panEscape(camera, 100, 0, 200, 100);
  const shift = viewOffset(panned, camera);
  assert.ok(Math.abs(shift.dx + scale) < scale * 1e-6);
  assert.ok(Math.abs(shift.dy) < scale * 1e-9);
  const zoomed = zoomEscape(camera, 2, 150, 50, 200, 100, 2.6e-20);
  const pull = viewOffset(zoomed, camera);
  assert.ok(Math.abs(zoomed.scale - scale / 2) < scale * 1e-9);
  assert.ok(Math.abs(pull.dx - 0.25 * (scale / 2) * 2) < scale * 1e-6);
  assert.ok(Math.abs(pull.dy) < scale * 1e-9);
  const plain = panEscape({ centerX: 0, centerY: 0, scale: 1, flipY: false }, 10, 0, 100, 100);
  assert.equal(hasDeepCenter(plain), false);
  assert.ok(Math.abs(plain.centerX + 0.1) < 1e-12);
});

test("the auto zoom path lands exactly on a double-double target", () => {
  const start = { centerX: -0.75, centerY: 0, scale: 2.6, flipY: false };
  const target = autoZoomTarget("mandelbrot", {});
  const path = autoZoomPath(start, target, autoZoomFloor("mandelbrot"));
  assert.ok(path.maxOctave > 90);
  const first = autoZoomView(path, 0);
  assert.ok(Math.abs(first.centerX - start.centerX) < 1e-12);
  assert.ok(Math.abs(first.centerY - start.centerY) < 1e-12);
  const deep = autoZoomView(path, 80);
  assert.ok(hasDeepCenter(deep));
  const aim = deepCenter(target, 0, 0);
  const miss = viewOffset(deep, aim);
  assert.ok(Math.abs(miss.dx) < 1e-31);
  assert.ok(Math.abs(miss.dy) < 1e-31);
  assert.ok(Math.abs(deep.scale - 2.6 * 2 ** -80) < 1e-40);
  const bottom = autoZoomView(path, path.maxOctave);
  assert.ok(bottom.scale >= 1e-28 * 0.999);
  const shallow = autoZoomPath(start, { x: 0.3, y: 0.1 });
  assert.equal(hasDeepCenter(autoZoomView(shallow, 10)), false);
});
