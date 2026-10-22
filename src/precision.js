/**
 * Double-double arithmetic and perturbation for the Mandelbrot set.
 *
 * A number is held as an unevaluated sum hi + lo of two doubles, which gives about 32 significant
 * digits. The camera center and the plate center are kept this way, and `scale` stays a plain
 * double because it only needs range, not precision. Pixels are iterated as small offsets from a
 * reference orbit computed at the plate center, so each pixel costs the same as a plain iteration.
 */

const SPLITTER = 134217729; // 2^27 + 1

function twoSum(a, b) {
  const s = a + b;
  const v = s - a;
  return [s, a - (s - v) + (b - v)];
}

function quickTwoSum(a, b) {
  const s = a + b;
  return [s, b - (s - a)];
}

function split(a) {
  const t = SPLITTER * a;
  const hi = t - (t - a);
  return [hi, a - hi];
}

function twoProd(a, b) {
  const p = a * b;
  const [ahi, alo] = split(a);
  const [bhi, blo] = split(b);
  return [p, ahi * bhi - p + ahi * blo + alo * bhi + alo * blo];
}

export function ddAdd(ahi, alo, bhi, blo) {
  const [s, e] = twoSum(ahi, bhi);
  return quickTwoSum(s, e + alo + blo);
}

export function ddSub(ahi, alo, bhi, blo) {
  return ddAdd(ahi, alo, -bhi, -blo);
}

export function ddMul(ahi, alo, bhi, blo) {
  const [p, e] = twoProd(ahi, bhi);
  return quickTwoSum(p, e + ahi * blo + alo * bhi);
}

/** Escape time of c = (cx + cxLo) + i(cy + cyLo) iterated in double-double. */
export function ddMandelbrotIterations(cx, cxLo, cy, cyLo, maxIter) {
  let xhi = 0;
  let xlo = 0;
  let yhi = 0;
  let ylo = 0;
  let iter = 0;
  while (iter < maxIter) {
    const xx = ddMul(xhi, xlo, xhi, xlo);
    const yy = ddMul(yhi, ylo, yhi, ylo);
    if (xx[0] + yy[0] > 4) return iter;
    const xy = ddMul(xhi, xlo, yhi, ylo);
    const re = ddSub(xx[0], xx[1], yy[0], yy[1]);
    const next = ddAdd(re[0], re[1], cx, cxLo);
    const im = ddAdd(2 * xy[0], 2 * xy[1], cy, cyLo);
    xhi = next[0];
    xlo = next[1];
    yhi = im[0];
    ylo = im[1];
    iter += 1;
  }
  return iter;
}

let cachedOrbit = null;

/** Largest offset, relative to the reference, at which its square is still dropped. */
const SERIES_TOLERANCE = 1e-8;

/**
 * The orbit of the reference point, Z_0 = 0, Z_1 = C, ..., iterated in double-double and stored
 * as doubles. It stops after the first escaped term, since a pixel that outlives the reference
 * rebases onto the start of the orbit. The last orbit is kept, as one plate asks for it per band.
 *
 * While a pixel's offset is tiny next to the reference, it grows linearly: δ_n = B_n · dc with
 * B_{n+1} = 2 Z_n B_n + 1. `series` holds B_n and `reach` the largest |B_k| / |Z_k| up to n, which
 * says how big an offset may be for the linear step to n to hold.
 */
export function referenceOrbit(cx, cxLo, cy, cyLo, maxIter) {
  const cap = Math.max(1, maxIter | 0);
  const cached = cachedOrbit;
  if (cached && cached.cx === cx && cached.cxLo === cxLo && cached.cy === cy && cached.cyLo === cyLo && cached.cap === cap) {
    return cached;
  }
  const orbit = new Float64Array((cap + 1) * 2);
  const series = new Float64Array((cap + 1) * 2);
  const reach = new Float64Array(cap + 1);
  let xhi = 0;
  let xlo = 0;
  let yhi = 0;
  let ylo = 0;
  let count = 1;
  for (let n = 1; n <= cap; n += 1) {
    const zx = orbit[n * 2 - 2];
    const zy = orbit[n * 2 - 1];
    const bx = series[n * 2 - 2];
    const by = series[n * 2 - 1];
    series[n * 2] = 2 * (zx * bx - zy * by) + 1;
    series[n * 2 + 1] = 2 * (zx * by + zy * bx);
    const xx = ddMul(xhi, xlo, xhi, xlo);
    const yy = ddMul(yhi, ylo, yhi, ylo);
    const xy = ddMul(xhi, xlo, yhi, ylo);
    const re = ddSub(xx[0], xx[1], yy[0], yy[1]);
    const next = ddAdd(re[0], re[1], cx, cxLo);
    const im = ddAdd(2 * xy[0], 2 * xy[1], cy, cyLo);
    xhi = next[0];
    xlo = next[1];
    yhi = im[0];
    ylo = im[1];
    orbit[n * 2] = xhi + xlo;
    orbit[n * 2 + 1] = yhi + ylo;
    const size = Math.hypot(orbit[n * 2], orbit[n * 2 + 1]);
    const ratio = size > 0 ? Math.hypot(series[n * 2], series[n * 2 + 1]) / size : Infinity;
    reach[n] = Math.max(reach[n - 1], ratio);
    count = n + 1;
    if (xhi * xhi + yhi * yhi > 4) break;
  }
  const result = { orbit, series, reach, count, cx, cxLo, cy, cyLo, cap };
  cachedOrbit = result;
  return result;
}

