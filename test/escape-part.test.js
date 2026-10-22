import assert from "node:assert/strict";
import test from "node:test";
import { renderPart } from "../src/escape-worker.js";
import { escapeBand } from "../src/fractals.js";
import { paintEscape } from "../src/palettes.js";

test("a worker band matches the full escape picture", () => {
  const preset = { centerX: 0, centerY: 0, scale: 3.2, cx: -0.123, cy: 0.745, flipY: false };
  const width = 48;
  const height = 32;
  const cap = 24;
  const full = escapeBand("julia", preset, width, height, cap, 0, height);
  const pixels = paintEscape("classic", full.iterations, full.basins, width, height, cap, height, cap);
  const top = renderPart({
    fractalId: "julia",
    preset,
    width,
    height,
    cap,
    y0: 0,
    rows: 14,
    paletteId: "classic",
  });
  const bottom = renderPart({
    fractalId: "julia",
    preset,
    width,
    height,
    cap,
    y0: 14,
    rows: 18,
    paletteId: "classic",
  });
  assert.equal(top.iterations.length, width * 14);
  for (let i = 0; i < top.iterations.length; i += 1) {
    assert.equal(top.iterations[i], full.iterations[i]);
    assert.equal(top.basins[i], full.basins[i]);
  }
  for (let i = 0; i < bottom.iterations.length; i += 1) {
    assert.equal(bottom.iterations[i], full.iterations[width * 14 + i]);
    assert.equal(bottom.basins[i], full.basins[width * 14 + i]);
  }
  for (let i = 0; i < top.pixels.length; i += 1) assert.equal(top.pixels[i], pixels[i]);
  const offset = width * 14 * 4;
  for (let i = 0; i < bottom.pixels.length; i += 1) assert.equal(bottom.pixels[i], pixels[offset + i]);
});
