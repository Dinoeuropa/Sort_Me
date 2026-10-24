import assert from "node:assert/strict";
import test from "node:test";
import { autoZoomFloor, autoZoomTarget, escapeBand, escapeValue, paletteRange, presetById } from "../src/fractals.js";
import { easeWindow, paintEscape, paletteWindow } from "../src/palettes.js";
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
  ddDiv,
  ddEscapeIterations,
  ddJuliaBeta,
  ddMandelbrotIterations,
  ddMul,
  ddNewtonPole,
  ddNewtonStart,
  ddSub,
  newtonReference,
  deepCenter,
  hasDeepCenter,
  juliaReference,
  perturbIterations,
  referenceOrbit,
  seriesSkip,
  shiftView,
  shipJuliaReference,
  shipReference,
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
  const skip = seriesSkip(reference, scale * Math.SQRT1_2);
  assert.ok(skip > 1500 && skip < cap * 0.8, `skips ${skip} of ${cap}`);
  let same = 0;
  let sameSkipped = 0;
  let distinct = new Set();
  for (let j = 0; j < 6; j += 1) {
    for (let i = 0; i < 6; i += 1) {
      const dcx = ((i + 0.5) / 6 - 0.5) * scale;
      const dcy = ((j + 0.5) / 6 - 0.5) * scale;
      const fast = perturbIterations(reference, dcx, dcy, cap);
      const skipped = perturbIterations(reference, dcx, dcy, cap, skip);
      const [cx, cxLo] = ddAdd(target.x, target.xLo, dcx, 0);
      const [cy, cyLo] = ddAdd(target.y, target.yLo, dcy, 0);
      const exact = ddMandelbrotIterations(cx, cxLo, cy, cyLo, cap);
      if (fast === exact) same += 1;
      if (skipped === exact) sameSkipped += 1;
      distinct.add(fast);
    }
  }
  assert.ok(same >= 34, `${same} of 36 agree`);
  assert.ok(sameSkipped >= 34, `${sameSkipped} of 36 agree after the linear skip`);
  assert.ok(distinct.size > 6, "the frame still has structure");
});

test("the linear skip only reaches far when the plate is small next to the reference", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const reference = referenceOrbit(target.x, target.xLo, target.y, target.yLo, 4000);
  assert.equal(seriesSkip(reference, 0), 0);
  assert.ok(seriesSkip(reference, 0.1) < 4);
  const near = seriesSkip(reference, 1e-9);
  const deep = seriesSkip(reference, 1e-28);
  assert.ok(near >= 0 && near < 400, `shallow skip ${near}`);
  assert.ok(deep > 3000 && deep <= reference.count - 2, `deep skip ${deep}`);
  assert.equal(seriesSkip(reference, 1e-28), deep);
  const escaping = referenceOrbit(0.5, 0, 0.5, 0, 4000);
  assert.ok(escaping.count < 4000);
  assert.ok(seriesSkip(escaping, 1e-30) <= escaping.count - 2);
  assert.equal(perturbIterations(escaping, 1e-31, 0, 4000, seriesSkip(escaping, 1e-30)), perturbIterations(escaping, 1e-31, 0, 4000));
});

