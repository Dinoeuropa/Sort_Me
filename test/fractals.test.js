import assert from "node:assert/strict";
import test from "node:test";
import {
  FRACTALS,
  buildGeometry,
  constructionOrder,
  cursorParameter,
  escapeBand,
  escapeValue,
  fractalById,
  iterateIfs,
  newtonCursor,
  planePoint,
  presetById,
} from "../src/fractals.js";

const IDS = ["mandelbrot", "julia", "burning", "newton", "koch", "dragon", "sierpinski", "hilbert", "fern"];

test("a fractal menu is available to select from", () => {
  const ids = FRACTALS.map((fractal) => fractal.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 6);
  for (const id of IDS) assert.equal(ids.includes(id), true, id);
  for (const fractal of FRACTALS) {
    assert.equal(typeof fractal.name, "string");
    assert.equal(fractal.name.length > 0, true);
    assert.equal(typeof fractal.blurb, "string");
    assert.equal(fractal.blurb.length > 0, true);
    assert.match(fractal.latex, /[a-zA-Z\\]/);
    assert.equal(["escape", "curve", "gasket", "ifs"].includes(fractal.kind), true, fractal.id);
    assert.equal(Number.isInteger(fractal.minDepth), true);
    assert.equal(Number.isInteger(fractal.maxDepth), true);
    assert.equal(Number.isInteger(fractal.defaultDepth), true);
    assert.ok(fractal.minDepth <= fractal.defaultDepth);
    assert.ok(fractal.defaultDepth <= fractal.maxDepth);
    assert.equal(fractal.presets.length, 3, fractal.id);
    const presetIds = fractal.presets.map((preset) => preset.id);
    assert.equal(new Set(presetIds).size, 3);
    for (const preset of fractal.presets) {
      assert.equal(typeof preset.name, "string");
      assert.equal(preset.name.length > 0, true);
    }
  }
});

test("unknown fractal and preset ids are rejected", () => {
  assert.throws(() => fractalById("missing"), /unknown fractal/i);
  assert.throws(() => presetById("mandelbrot", "missing"), /unknown preset/i);
  assert.throws(() => escapeValue("missing", {}, 0, 0, 5), /unknown fractal/i);
});

test("the center pixel sits on the preset center", () => {
  const point = planePoint({ centerX: -0.75, centerY: 0.25, scale: 2 }, 200, 100, 100, 50);
  assert.ok(Math.abs(point.x + 0.75) < 1e-9);
  assert.ok(Math.abs(point.y - 0.25) < 1e-9);
  const flipped = planePoint({ centerX: 0, centerY: 0, scale: 2, flipY: true }, 100, 100, 50, 0);
  const upright = planePoint({ centerX: 0, centerY: 0, scale: 2 }, 100, 100, 50, 0);
  assert.ok(flipped.y < 0);
  assert.ok(upright.y > 0);
  assert.ok(Math.abs(flipped.y + upright.y) < 1e-9);
});

test("mandelbrot keeps the origin and rejects a far point", () => {
  const inside = escapeValue("mandelbrot", {}, 0, 0, 40);
  const period = escapeValue("mandelbrot", {}, -1, 0, 40);
  const outside = escapeValue("mandelbrot", {}, 0.5, 0.5, 40);
  assert.equal(inside.iteration, 40);
  assert.equal(inside.basin, -1);
  assert.equal(period.iteration, 40);
  assert.ok(outside.iteration < 40);
  assert.ok(outside.iteration >= 1);
});

test("a tiny mandelbrot raster marks the center inside and a corner outside", () => {
  const preset = { centerX: 0, centerY: 0, scale: 6 };
  const band = escapeBand("mandelbrot", preset, 3, 3, 30, 0, 3);
  assert.equal(band.iterations.length, 9);
  assert.equal(band.basins.length, 9);
  assert.equal(band.iterations[4], 30);
  assert.ok(band.iterations[0] < 30);
  assert.equal(band.basins[4], -1);
});

test("julia, burning ship, and newton stay finite and distinct", () => {
  const julia = FRACTALS.find((fractal) => fractal.id === "julia");
  for (const preset of julia.presets) {
    assert.equal(typeof preset.cx, "number");
    assert.equal(typeof preset.cy, "number");
  }
  const disk = julia.presets.find((preset) => preset.id === "disk");
  const stayed = escapeValue("julia", disk, 0, 0, 30);
  const left = escapeValue("julia", disk, 1.4, 0, 30);
  assert.equal(stayed.iteration, 30);
  assert.ok(left.iteration < 30);

  const ship = escapeValue("burning", {}, 0, 0, 25);
  const shipOut = escapeValue("burning", {}, 2, 2, 25);
  assert.ok(ship.iteration >= 1);
  assert.ok(ship.iteration <= 25);
  assert.ok(shipOut.iteration < 25);

  const root = escapeValue("newton", {}, 0.9, 0.05, 20);
  const omega = escapeValue("newton", {}, -0.45, 0.85, 20);
  assert.equal(root.basin, 0);
  assert.notEqual(omega.basin, root.basin);
  assert.ok(root.iteration < 20);
  assert.ok(omega.iteration <= 20);
});