/**
 * How many iterations every pixel within `radius` of the reference may take in one linear step.
 * Zero when the plate is wide enough that offsets matter from the start.
 */
export function seriesSkip(reference, radius) {
  if (!(radius > 0)) return 0;
  if (reference.skipRadius === radius) return reference.skip;
  const reach = reference.reach;
  const limit = reference.count - 2;
  let skip = 0;
  while (skip < limit && reach[skip + 1] * radius <= SERIES_TOLERANCE) skip += 1;
  reference.skipRadius = radius;
  reference.skip = skip;
  return skip;
}

/**
 * Escape time of the pixel at offset (dcx, dcy) from the reference point.
 * The offset from the reference orbit is iterated in plain doubles, and whenever the pixel's own
 * orbit comes closer to the origin than its offset, or the reference runs out, the pixel becomes
 * its own reference from Z_0 again. That rebasing keeps the offset small, so no glitches appear.
 * `skip` iterations, from seriesSkip, are taken at once as a linear step.
 */
export function perturbIterations(reference, dcx, dcy, maxIter, skip = 0) {
  const orbit = reference.orbit;
  const last = reference.count - 1;
  let dx = 0;
  let dy = 0;
  let m = 0;
  let iter = 0;
  if (skip > 0 && skip < maxIter && skip < last) {
    const bx = reference.series[skip * 2];
    const by = reference.series[skip * 2 + 1];
    dx = bx * dcx - by * dcy;
    dy = bx * dcy + by * dcx;
    m = skip;
    iter = skip;
  }
  while (iter < maxIter) {
    const zrx = orbit[m * 2];
    const zry = orbit[m * 2 + 1];
    const nx = 2 * (zrx * dx - zry * dy) + (dx * dx - dy * dy) + dcx;
    const ny = 2 * (zrx * dy + zry * dx) + 2 * dx * dy + dcy;
    dx = nx;
    dy = ny;
    m += 1;
    iter += 1;
    const zx = orbit[m * 2] + dx;
    const zy = orbit[m * 2 + 1] + dy;
    const zz = zx * zx + zy * zy;
    if (zz > 4) return iter;
    if (m >= last || zz < dx * dx + dy * dy) {
      dx = zx;
      dy = zy;
      m = 0;
    }
  }
  return iter;
}

/**
 * The iteration below which a plate's coloring is clamped. Deep in the set every pixel escapes
 * within a few percent of the cap, so the palette is spread over the range the plate actually
 * holds, judged from a coarse grid of samples: the ramp starts a little under their fifth
 * percentile. Shallow plates reach zero and are unchanged.
 */
export function plateFloor(reference, spanX, spanY, maxIter) {
  const cap = Math.max(1, maxIter | 0);
  const key = `${spanX}:${spanY}:${cap}`;
  if (reference.floorKey === key) return reference.floor;
  const cells = 12;
  const skip = seriesSkip(reference, Math.hypot(spanX, spanY) / 2);
  const samples = [];
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      samples.push(perturbIterations(reference, ((i + 0.5) / cells - 0.5) * spanX, ((j + 0.5) / cells - 0.5) * spanY, cap, skip));
    }
  }
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(samples.length * 0.05)];
  const window = Math.max(cap - low, cap * 0.05);
  const floor = Math.max(0, Math.round(cap - window * 1.1));
  reference.floorKey = key;
  reference.floor = floor;
  return floor;
}

/** True when a view or preset carries a double-double center. */
export function hasDeepCenter(view) {
  return Boolean(view) && (typeof view.centerXLo === "number" || typeof view.centerYLo === "number");
}

/** The vector from `b`'s center to `a`'s center as doubles, exact to the precision of the centers. */
export function viewOffset(a, b) {
  const dx = ddSub(a.centerX, a.centerXLo || 0, b.centerX, b.centerXLo || 0);
  const dy = ddSub(a.centerY, a.centerYLo || 0, b.centerY, b.centerYLo || 0);
  return { dx: dx[0] + dx[1], dy: dy[0] + dy[1] };
}

/**
 * A copy of `view` whose center has moved by (dx, dy). A double-double center stays double-double,
 * and a plain one stays plain, so fractals that never dive deep are unchanged.
 */
export function shiftView(view, dx, dy) {
  if (!hasDeepCenter(view)) {
    return { ...view, centerX: view.centerX + dx, centerY: view.centerY + dy };
  }
  const x = ddAdd(view.centerX, view.centerXLo || 0, dx, 0);
  const y = ddAdd(view.centerY, view.centerYLo || 0, dy, 0);
  return { ...view, centerX: x[0], centerXLo: x[1], centerY: y[0], centerYLo: y[1] };
}

/** A point target {x, y, xLo, yLo} moved by a plain double vector, as a view center. */
export function deepCenter(target, dx, dy) {
  const x = ddAdd(target.x, target.xLo || 0, dx, 0);
  const y = ddAdd(target.y, target.yLo || 0, dy, 0);
  return { centerX: x[0], centerXLo: x[1], centerY: y[0], centerYLo: y[1] };
}
