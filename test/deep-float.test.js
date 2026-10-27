import assert from "node:assert/strict";
import test from "node:test";
import { autoZoomTarget, escapeValue, paletteRange } from "../src/fractals.js";
import { ddAdd, ddSub } from "../src/precision.js";
import {
  fixedFromNumber,
  fixedMandelbrotIterations,
  fixedToNumber,
  isSeahorseCenter,
  seahorseOrbit,
  seahorsePoint,
  scaledEscape,
} from "../src/deep-float.js";

test("fixed-point values round-trip through a double", () => {
  for (const value of [0, 1, -2, 0.5, -0.7436965465439123, 1e-12, 1e-40]) {
    const back = fixedToNumber(fixedFromNumber(value));
    const scale = Math.max(1, Math.abs(value));
    assert.ok(Math.abs(back - value) <= scale * 1e-12, `${value} came back as ${back}`);
  }
});

test("a plain exterior point matches the ordinary Mandelbrot count", () => {
  const cx = 0.3;
  const cy = -0.4;
  const plain = escapeValue("mandelbrot", {}, cx, cy, 80).iteration;
  const deep = fixedMandelbrotIterations(fixedFromNumber(cx), fixedFromNumber(cy), 0, 0, 80);
  assert.equal(deep, plain);
});

test("the seahorse center stays on its fixed point far past a pair of doubles", () => {
  const point = seahorsePoint();
  const known = ddAdd(-0.7436965465439123, 1.6423472316984958e-17, 0, 0);
  const knownY = ddAdd(0.13172167175968114, 1.0660999617601176e-17, 0, 0);
  const missX = ddSub(point.x, point.xLo, known[0], known[1]);
  const missY = ddSub(point.y, point.yLo, knownY[0], knownY[1]);
  assert.ok(Math.abs(missX[0] + missX[1]) < 1e-28, `x miss ${missX[0] + missX[1]}`);
  assert.ok(Math.abs(missY[0] + missY[1]) < 1e-28, `y miss ${missY[0] + missY[1]}`);
  assert.ok(point.residual < 1e-250, `residual ${point.residual}`);
  const orbit = seahorseOrbit(128);
  assert.equal(orbit.count, 129);
  assert.ok(orbit.deep);
  assert.equal(scaledEscape(orbit, 0, 0, 128), 128);
});

test("an offset past double-double agrees with direct high-precision iteration", () => {
  const point = seahorsePoint();
  const orbit = seahorseOrbit(20000);
  const offset = 1e-40;
  const direct = fixedMandelbrotIterations(point.re, point.im, offset, 0, 20000);
  const perturb = scaledEscape(orbit, offset, 0, 20000);
  assert.ok(direct > 1000 && direct < 20000, `direct escape ${direct}`);
  assert.ok(Math.abs(perturb - direct) <= 1, `perturb ${perturb} vs direct ${direct}`);
});

test("linear blocks keep the same escape time and fit in one shader pass", () => {
  const orbit = seahorseOrbit(40000);
  const deepOffset = 1e-80;
  const plain = scaledEscape(orbit, deepOffset, 0, 40000, { blocks: false });
  const blocked = scaledEscape(orbit, deepOffset, 0, 40000, { trace: true });
  assert.ok(plain > 16384, `the probe has to outrun the old loop, escaped at ${plain}`);
  assert.equal(blocked.iter, plain);
  assert.ok(blocked.steps < 16384, `shader steps ${blocked.steps}`);
  const rounded = scaledEscape(orbit, 1e-40, 0, 20000, { float32: true });
  const exact = scaledEscape(orbit, 1e-40, 0, 20000, { blocks: false });
  assert.ok(Math.abs(rounded - exact) <= 2, `float32 ${rounded} vs ${exact}`);
});

test("the live camera's double-double is the refined seahorse center", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const view = {
    centerX: target.x,
    centerXLo: target.xLo,
    centerY: target.y,
    centerYLo: target.yLo,
    scale: 1e-40,
  };
  assert.equal(isSeahorseCenter(view), true);
  assert.equal(isSeahorseCenter({ centerX: target.x, centerY: target.y, scale: 1e-40 }), false);
});

test("a deep seahorse plate still spreads its palette past the old iteration cap", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const view = {
    centerX: target.x,
    centerXLo: target.xLo,
    centerY: target.y,
    centerYLo: target.yLo,
    scale: 1e-40,
    flipY: false,
  };
  const range = paletteRange("mandelbrot", view, 32, 24, 20000);
  assert.ok(range.floor > 2000, `floor ${range.floor}`);
  assert.ok(range.top > range.floor && range.top <= 20000, `top ${range.top}`);
});