test("a deep plate spreads the palette over the iterations it holds, and a shallow one is unchanged", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const seahorse = presetById("mandelbrot", "seahorse");
  assert.deepEqual(paletteRange("mandelbrot", seahorse, 64, 36, 300), { floor: 0, top: 300 });
  assert.deepEqual(paletteRange("mandelbrot", { ...seahorse, centerXLo: 0, centerYLo: 0 }, 64, 36, 300), { floor: 0, top: 300 });
  assert.deepEqual(paletteRange("julia", { ...presetById("julia", "rabbit"), centerXLo: 0 }, 64, 36, 300), { floor: 0, top: 300 });
  const scale = 1e-24;
  const cap = autoZoomIterations(48, 2.6 / scale);
  const deep = { ...deepCenter(target, 0, 0), scale, flipY: false };
  const range = paletteRange("mandelbrot", deep, 64, 36, cap);
  const floor = range.floor;
  assert.ok(floor > cap * 0.6, `floor ${floor} sits well above zero for a cap of ${cap}`);
  assert.ok(floor < cap * 0.95);
  assert.ok(range.top > cap * 0.97 && range.top <= cap, `the ramp of a Mandelbrot plate runs nearly to the cap: ${range.top} of ${cap}`);
  assert.deepEqual(paletteRange("mandelbrot", deep, 64, 36, cap), range);
  const band = escapeBand("mandelbrot", deep, 64, 36, cap, 0, 36);
  const lowest = band.iterations.reduce((low, value) => Math.min(low, value), cap);
  assert.ok(lowest > floor * 0.9, `the lowest pixel ${lowest} is near the floor ${floor}`);
  const flat = paintEscape("ink", band.iterations, band.basins, 64, 36, cap, 36, cap);
  const spread = paintEscape("ink", band.iterations, band.basins, 64, 36, cap, 36, cap, floor);
  const inkRange = (pixels) => {
    let low = 255;
    let high = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (band.iterations[i / 4] >= cap) continue;
      low = Math.min(low, pixels[i]);
      high = Math.max(high, pixels[i]);
    }
    return high - low;
  };
  assert.ok(inkRange(spread) > inkRange(flat) * 3, `windowed range ${inkRange(spread)} vs flat ${inkRange(flat)}`);
  const inside = band.iterations.findIndex((value) => value >= cap);
  if (inside >= 0) assert.deepEqual([...spread.subarray(inside * 4, inside * 4 + 3)], [...flat.subarray(inside * 4, inside * 4 + 3)]);
  const plain = paintEscape("ink", Uint16Array.from([0, 5, 10]), Int8Array.from([-1, -1, -1]), 3, 1, 10, 1, 10);
  const same = paintEscape("ink", Uint16Array.from([0, 5, 10]), Int8Array.from([-1, -1, -1]), 3, 1, 10, 1, 10, 0);
  assert.deepEqual([...plain], [...same]);
  const lifted = paintEscape("ink", Uint16Array.from([0, 5, 10]), Int8Array.from([-1, -1, -1]), 3, 1, 10, 1, 10, 5);
  assert.deepEqual([...lifted.subarray(0, 3)], [...lifted.subarray(4, 7)]);
  assert.deepEqual([...lifted.subarray(8, 11)], [...plain.subarray(8, 11)]);
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
  assert.equal(autoZoomFloor("julia"), autoZoomFloor("mandelbrot"));
  assert.equal(autoZoomFloor("newton"), autoZoomFloor("mandelbrot"));
});

test("double-double division carries the quotient's second double", () => {
  const [hi, lo] = ddDiv(1, 0, 3, 0);
  assert.equal(hi, 1 / 3);
  assert.ok(Math.abs(lo) > 1e-18 && Math.abs(lo) < 1e-16);
  const [back, rest] = ddMul(hi, lo, 3, 0);
  assert.equal(back, 1);
  assert.ok(Math.abs(rest) < 1e-31);
  const [qhi, qlo] = ddDiv(1, 1e-20, 1, 0);
  assert.equal(qhi, 1);
  assert.ok(Math.abs(qlo - 1e-20) < 1e-35);
});

test("the double-double fold iteration agrees with the plain burning ship where doubles suffice", () => {
  let same = 0;
  let total = 0;
  for (let j = 0; j < 20; j += 1) {
    for (let i = 0; i < 20; i += 1) {
      const cx = -2.2 + (i / 19) * 3;
      const cy = -1.8 + (j / 19) * 2.6;
      const plain = escapeValue("burning", { flipY: true }, cx, cy, 300).iteration;
      const deep = ddEscapeIterations(0, 0, 0, 0, cx, 0, cy, 0, 300, true);
      total += 1;
      if (plain === deep) same += 1;
    }
  }
  assert.ok(same / total > 0.97, `${same} of ${total} agree`);
  assert.equal(ddEscapeIterations(0.3, 0, 0.5, 0, -0.123, 0, 0.745, 0, 100), escapeValue("julia", { cx: -0.123, cy: 0.745 }, 0.3, 0.5, 100).iteration);
});

