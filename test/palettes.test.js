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

test("classic walks dark, brass, coral, then cream, without pulsing", () => {
  const lum = (color) => 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const brass = [226, 182, 87];
  const coral = [239, 111, 76];
  const cap = 4800;
  assert.ok(apart(colorSample("classic", 0.35 * cap, cap), brass) <= 1);
  assert.ok(apart(colorSample("classic", 0.75 * cap, cap), coral) <= 1);
  assert.ok(colorSample("classic", 0.2 * cap, cap)[1] > 100);

  for (const max of [48, 160, 4800]) {
    let reversals = 0;
    let direction = 0;
    let step = 0;
    let stepAt = 0;
    for (let iter = 1; iter < max - 1; iter += 1) {
      const a = colorSample("classic", iter, max);
      const b = colorSample("classic", iter + 1, max);
      const delta = lum(b) - lum(a);
      if (Math.abs(delta) > 0.5) {
        const sign = delta > 0 ? 1 : -1;
        if (direction !== 0 && sign !== direction) reversals += 1;
        direction = sign;
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const jump = Math.abs(a[channel] - b[channel]);
        if (jump > step) {
          step = jump;
          stepAt = iter;
        }
      }
    }
    assert.ok(reversals <= 2, `luminance reversals ${reversals} at cap ${max}`);
    const limit = max >= 4800 ? 2 : max >= 160 ? 6 : 16;
    assert.ok(step <= limit, `step ${step} at ${stepAt}, cap ${max}`);
  }

  const max = 240;
  const field = colorSample("classic", Math.round(max * 0.25), max);
  const edge = colorSample("classic", Math.round(max * 0.85), max);
  assert.ok(apart(field, edge) > 70, `field and boundary are ${apart(field, edge)} apart`);
  const end = colorSample("classic", max - 1, max);
  assert.ok(lum(end) < 210, `the last shade is ${lum(end)}, bright enough to wash the center out`);
  assert.notDeepEqual(colorSample("classic", Math.round(max * 0.05), max), edge);
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

test("a zoomed curve strokes only the segments that reach the canvas, in their own colors", () => {
  const curve = buildGeometry("hilbert", "hilbert", 6);
  const full = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < curve.paths[0].length; i += 2) {
    full.minX = Math.min(full.minX, curve.paths[0][i]);
    full.maxX = Math.max(full.maxX, curve.paths[0][i]);
    full.minY = Math.min(full.minY, curve.paths[0][i + 1]);
    full.maxY = Math.max(full.maxY, curve.paths[0][i + 1]);
  }
  const spanX = (full.maxX - full.minX) / 16;
  const spanY = (full.maxY - full.minY) / 16;
  const view = { minX: full.minX + spanX * 5, maxX: full.minX + spanX * 6, minY: full.minY + spanY * 9, maxY: full.minY + spanY * 10 };
  const width = 320;
  const height = 240;
  const total = curve.paths[0].length / 2 - 1;
  for (const paletteId of ["classic", "ink"]) {
    const ctx = recordingContext();
    drawPaths(paletteId, ctx, curve.paths, width, height, view, { clear: true });
    const map = fitTransform(view, width, height, 18);
    const expected = [];
    for (let i = 0; i < total; i += 1) {
      const a = map(curve.paths[0][i * 2], curve.paths[0][i * 2 + 1]);
      const b = map(curve.paths[0][i * 2 + 2], curve.paths[0][i * 2 + 3]);
      const reach = ctx.lineWidth;
      const outside =
        Math.max(a.x, b.x) < -reach || Math.min(a.x, b.x) > width + reach ||
        Math.max(a.y, b.y) < -reach || Math.min(a.y, b.y) > height + reach;
      if (outside) continue;
      const [r, g, bl] = colorSample(paletteId, i + 1, total + 1, -1);
      expected.push(`${a.x.toFixed(3)},${a.y.toFixed(3)}>${b.x.toFixed(3)},${b.y.toFixed(3)} rgb(${r}, ${g}, ${bl})`);
    }
    assert.ok(expected.length > 0 && expected.length < total / 20, `${paletteId} ${expected.length}`);
    assert.deepEqual(ctx.segments, expected, paletteId);
  }
});

test("a zoomed curve passes over far-off stretches without reading their points", () => {
  const points = buildGeometry("hilbert", "hilbert", 7).paths[0];
  let reads = 0;
  const path = new Proxy(points, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads += 1;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const view = { minX: 40, maxX: 48, minY: 70, maxY: 78 };
  const width = 320;
  const height = 240;
  const first = recordingContext();
  drawPaths("classic", first, [path], width, height, view, { clear: true });
  reads = 0;
  const again = recordingContext();
  drawPaths("classic", again, [path], width, height, view, { clear: true });
  assert.deepEqual(again.segments, first.segments);
  assert.ok(first.segments.length > 0);
  assert.ok(reads < points.length / 8, `${reads} of ${points.length}`);
});

test("segments drawn alone and in a zoomed frame keep the colors of the whole curve", () => {
  const curve = buildGeometry("dragon", "twin", 9);
  const width = 320;
  const height = 240;
  const whole = recordingContext();
  drawPaths("classic", whole, curve.paths, width, height, { minX: -40, maxX: 40, minY: -40, maxY: 40 }, { clear: true });
  const colorOf = new Map(whole.segments.map((line) => [line.split(" ")[0], line.slice(line.indexOf(" ") + 1)]));
  const near = recordingContext();
  drawPaths("classic", near, curve.paths, width * 4, height * 4, { minX: -40, maxX: 40, minY: -40, maxY: 40 }, { clear: true });
  const zoomed = recordingContext();
  drawPaths("classic", zoomed, curve.paths, width, height, { minX: 2, maxX: 9, minY: -3, maxY: 4 }, { clear: true });
  assert.ok(zoomed.segments.length > 0 && near.segments.length === whole.segments.length);
  const styles = new Set(zoomed.segments.map((line) => line.slice(line.indexOf(" ") + 1)));
  for (const style of styles) assert.ok([...colorOf.values()].includes(style), style);
});

function recordingContext() {
  let pen = null;
  let pending = [];
  const ctx = {
    strokes: 0,
    fills: 0,
    segments: [],
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    beginPath() {
      pending = [];
      pen = null;
    },
    moveTo(x, y) {
      pen = { x, y };
    },
    lineTo(x, y) {
      pending.push(`${pen.x.toFixed(3)},${pen.y.toFixed(3)}>${x.toFixed(3)},${y.toFixed(3)}`);
      pen = { x, y };
    },
    stroke() {
      ctx.strokes += 1;
      for (const segment of pending) ctx.segments.push(`${segment} ${ctx.strokeStyle}`);
      pending = [];
    },
    fill() {
      ctx.fills += 1;
    },
    fillRect() {
      ctx.fills += 1;
    },
    arc() {},
  };
  return ctx;
}

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