test("the cursor maps across the Mandelbrot window", () => {
  const origin = cursorParameter(0, 0, 300, 200);
  const far = cursorParameter(300, 200, 300, 200);
  const middle = cursorParameter(150, 100, 300, 200);
  assert.ok(Math.abs(origin.x + 2) < 1e-9);
  assert.ok(Math.abs(origin.y - 1.2) < 1e-9);
  assert.ok(Math.abs(far.x - 1) < 1e-9);
  assert.ok(Math.abs(far.y + 1.2) < 1e-9);
  assert.ok(Math.abs(middle.x + 0.5) < 1e-9);
  assert.ok(Math.abs(middle.y) < 1e-9);
  const outside = cursorParameter(300, 0, 300, 200);
  assert.ok(Math.abs(outside.x - 1) < 1e-9);
  assert.ok(Math.abs(outside.y - 1.2) < 1e-9);
  const disk = escapeValue("julia", { cx: 0, cy: 0 }, 0, 0, 20);
  const pointed = escapeValue("julia", { cx: outside.x, cy: outside.y }, 0, 0, 20);
  assert.equal(disk.iteration, 20);
  assert.ok(pointed.iteration < 20);
});

test("a Newton cursor bends z^3-1 and leaves the plain roots alone", () => {
  const rest = newtonCursor(150, 100, 300, 200);
  assert.ok(Math.abs(rest.px) < 1e-9);
  assert.ok(Math.abs(rest.py) < 1e-9);
  const edge = newtonCursor(0, 0, 300, 200);
  assert.ok(Math.abs(edge.px) <= 0.35);
  assert.ok(Math.abs(edge.py) <= 0.35);
  assert.ok(Math.abs(edge.px) > 0.05);
  const plainRoot = escapeValue("newton", {}, 0.9, 0.05, 20);
  const zeroed = escapeValue("newton", { px: 0, py: 0 }, 0.9, 0.05, 20);
  assert.deepEqual(zeroed, plainRoot);
  const bent = { px: 0.2, py: -0.12 };
  const near = [
    [0.9, 0.05],
    [-0.45, 0.85],
    [-0.45, -0.85],
  ];
  const basins = near.map(([x, y]) => escapeValue("newton", bent, x, y, 24).basin);
  assert.equal(new Set(basins).size, 3);
  let changed = false;
  for (let y = -1; y <= 1; y += 0.25) {
    for (let x = -1; x <= 1; x += 0.25) {
      const before = escapeValue("newton", {}, x, y, 16);
      const after = escapeValue("newton", bent, x, y, 16);
      if (before.basin !== after.basin || before.iteration !== after.iteration) changed = true;
    }
  }
  assert.equal(changed, true);
});

test("a burning-ship cursor folds z around a chosen c", () => {
  const plain = escapeValue("burning", {}, 0.3, -0.2, 24);
  const aimed = escapeValue("burning", { cx: -0.6, cy: 0.15 }, 0.3, -0.2, 24);
  assert.notDeepEqual(aimed, plain);
  const origin = escapeValue("burning", { cx: 0, cy: 0 }, 0, 0, 12);
  const classic = escapeValue("burning", {}, 0, 0, 12);
  assert.deepEqual(origin, classic);
});

test("escape rasters reject non-escape fractals and empty bands", () => {
  assert.throws(() => escapeBand("koch", {}, 2, 2, 4, 0, 1), /escape/i);
  const band = escapeBand("mandelbrot", { centerX: 0, centerY: 0, scale: 3 }, 4, 4, 5, 4, 3);
  assert.equal(band.iterations.length, 0);
});

test("each fractal is produced in the order of its definition", () => {
  assert.equal(constructionOrder("mandelbrot"), "iterations");
  assert.equal(constructionOrder("julia"), "iterations");
  assert.equal(constructionOrder("burning"), "iterations");
  assert.equal(constructionOrder("newton"), "iterations");
  assert.equal(constructionOrder("koch"), "generations");
  assert.equal(constructionOrder("sierpinski"), "generations");
  assert.equal(constructionOrder("dragon"), "path");
  assert.equal(constructionOrder("hilbert"), "path");
  assert.equal(constructionOrder("fern"), "chaos");
  assert.equal(escapeValue("mandelbrot", {}, 1, 0, 20).iteration, 3);
});