test("every set's deep plate matches its plain plate in the shallow regime", () => {
  const cases = [
    ["julia", "rabbit", {}],
    ["julia", "siegel", {}],
    ["burning", "wreck", {}],
    ["burning", "ship", { cx: -1.76, cy: -0.03 }],
    ["newton", "pinch", {}],
    ["newton", "offset", { px: 0.1, py: -0.05 }],
  ];
  for (const [id, presetId, extra] of cases) {
    const preset = { ...presetById(id, presetId), ...extra };
    const width = 96;
    const height = 54;
    const cap = 300;
    const plain = escapeBand(id, preset, width, height, cap, 0, height);
    const deep = escapeBand(id, { ...preset, centerXLo: 0, centerYLo: 0 }, width, height, cap, 0, height);
    let same = 0;
    let sameBasin = 0;
    let inside = 0;
    for (let k = 0; k < plain.iterations.length; k += 1) {
      if (plain.iterations[k] === deep.iterations[k]) same += 1;
      if (plain.basins[k] === deep.basins[k]) sameBasin += 1;
      if (plain.iterations[k] >= cap) inside += 1;
    }
    const total = plain.iterations.length;
    assert.ok(same / total > 0.985, `${id} ${presetId}: ${same} of ${total} iterations agree`);
    assert.ok(sameBasin / total > 0.995, `${id} ${presetId}: ${sameBasin} of ${total} basins agree`);
    if (id === "julia" || presetId === "wreck") assert.ok(inside > 0, `${id} ${presetId} has an inside`);
    if (id === "newton") assert.ok(new Set(deep.basins).size === 3, `${id} ${presetId} shows three basins`);
  }
});

test("Julia perturbation rebases onto the critical orbit and matches double-double at depth", () => {
  const preset = presetById("julia", "rabbit");
  const near = juliaReference(1, 0, 1, 0, preset.cx, preset.cy, 200);
  assert.ok(near.count < 10);
  assert.notEqual(near.rebase, near);
  assert.equal(near.rebase.orbit[0], 0);
  assert.equal(perturbIterations(near, 2, 2, 200), 0);
  assert.equal(perturbIterations(near, -1, -1, 200), escapeValue("julia", preset, 0, 0, 200).iteration);
  const target = autoZoomTarget("julia", preset);
  const scale = 1e-20;
  const cap = autoZoomIterations(48, 3.2 / scale);
  const reference = juliaReference(target.x, target.xLo, target.y, target.yLo, preset.cx, preset.cy, cap);
  assert.equal(reference.inC, false);
  const skip = seriesSkip(reference, scale * Math.SQRT1_2);
  assert.ok(skip > 10 && skip < reference.count, `skips ${skip}`);
  let same = 0;
  let sameSkipped = 0;
  const distinct = new Set();
  for (let j = 0; j < 6; j += 1) {
    for (let i = 0; i < 6; i += 1) {
      const dx = ((i + 0.5) / 6 - 0.5) * scale;
      const dy = ((j + 0.5) / 6 - 0.5) * scale;
      const fast = perturbIterations(reference, dx, dy, cap);
      const skipped = perturbIterations(reference, dx, dy, cap, skip);
      const [zx, zxLo] = ddAdd(target.x, target.xLo, dx, 0);
      const [zy, zyLo] = ddAdd(target.y, target.yLo, dy, 0);
      const exact = ddEscapeIterations(zx, zxLo, zy, zyLo, preset.cx, 0, preset.cy, 0, cap);
      if (fast === exact) same += 1;
      if (skipped === exact) sameSkipped += 1;
      distinct.add(fast);
    }
  }
  assert.ok(same >= 34, `${same} of 36 agree`);
  assert.ok(sameSkipped >= 34, `${sameSkipped} of 36 agree after the linear skip`);
  assert.ok(distinct.size > 4, "the frame still has structure");
});

test("burning ship perturbation folds exactly and matches double-double at depth", () => {
  const target = autoZoomTarget("burning", presetById("burning", "ship"));
  assert.ok(hasDeepCenter({ centerXLo: target.xLo }));
  for (const scale of [1e-12, 1e-20]) {
    const cap = autoZoomIterations(48, 3.3 / scale);
    const reference = shipReference(target.x, target.xLo, target.y, target.yLo, cap);
    assert.equal(reference.fold, true);
    assert.equal(reference.series, null);
    assert.equal(seriesSkip(reference, scale), 0);
    let same = 0;
    const distinct = new Set();
    for (let j = 0; j < 6; j += 1) {
      for (let i = 0; i < 6; i += 1) {
        const dx = ((i + 0.5) / 6 - 0.5) * scale;
        const dy = ((j + 0.5) / 6 - 0.5) * scale;
        const fast = perturbIterations(reference, dx, dy, cap);
        const [cx, cxLo] = ddAdd(target.x, target.xLo, dx, 0);
        const [cy, cyLo] = ddAdd(target.y, target.yLo, dy, 0);
        if (fast === ddEscapeIterations(0, 0, 0, 0, cx, cxLo, cy, cyLo, cap, true)) same += 1;
        distinct.add(fast);
      }
    }
    assert.ok(same >= 35, `${same} of 36 agree at ${scale}`);
    assert.ok(distinct.size > 6, `the frame still has structure at ${scale}`);
  }
  const cursor = shipJuliaReference(0.2, 0, -0.3, 0, -1.76, -0.03, 300);
  assert.equal(cursor.inC, false);
  assert.equal(perturbIterations(cursor, 0.1, 0.1, 300), escapeValue("burning", { cx: -1.76, cy: -0.03 }, 0.3, -0.2, 300).iteration);
});

