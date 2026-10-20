import assert from "node:assert/strict";
import test from "node:test";
import { buildGeometry, escapeBand, presetById } from "../src/fractals.js";
import {
  PALETTES,
  colorSample,
  drawPaths,
  drawPoints,
  drawTriangles,
  fitTransform,
  paintEscape,
  paletteById,
} from "../src/palettes.js";

test("coloring programs are selectable and distinct", () => {
  const ids = PALETTES.map((palette) => palette.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 4);
  for (const id of ["classic", "heat", "ocean", "ink", "hue"]) {
    assert.equal(ids.includes(id), true, id);
  }
  for (const palette of PALETTES) {
    assert.equal(typeof palette.name, "string");
    assert.equal(palette.name.length > 0, true);
    assert.equal(typeof palette.blurb, "string");
  }
});

test("unknown coloring ids are rejected", () => {
  assert.throws(() => paletteById("missing"), /unknown coloring/i);
  assert.throws(() => colorSample("missing", 1, 8, -1), /unknown coloring/i);
});

test("escape colors stay in range, share an interior, and separate iterations", () => {
  const inside = colorSample("classic", 20, 20, -1);
  for (const palette of PALETTES) {
    const trapped = colorSample(palette.id, 12, 12, -1);
    assert.deepEqual(trapped, inside);
    const early = colorSample(palette.id, 1, 24, -1);
    const late = colorSample(palette.id, 18, 24, -1);
    for (const channel of early) {
      assert.equal(Number.isInteger(channel), true);
      assert.ok(channel >= 0 && channel <= 255);
    }
    assert.notDeepEqual(early, late);
    assert.notDeepEqual(early, trapped);
  }
});

test("newton basins take different colors from the same palette", () => {
  const a = colorSample("classic", 4, 20, 0);
  const b = colorSample("classic", 4, 20, 1);
  const c = colorSample("classic", 4, 20, 2);
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(b, c);
  assert.notDeepEqual(a, c);
});

test("paint writes one opaque pixel per sample", () => {
  const preset = { centerX: 0, centerY: 0, scale: 6 };
  const band = escapeBand("mandelbrot", preset, 3, 3, 12, 0, 3);
  const pixels = paintEscape("heat", band.iterations, band.basins, 3, 3, 12);
  assert.equal(pixels.length, 3 * 3 * 4);
  for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  const center = band.iterations[4] >= 12;
  assert.equal(center, true);
  assert.deepEqual([pixels[16], pixels[17], pixels[18]], colorSample("heat", 12, 12, -1));
  const early = band.iterations[0];
  assert.ok(early < 12);
  const hidden = paintEscape("heat", band.iterations, band.basins, 3, 3, 12, 3, early - 1);
  assert.deepEqual([hidden[0], hidden[1], hidden[2]], colorSample("heat", 12, 12, -1));
  const shown = paintEscape("heat", band.iterations, band.basins, 3, 3, 12, 3, early);
  assert.deepEqual([shown[0], shown[1], shown[2]], colorSample("heat", early, 12, -1));
});

test("fit keeps the bounds centered inside the padded canvas", () => {
  const map = fitTransform({ minX: -2, maxX: 2, minY: 0, maxY: 10 }, 200, 100, 10);
  const center = map(0, 5);
  assert.ok(Math.abs(center.x - 100) < 1);
  assert.ok(Math.abs(center.y - 50) < 1);
  const corner = map(-2, 0);
  assert.ok(corner.x >= 10 - 1e-6);
  assert.ok(corner.y <= 90 + 1e-6);
});

test("a curve can grow without clearing what is already drawn", () => {
  const curve = buildGeometry("koch", "curve", 1);
  const ctx = mockContext();
  let clears = 0;
  ctx.fillRect = () => {
    clears += 1;
    ctx.fills += 1;
  };
  drawPaths("classic", ctx, curve.paths, 180, 120, undefined, { from: 0, until: 1 });
  const cleared = clears;
  const strokes = ctx.strokes;
  drawPaths("classic", ctx, curve.paths, 180, 120, undefined, { from: 1, until: 4, clear: false });
  assert.equal(clears, cleared);
  assert.ok(ctx.strokes > strokes);
});

test("every coloring can draw a curve, a gasket, and a point cloud", () => {
  const curve = buildGeometry("koch", "curve", 1);
  const gasket = buildGeometry("sierpinski", "upright", 1);
  const bounds = presetById("fern", "classic").bounds;
  for (const palette of PALETTES) {
    const ctx = mockContext();
    drawPaths(palette.id, ctx, curve.paths, 180, 120);
    drawTriangles(palette.id, ctx, gasket.vertices, 180, 120);
    drawPoints(palette.id, ctx, new Float64Array([0.2, 1.4, -0.4, 3.2]), bounds, 180, 120);
    assert.ok(ctx.strokes + ctx.fills > 0, palette.id);
  }
});

function mockContext() {
  return {
    strokes: 0,
    fills: 0,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    rect() {},
    fill() {
      this.fills += 1;
    },
    stroke() {
      this.strokes += 1;
    },
    fillRect() {
      this.fills += 1;
    },
    clearRect() {},
  };
}
