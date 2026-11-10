import assert from "node:assert/strict";
import test from "node:test";
import { escapeValue, openPaletteProbe, paletteRange } from "../src/fractals.js";
import { ddAdd, ddSub } from "../src/precision.js";
import {
  DEEP_ITERATION_LIMIT,
  DEEP_ZOOM_DIGITS,
  DEEP_ZOOM_SCALE_BITS,
  fixedFromNumber,
  fixedMandelbrotIterations,
  fixedToNumber,
  isSeahorseCenter,
  seahorseOrbit,
  clearSeahorseOrbit,
  seahorsePoint,
  seahorseOffsetIterations,
  SEAHORSE_FLOOR_EXP,
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

test("a floatexp offset past the float64 wall matches single-step perturbation", () => {
  const exp = -1040;
  assert.ok(exp < -1022);
  assert.ok(SEAHORSE_FLOOR_EXP < exp);
  const cap = 131072;
  const orbit = seahorseOrbit(cap);
  const plain = scaledEscape(orbit, 1, 0, cap, { exp, blocks: false });
  const blocked = scaledEscape(orbit, 1, 0, cap, { exp, trace: true });
  const rounded = scaledEscape(orbit, 1, 0, cap, { exp, float32: true, trace: true });
  assert.ok(plain > 16384 && plain < cap, `escape ${plain}`);
  assert.equal(blocked.iter, plain);
  assert.ok(blocked.steps < 16384, `shader steps ${blocked.steps}`);
  assert.ok(Math.abs(rounded.iter - plain) <= 1, `float32 ${rounded.iter} vs ${plain}`);
  assert.ok(rounded.steps < 16384, `float32 steps ${rounded.steps}`);
  assert.notEqual(scaledEscape(orbit, 1.5, 0, cap, { exp }), plain);
});

test("a 10^10000 view escapes from one reference orbit inside a shader pass", () => {
  assert.equal(DEEP_ZOOM_DIGITS, 10000);
  assert.ok(DEEP_ZOOM_SCALE_BITS >= Math.ceil(10000 * Math.log2(10)));
  assert.ok(SEAHORSE_FLOOR_EXP <= -DEEP_ZOOM_SCALE_BITS);
  const exp = SEAHORSE_FLOOR_EXP;
  const probe = seahorseOrbit(128);
  const lambda = 2 * Math.hypot(probe.orbit[80 * 2], probe.orbit[80 * 2 + 1]);
  const anchor = scaledEscape(seahorseOrbit(20000), 1, 0, 20000, { exp: -80 });
  const orbit = seahorseOrbit(DEEP_ITERATION_LIMIT);
  const deep = scaledEscape(orbit, 1, 0, DEEP_ITERATION_LIMIT, { exp, trace: true });
  const perBit = (deep.iter - anchor) / ((-exp) - 80);
  assert.ok(anchor > 1000 && anchor < 20000, `anchor escape ${anchor}`);
  assert.ok(deep.iter > anchor && deep.iter < DEEP_ITERATION_LIMIT, `escape ${deep.iter}`);
  assert.ok(Math.abs(perBit - 1 / Math.log2(lambda)) < 0.5, `iterations per bit ${perBit}`);
  assert.ok(deep.steps < 16384, `shader steps ${deep.steps}`);
  const rounded = scaledEscape(orbit, 1, 0, DEEP_ITERATION_LIMIT, { exp, float32: true });
  assert.ok(Math.abs(rounded - deep.iter) <= 2, `float32 ${rounded} vs ${deep.iter}`);
  const nearer = scaledEscape(orbit, 0.25, 0, DEEP_ITERATION_LIMIT, { exp });
  assert.ok(nearer > deep.iter, `closer pixel escaped at ${nearer}, edge at ${deep.iter}`);
  const interior = scaledEscape(orbit, 0, 0, DEEP_ITERATION_LIMIT, { exp, trace: true });
  assert.equal(interior.iter, DEEP_ITERATION_LIMIT);
  assert.ok(interior.steps < 16384, `interior shader steps ${interior.steps}`);
});

test("a seahorse orbit extended in slices builds the same blocks as one request", () => {
  clearSeahorseOrbit();
  seahorseOrbit(2500);
  seahorseOrbit(6000);
  const sliced = seahorseOrbit(9000);
  clearSeahorseOrbit();
  const full = seahorseOrbit(9000);
  assert.equal(sliced.count, full.count);
  assert.equal(sliced.blocks.length, full.blocks.length);
  for (let i = 0; i < full.blocks.length; i += 1) {
    assert.equal(sliced.blocks[i].at, full.blocks[i].at);
    assert.equal(sliced.blocks[i].length, full.blocks[i].length);
    assert.equal(sliced.blocks[i].radiusExp, full.blocks[i].radiusExp);
  }
  const offset = 1e-40;
  assert.equal(scaledEscape(sliced, offset, 0, 9000), scaledEscape(full, offset, 0, 9000));
});

test("the live camera's double-double is the refined seahorse center", () => {
  const view = {
    centerX: -0.7436965465439123,
    centerXLo: 1.6423472316984958e-17,
    centerY: 0.13172167175968114,
    centerYLo: 1.0660999617601176e-17,
    scale: 1e-40,
  };
  assert.equal(isSeahorseCenter(view), true);
  assert.equal(isSeahorseCenter({
    centerX: -0.7436965465439123,
    centerY: 0.13172167175968114,
    scale: 1e-40,
  }), false);
});

test("a deep seahorse plate still spreads its palette past the old iteration cap", () => {
  const view = {
    centerX: -0.7436965465439123,
    centerXLo: 1.6423472316984958e-17,
    centerY: 0.13172167175968114,
    centerYLo: 1.0660999617601176e-17,
    scale: 1e-40,
    flipY: false,
  };
  const range = paletteRange("mandelbrot", view, 32, 24, 20000);
  assert.ok(range.floor > 2000, `floor ${range.floor}`);
  assert.ok(range.top > range.floor && range.top <= 20000, `top ${range.top}`);
  const probe = openPaletteProbe("mandelbrot", view, 32, 24, 20000);
  assert.equal(probe.step(), null);
  let fitted = null;
  for (let guard = 0; !fitted && guard < 32; guard += 1) fitted = probe.step();
  assert.deepEqual(fitted, range);
});