test("each dive target is held to double-double precision and sits where it should", () => {
  const rabbit = presetById("julia", "rabbit");
  const beta = ddJuliaBeta(rabbit.cx, rabbit.cy);
  assert.ok(Math.abs(beta.xLo) > 0 && Math.abs(beta.xLo) < 1e-15);
  const xx = ddMul(beta.x, beta.xLo, beta.x, beta.xLo);
  const yy = ddMul(beta.y, beta.yLo, beta.y, beta.yLo);
  const xy = ddMul(beta.x, beta.xLo, beta.y, beta.yLo);
  const re = ddSub(xx[0], xx[1], yy[0], yy[1]);
  const fx = ddAdd(...ddSub(re[0], re[1], beta.x, beta.xLo), rabbit.cx, 0);
  const fy = ddAdd(...ddSub(2 * xy[0], 2 * xy[1], beta.y, beta.yLo), rabbit.cy, 0);
  assert.ok(Math.abs(fx[0] + fx[1]) < 1e-30, `beta residual ${fx[0] + fx[1]}`);
  assert.ok(Math.abs(fy[0] + fy[1]) < 1e-30, `beta residual ${fy[0] + fy[1]}`);
  assert.deepEqual(ddJuliaBeta(0, 0), { x: 1, xLo: 0, y: 0, yLo: 0 });
  let previous = 0;
  for (const exponent of [8, 14, 20, 26]) {
    const [zx, zxLo] = ddAdd(beta.x, beta.xLo, 10 ** -exponent, 0);
    const escape = ddEscapeIterations(zx, zxLo, beta.y, beta.yLo, rabbit.cx, 0, rabbit.cy, 0, 5000);
    assert.ok(escape > previous && escape < 5000, `escape time rises toward beta at 1e-${exponent}`);
    previous = escape;
  }
  assert.deepEqual(ddNewtonPole(0, 0), { x: 0, xLo: 0, y: 0, yLo: 0 });
  const pole = ddNewtonPole(0.1, -0.05);
  const px = ddMul(pole.x, pole.xLo, pole.x, pole.xLo);
  const py = ddMul(pole.y, pole.yLo, pole.y, pole.yLo);
  const pxy = ddMul(pole.x, pole.xLo, pole.y, pole.yLo);
  const gx = ddAdd(...ddMul(...ddSub(px[0], px[1], py[0], py[1]), 3, 0), 0.1, 0);
  const gy = ddAdd(...ddMul(pxy[0], pxy[1], 6, 0), -0.05, 0);
  assert.ok(Math.abs(gx[0] + gx[1]) < 1e-30 && Math.abs(gy[0] + gy[1]) < 1e-30, "the pole is a root of 3z² + p");
  assert.deepEqual(autoZoomTarget("newton", { px: 0.1, py: -0.05 }), pole);
  assert.deepEqual(autoZoomTarget("julia", rabbit), beta);
});