test("koch geometry grows by four and stays equilateral", () => {
  const snow = buildGeometry("koch", "snowflake", 0);
  const next = buildGeometry("koch", "snowflake", 1);
  const curve = buildGeometry("koch", "curve", 2);
  assert.equal(snow.mode, "polyline");
  assert.equal(snow.paths.length, 1);
  assert.equal(snow.paths[0].length, 4 * 2);
  assert.equal(next.paths[0].length, (3 * 4 + 1) * 2);
  assert.equal(curve.paths[0].length, (4 ** 2 + 1) * 2);
  const points = pairs(snow.paths[0]);
  const side = dist(points[0], points[1]);
  assert.ok(Math.abs(dist(points[1], points[2]) - side) < 1e-9);
  assert.ok(Math.abs(dist(points[2], points[0]) - side) < 1e-9);
  const grown = pairs(next.paths[0]);
  const bump = grown[2];
  assert.ok(Math.abs(dist(grown[1], bump) - side / 3) < 1e-6);
  assert.ok(Math.abs(dist(bump, grown[3]) - side / 3) < 1e-6);
  const baseBox = bounds(snow.paths[0]);
  const grownBox = bounds(next.paths[0]);
  assert.ok(grownBox.minY < baseBox.minY - 0.05);
  const curveOnce = pairs(buildGeometry("koch", "curve", 1).paths[0]);
  assert.ok(Math.abs(curveOnce[2][1] - Math.sqrt(3) / 6) < 1e-6);
  assert.ok(curveOnce[1][1] === 0 && curveOnce[3][1] === 0);
});

test("the dragon curve turns a right angle and doubles", () => {
  const first = buildGeometry("dragon", "heighway", 0);
  const second = buildGeometry("dragon", "heighway", 1);
  const third = buildGeometry("dragon", "heighway", 3);
  assert.equal(first.paths[0].length, 2 * 2);
  assert.equal(second.paths[0].length, 3 * 2);
  assert.equal(third.paths[0].length, (2 ** 3 + 1) * 2);
  const corner = pairs(second.paths[0]);
  const a = [corner[1][0] - corner[0][0], corner[1][1] - corner[0][1]];
  const b = [corner[2][0] - corner[1][0], corner[2][1] - corner[1][1]];
  assert.ok(Math.abs(a[0] * b[0] + a[1] * b[1]) < 1e-9);
  assert.ok(a[0] * b[1] - a[1] * b[0] > 0);
  const early = pairs(second.paths[0]);
  const later = pairs(third.paths[0]);
  for (let i = 0; i < early.length; i += 1) {
    assert.equal(later[i][0], early[i][0]);
    assert.equal(later[i][1], early[i][1]);
  }
  assert.equal(turnsOf(later), "LLRLLRR");
  const twin = buildGeometry("dragon", "twin", 2);
  assert.equal(twin.paths.length, 2);
});

test("sierpinski keeps three similar triangles and drops the middle", () => {
  const base = buildGeometry("sierpinski", "upright", 0);
  const once = buildGeometry("sierpinski", "upright", 1);
  assert.equal(base.mode, "triangles");
  assert.equal(base.vertices.length, 6);
  assert.equal(once.vertices.length, 18);
  assert.ok(triangleArea(base.vertices) > triangleArea(once.vertices.slice(0, 6)) * 3.9);
  const hole = centroid(base.vertices);
  for (let i = 0; i < once.vertices.length; i += 6) {
    assert.equal(contains(once.vertices.slice(i, i + 6), hole), false);
  }
  const centers = centroids(once.vertices);
  assert.ok(Math.min(...centers.map((point) => point[0])) < 0.4);
  assert.ok(Math.max(...centers.map((point) => point[0])) > 0.6);
  assert.equal(buildGeometry("sierpinski", "upright", 3).vertices.length / 6, 27);
});

