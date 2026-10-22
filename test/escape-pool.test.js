import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderEscape } from "../src/escape-pool.js";
import { composeBitmap } from "../src/escape-worker.js";
import { escapeBand } from "../src/fractals.js";
import { paintEscape } from "../src/palettes.js";

const preset = { centerX: 0, centerY: 0, scale: 3.2, cx: -0.123, cy: 0.745, flipY: false };

describe("escape pool", { concurrency: 1 }, () => {
test("a pooled picture matches one escape band", async () => {
  const width = 36;
  const height = 24;
  const cap = 16;
  const result = await renderEscape({
    fractalId: "julia",
    preset,
    width,
    height,
    cap,
    paletteId: "classic",
    view: { centerX: 0, centerY: 0, scale: 3.2, flipY: false },
  });
  const band = escapeBand("julia", preset, width, height, cap, 0, height);
  const pixels = paintEscape("classic", band.iterations, band.basins, width, height, cap, height, cap);
  assert.equal(result.dropped, false);
  assert.equal(result.iterations.length, band.iterations.length);
  assert.equal(result.pixels.length, pixels.length);
  for (let i = 0; i < band.iterations.length; i += 1) assert.equal(result.iterations[i], band.iterations[i]);
  for (let i = 0; i < pixels.length; i += 1) assert.equal(result.pixels[i], pixels[i]);
});

test("a plate asked for as a bitmap still arrives as pixels where nothing can make bitmaps", async () => {
  const result = await renderEscape({
    fractalId: "julia",
    preset,
    width: 20,
    height: 12,
    cap: 12,
    paletteId: "classic",
    view: { centerX: 0, centerY: 0, scale: 3.2, flipY: false },
    bitmap: true,
  });
  assert.equal(result.dropped, false);
  assert.equal(result.pixels.length, 20 * 12 * 4);
  assert.equal(await composeBitmap({ width: 2, height: 1, parts: [] }), null);
});

test("zooming out replaces a closer plate that is still drawing", async () => {
  const closer = renderEscape({
    fractalId: "julia",
    preset,
    width: 420,
    height: 280,
    cap: 48,
    paletteId: "classic",
    view: { centerX: 0, centerY: 0, scale: 0.2, flipY: false },
  });
  const wider = renderEscape({
    fractalId: "julia",
    preset,
    width: 48,
    height: 32,
    cap: 12,
    paletteId: "classic",
    view: { centerX: 0, centerY: 0, scale: 3.2, flipY: false },
  });
  const dropped = await closer;
  const opened = await wider;
  assert.equal(dropped.dropped, true);
  assert.equal(opened.dropped, false);
  assert.equal(opened.width, 48);
  assert.equal(opened.iterations.length, 48 * 32);
});

test("a closer plate waits until the current picture finishes", async () => {
  const home = renderEscape({
    fractalId: "julia",
    preset,
    width: 40,
    height: 28,
    cap: 12,
    paletteId: "classic",
    view: { centerX: 0, centerY: 0, scale: 3.2, flipY: false },
  });
  const closer = renderEscape({
    fractalId: "julia",
    preset,
    width: 40,
    height: 28,
    cap: 12,
    paletteId: "classic",
    view: { centerX: 0, centerY: 0, scale: 0.4, flipY: false },
  });
  const first = await home;
  const second = await closer;
  assert.equal(first.dropped, false);
  assert.equal(first.width, 40);
  assert.equal(second.dropped, false);
  assert.equal(second.view.scale, 0.4);
});
});