test("a deep Newton pixel starts in double-double only while doubles could not tell it apart", () => {
  const origin = ddNewtonStart(1e-20, 0, 2e-20, 0, 0, 0, 1e-22, 48);
  assert.equal(origin.steps, 0, "offsets from an exact zero are already plain doubles");
  const far = ddNewtonStart(0.5, 0, 0.5, 0, 0, 0, 1e-3, 48);
  assert.equal(far.steps, 0);
  assert.deepEqual([far.x, far.y], [0.5, 0.5]);
  const bent = autoZoomTarget("newton", { px: 0.1, py: -0.05 });
  const [bx, bxLo] = ddAdd(bent.x, bent.xLo, 3e-21, 0);
  const near = ddNewtonStart(bx, bxLo, bent.y, bent.yLo, 0.1, -0.05, 1e-22, 48);
  assert.equal(near.steps, 1);
  assert.ok(Math.hypot(near.x, near.y) > 1e17, "one step near the pole throws the orbit far out");
  const [nx, nxLo] = ddAdd(bent.x, bent.xLo, 3.1e-21, 0);
  const next = ddNewtonStart(nx, nxLo, bent.y, bent.yLo, 0.1, -0.05, 1e-22, 48);
  assert.ok(Math.hypot(next.x - near.x, next.y - near.y) > 1e15, "neighboring pixels land apart");
  const pole = autoZoomTarget("newton", {});
  const scale = 1e-20;
  const cap = autoZoomIterations(16, 3.4 / scale);
  const deep = { ...deepCenter(pole, 0, 0), scale, flipY: false };
  const band = escapeBand("newton", deep, 48, 27, cap, 0, 27);
  assert.deepEqual([...new Set(band.basins)].sort(), [0, 1, 2]);
  assert.ok(band.iterations.every((value) => value > 60 && value < cap));
  const plain = escapeBand("newton", { centerX: bent.x + bent.xLo, centerY: bent.y + bent.yLo, scale: 1e-8, flipY: false, px: 0.1, py: -0.05 }, 64, 36, 400, 0, 36);
  const dd = escapeBand("newton", { ...deepCenter(bent, 0, 0), scale: 1e-8, flipY: false, px: 0.1, py: -0.05 }, 64, 36, 400, 0, 36);
  assert.deepEqual([...dd.basins], [...plain.basins]);
  assert.deepEqual([...dd.iterations], [...plain.iterations]);
});

test("the palette window fits a crowded plate and leaves a wide or shallow one alone", () => {
  assert.deepEqual(paletteWindow([0, 50, 100, 150, 200], 200), { floor: 0, top: 200 });
  assert.deepEqual(paletteWindow([], 200), { floor: 0, top: 200 });
  const crowded = [];
  for (let i = 0; i < 100; i += 1) crowded.push(40 + (i % 10));
  const fitted = paletteWindow(crowded, 6000);
  assert.ok(fitted.floor > 20 && fitted.floor < 40, `floor ${fitted.floor}`);
  assert.ok(fitted.top > 49 && fitted.top < 70, `top ${fitted.top}`);
  const withInside = paletteWindow([...crowded, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000], 6000);
  assert.deepEqual(withInside, fitted);
  assert.deepEqual(paletteWindow(crowded, 6000, 0), { floor: 0, top: 6000 });
  const half = paletteWindow(crowded, 6000, 0.5);
  assert.ok(half.floor > 0 && half.floor < fitted.floor);
  assert.ok(half.top > fitted.top && half.top < 6000);
  const nearCap = [];
  for (let i = 0; i < 100; i += 1) nearCap.push(5000 + i * 8);
  assert.equal(paletteWindow(nearCap, 6000).top, 6000);
  assert.ok(paletteWindow(nearCap, 6000).floor > 4000);
  const rabbit = presetById("julia", "rabbit");
  const beta = autoZoomTarget("julia", rabbit);
  assert.deepEqual(paletteRange("julia", { ...rabbit, ...deepCenter(beta, 0, 0) }, 64, 36, 48), { floor: 0, top: 48 });
  const deep = paletteRange("julia", { ...rabbit, ...deepCenter(beta, 0, 0), scale: 1e-20 }, 64, 36, 6000);
  assert.ok(deep.floor > 10 && deep.top < 200, `deep Julia window ${deep.floor}..${deep.top}`);
  const painted = paintEscape("ink", Uint16Array.from([30, 50, 70, 6000]), Int8Array.from([-1, -1, -1, -1]), 4, 1, 6000, 1, 6000, deep.floor, deep.top);
  const flat = paintEscape("ink", Uint16Array.from([30, 50, 70, 6000]), Int8Array.from([-1, -1, -1, -1]), 4, 1, 6000, 1, 6000);
  assert.notDeepEqual([...painted.subarray(4, 7)], [...flat.subarray(4, 7)]);
  assert.deepEqual([...painted.subarray(12, 15)], [...flat.subarray(12, 15)]);
  const capped = paintEscape("ink", Uint16Array.from([70, 200, 300]), Int8Array.from([-1, -1, -1]), 3, 1, 6000, 1, 6000, 0, 200);
  assert.deepEqual([...capped.subarray(4, 7)], [...capped.subarray(8, 11)]);
});