test("hilbert visits every cell of its grid without a diagonal jump", () => {
  const order1 = pairs(buildGeometry("hilbert", "hilbert", 1).paths[0]);
  assert.deepEqual(order1, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  const curve = buildGeometry("hilbert", "hilbert", 2);
  const points = pairs(curve.paths[0]);
  assert.equal(points.length, 16);
  const seen = new Set(points.map(([x, y]) => `${x},${y}`));
  assert.equal(seen.size, 16);
  for (let i = 1; i < points.length; i += 1) {
    const step = Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
    assert.equal(step, 1);
  }
  const moore = buildGeometry("hilbert", "moore", 1);
  const loop = pairs(moore.paths[0]);
  assert.ok(loop.length >= 4);
  const close =
    Math.abs(loop[0][0] - loop[loop.length - 1][0]) + Math.abs(loop[0][1] - loop[loop.length - 1][1]);
  assert.equal(close, 1);
  const square = pairs(buildGeometry("hilbert", "moore", 2).paths[0]);
  const width = spread(square, 0);
  const height = spread(square, 1);
  assert.equal(width, height);
  assert.ok(width > 1);
});

test("fern points stay inside the preset bounds and repeat for a seed", () => {
  const preset = presetById("fern", "classic");
  assert.deepEqual(
    preset.maps.map((map) => [map.a, map.b, map.c, map.d, map.e, map.f, map.p]),
    [
      [0, 0, 0, 0.16, 0, 0, 0.01],
      [0.85, 0.04, -0.04, 0.85, 0, 1.6, 0.85],
      [0.2, -0.26, 0.23, 0.22, 0, 1.6, 0.07],
      [-0.15, 0.28, 0.26, 0.24, 0, 0.44, 0.07],
    ],
  );
  const first = iterateIfs("fern", "classic", { x: 0, y: 0, seed: 7 }, 400);
  const again = iterateIfs("fern", "classic", { x: 0, y: 0, seed: 7 }, 400);
  assert.deepEqual(first.points, again.points);
  assert.equal(first.points.length, 800);
  for (let i = 0; i < first.points.length; i += 2) {
    const x = first.points[i];
    const y = first.points[i + 1];
    assert.ok(x >= preset.bounds.minX && x <= preset.bounds.maxX, x);
    assert.ok(y >= preset.bounds.minY && y <= preset.bounds.maxY, y);
  }
  const other = iterateIfs("fern", "classic", { x: 0, y: 0, seed: 8 }, 40);
  assert.notDeepEqual(other.points, first.points.slice(0, 80));
  assert.throws(() => iterateIfs("koch", "snowflake", { x: 0, y: 0, seed: 1 }, 4), /ifs/i);
});

function bounds(flat) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    minX = Math.min(minX, flat[i]);
    maxX = Math.max(maxX, flat[i]);
    minY = Math.min(minY, flat[i + 1]);
    maxY = Math.max(maxY, flat[i + 1]);
  }
  return { minX, maxX, minY, maxY };
}

function spread(points, axis) {
  const values = points.map((point) => point[axis]);
  return Math.max(...values) - Math.min(...values);
}

function turnsOf(points) {
  let turns = "";
  for (let i = 1; i < points.length - 1; i += 1) {
    const cross =
      (points[i][0] - points[i - 1][0]) * (points[i + 1][1] - points[i][1]) -
      (points[i][1] - points[i - 1][1]) * (points[i + 1][0] - points[i][0]);
    turns += cross > 0 ? "L" : "R";
  }
  return turns;
}

function centroids(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 6) {
    points.push([(flat[i] + flat[i + 2] + flat[i + 4]) / 3, (flat[i + 1] + flat[i + 3] + flat[i + 5]) / 3]);
  }
  return points;
}

function pairs(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
  return points;
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function triangleArea(flat) {
  let area = 0;
  for (let i = 0; i < flat.length; i += 6) {
    area += Math.abs(
      flat[i] * (flat[i + 3] - flat[i + 5]) +
        flat[i + 2] * (flat[i + 5] - flat[i + 1]) +
        flat[i + 4] * (flat[i + 1] - flat[i + 3]),
    );
  }
  return area / 2;
}

function centroid(flat) {
  return [(flat[0] + flat[2] + flat[4]) / 3, (flat[1] + flat[3] + flat[5]) / 3];
}

function contains(flat, point) {
  const [px, py] = point;
  const ax = flat[0];
  const ay = flat[1];
  const bx = flat[2];
  const by = flat[3];
  const cx = flat[4];
  const cy = flat[5];
  const c1 = cross(bx - ax, by - ay, px - ax, py - ay);
  const c2 = cross(cx - bx, cy - by, px - bx, py - by);
  const c3 = cross(ax - cx, ay - cy, px - cx, py - cy);
  const hasNeg = c1 < -1e-8 || c2 < -1e-8 || c3 < -1e-8;
  const hasPos = c1 > 1e-8 || c2 > 1e-8 || c3 > 1e-8;
  return !(hasNeg && hasPos);
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}
