import assert from "node:assert/strict";
import test from "node:test";
import { colorSample } from "../src/palettes.js";
import { GPU_ITER_LIMIT, buildPaletteLut, gpuEscapeMode } from "../src/escape-gpu.js";

test("the shader palette is the same ramp the canvas painter uses", () => {
  const cap = 48;
  const lut = buildPaletteLut("classic", cap);
  const span = cap + 1;
  assert.equal(lut.length, span * 4 * 4);
  for (const iter of [0, 1, 17, cap]) {
    const rgb = colorSample("classic", iter, cap, -1);
    const offset = (3 * span + iter) * 4;
    assert.equal(lut[offset], rgb[0]);
    assert.equal(lut[offset + 1], rgb[1]);
    assert.equal(lut[offset + 2], rgb[2]);
    assert.equal(lut[offset + 3], 255);
  }
  const basin = colorSample("classic", 4, cap, 1);
  const basinOffset = (1 * span + 4) * 4;
  assert.equal(lut[basinOffset], basin[0]);
  assert.equal(lut[basinOffset + 1], basin[1]);
  assert.ok(GPU_ITER_LIMIT >= 4096);
});

test("each escape fractal picks the shader that matches its formula", () => {
  assert.equal(gpuEscapeMode("mandelbrot", {}), 0);
  assert.equal(gpuEscapeMode("julia", { cx: -0.1, cy: 0.7 }), 1);
  assert.equal(gpuEscapeMode("burning", { flipY: true }), 2);
  assert.equal(gpuEscapeMode("burning", { cx: 0.2, cy: -0.4 }), 3);
  assert.equal(gpuEscapeMode("newton", {}), 4);
  assert.equal(gpuEscapeMode("newton", { px: 0.1, py: 0 }), 5);
  assert.equal(gpuEscapeMode("koch", {}), -1);
});