test("a shown palette window eases toward a new fit instead of jumping to it", () => {
  const whole = { floor: 0, top: 640 };
  const fitted = { floor: 8, top: 215 };
  assert.deepEqual(easeWindow(null, fitted), fitted);
  const first = easeWindow(whole, fitted);
  assert.ok(first.top < 640 && first.top > 500, `one frame moves the top a little: ${first.top}`);
  assert.ok(first.floor >= 0 && first.floor < 8, `floor ${first.floor}`);
  const tops = [whole.top];
  let shown = whole;
  for (let frame = 0; frame < 200 && (shown.floor !== fitted.floor || shown.top !== fitted.top); frame += 1) {
    shown = easeWindow(shown, fitted);
    assert.ok(shown.top > shown.floor);
    tops.push(shown.top);
  }
  assert.deepEqual(shown, fitted);
  for (let i = 1; i < tops.length; i += 1) {
    assert.ok(tops[i] <= tops[i - 1] && tops[i] >= fitted.top, "the top never overshoots");
    assert.ok(Math.abs(Math.log(tops[i] / tops[i - 1])) < 0.2, `no frame jumps: ${tops[i - 1]} -> ${tops[i]}`);
  }
  const back = easeWindow(fitted, whole);
  assert.ok(back.top > 215 && back.top < 300 && back.floor <= 8, `easing back ${back.floor}..${back.top}`);
});

test("the auto zoom path lands on the Julia, Newton, and burning ship targets", () => {
  const cases = [
    ["julia", presetById("julia", "siegel")],
    ["newton", { ...presetById("newton", "pinch"), px: 0.1, py: -0.05 }],
    ["burning", presetById("burning", "wreck")],
  ];
  for (const [id, preset] of cases) {
    const target = autoZoomTarget(id, preset);
    const path = autoZoomPath(preset, target, autoZoomFloor(id, preset));
    assert.ok(path.maxOctave > 85, `${id} dives past 85 octaves`);
    const deep = autoZoomView(path, 80);
    assert.ok(hasDeepCenter(deep));
    const miss = viewOffset(deep, deepCenter(target, 0, 0));
    assert.ok(Math.abs(miss.dx) < 1e-31 && Math.abs(miss.dy) < 1e-31, `${id} lands on its target`);
  }
  const cursor = { ...presetById("burning", "ship"), cx: -1.76, cy: -0.03 };
  const edge = autoZoomTarget("burning", cursor);
  assert.equal(hasDeepCenter({ centerXLo: edge.xLo }), false);
  const shallow = autoZoomPath(cursor, edge, autoZoomFloor("burning", cursor));
  assert.ok(shallow.maxOctave < 20);
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

test("a Newton reference orbit follows the method in double-double and stops where it must", () => {
  const plain = newtonReference(0.3, 0, 0.4, 0, 0, 0, 200);
  let x = 0.3;
  let y = 0.4;
  for (let n = 0; n < 4; n += 1) {
    assert.ok(Math.abs(plain.orbit[n * 2] - x) < 1e-12);
    assert.ok(Math.abs(plain.orbit[n * 2 + 1] - y) < 1e-12);
    const d2x = 3 * (x * x - y * y);
    const d2y = 6 * x * y;
    assert.ok(Math.abs(plain.denom[n * 2] - d2x) < 1e-12);
    assert.ok(Math.abs(plain.denom[n * 2 + 1] - d2y) < 1e-12);
    const fx = x * x * x - 3 * x * y * y - 1;
    const fy = 3 * x * x * y - y * y * y;
    const q = d2x * d2x + d2y * d2y;
    x -= (fx * d2x + fy * d2y) / q;
    y -= (fy * d2x - fx * d2y) / q;
  }
  assert.ok(plain.count > 4 && plain.count < 200, "a converged reference stops early");
  const lastX = plain.orbit[(plain.count - 1) * 2];
  const lastY = plain.orbit[(plain.count - 1) * 2 + 1];
  const nearRoot = [[1, 0], [-0.5, Math.sqrt(3) / 2], [-0.5, -Math.sqrt(3) / 2]].some(
    ([rx, ry]) => Math.hypot(lastX - rx, lastY - ry) < 1e-9,
  );
  assert.ok(nearRoot);

  const pole = ddNewtonPole(0.1, -0.05);
  const atPole = newtonReference(pole.x, pole.xLo, pole.y, pole.yLo, 0.1, -0.05, 200);
  assert.equal(atPole.count, 1, "the pole has no next step");
  assert.ok(Math.hypot(atPole.denom[0], atPole.denom[1]) < 1e-25);

  const short = newtonReference(-0.625, 0, -0.2551, 0, 0, 0, 3);
  assert.equal(short.count, 4);
});
