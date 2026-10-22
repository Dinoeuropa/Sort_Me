/**
 * Double-double arithmetic and perturbation for the escape-time sets.
 *
 * A number is held as an unevaluated sum hi + lo of two doubles, which gives about 32 significant
 * digits. The camera center and the plate center are kept this way, and `scale` stays a plain
 * double because it only needs range, not precision. Pixels are iterated as small offsets from a
 * reference orbit computed at the plate center, so each pixel costs the same as a plain iteration.
 * The Mandelbrot set and the burning ship perturb c; a Julia set perturbs z with c shared.
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

/** One Newton correction on the plain quotient, which is enough for the second double. */
export function ddDiv(ahi, alo, bhi, blo) {
  const q1 = ahi / bhi;
  const [phi, plo] = ddMul(bhi, blo, q1, 0);
  const [rhi, rlo] = ddSub(ahi, alo, phi, plo);
  const q2 = (rhi + rlo) / bhi;
  return quickTwoSum(q1, q2);
}

/** Escape time of c = (cx + cxLo) + i(cy + cyLo) iterated in double-double. */
export function ddMandelbrotIterations(cx, cxLo, cy, cyLo, maxIter) {
  return ddEscapeIterations(0, 0, 0, 0, cx, cxLo, cy, cyLo, maxIter, false);
}

/**
 * Escape time of z iterated under z² + c, or under the burning ship's fold of both axes before
 * squaring, with every number a double-double. The slow path the perturbation is checked against.
 */
export function ddEscapeIterations(zx, zxLo, zy, zyLo, cx, cxLo, cy, cyLo, maxIter, fold = false) {
  let xhi = zx;
  let xlo = zxLo;
  let yhi = zy;
  let ylo = zyLo;
  let iter = 0;
  while (iter < maxIter) {
    if (fold) {
      if (xhi < 0) {
        xhi = -xhi;
        xlo = -xlo;
      }
      if (yhi < 0) {
        yhi = -yhi;
        ylo = -ylo;
      }
    }
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

const ORBIT_CACHE_SIZE = 6;
const orbitCache = new Map();

/** Largest offset, relative to the reference, at which its square is still dropped. */
const SERIES_TOLERANCE = 1e-8;

/**
 * The orbit of a reference point iterated in double-double and stored as doubles. It stops after
 * the first escaped term, since a pixel that outlives it rebases onto the start of an orbit.
 * `inC` marks a reference whose pixels differ in c (Mandelbrot, burning ship) rather than in z
 * (Julia), and `rebase` is the orbit a pixel moves onto when its own orbit nears the origin: the
 * critical orbit, which is the reference itself when the reference starts at zero.
 *
 * While a pixel's offset is tiny next to the reference, it grows linearly: δ_n = B_n · u with
 * B_{n+1} = 2 Z_n B_n + 1 for an offset in c and B_{n+1} = 2 Z_n B_n for an offset in z.
 * `series` holds B_n and `reach` the largest |B_k| / |Z_k| up to n, which says how big an offset
 * may be for the linear step to n to hold. The fold has no such series.
 * The last few orbits are kept, as one plate asks for them once per band.
 */
function orbitOf(zx, zxLo, zy, zyLo, cx, cxLo, cy, cyLo, maxIter, fold, inC) {
  const cap = Math.max(1, maxIter | 0);
  const key = `${fold ? "f" : "s"}${inC ? "c" : "z"}:${zx}:${zxLo}:${zy}:${zyLo}:${cx}:${cxLo}:${cy}:${cyLo}:${cap}`;
  const cached = orbitCache.get(key);
  if (cached) return cached;
  const orbit = new Float64Array((cap + 1) * 2);
  const series = fold ? null : new Float64Array((cap + 1) * 2);
  const reach = fold ? null : new Float64Array(cap + 1);
  let xhi = zx;
  let xlo = zxLo;
  let yhi = zy;
  let ylo = zyLo;
  orbit[0] = xhi + xlo;
  orbit[1] = yhi + ylo;
  if (series) {
    series[0] = inC ? 0 : 1;
    const size = Math.hypot(orbit[0], orbit[1]);
    reach[0] = inC ? 0 : size > 0 ? 1 / size : Infinity;
  }
  let count = 1;
  for (let n = 1; n <= cap; n += 1) {
    if (series) {
      const px = orbit[n * 2 - 2];
      const py = orbit[n * 2 - 1];
      const bx = series[n * 2 - 2];
      const by = series[n * 2 - 1];
      series[n * 2] = 2 * (px * bx - py * by) + (inC ? 1 : 0);
      series[n * 2 + 1] = 2 * (px * by + py * bx);
    }
    if (fold) {
      if (xhi < 0) {
        xhi = -xhi;
        xlo = -xlo;
      }
      if (yhi < 0) {
        yhi = -yhi;
        ylo = -ylo;
      }
    }
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
    if (series) {
      const size = Math.hypot(orbit[n * 2], orbit[n * 2 + 1]);
      const ratio = size > 0 ? Math.hypot(series[n * 2], series[n * 2 + 1]) / size : Infinity;
      reach[n] = Math.max(reach[n - 1], ratio);
    }
    count = n + 1;
    if (xhi * xhi + yhi * yhi > 4) break;
  }
  const result = { orbit, series, reach, count, cap, fold, inC, rebase: null };
  result.rebase = zx === 0 && zxLo === 0 && zy === 0 && zyLo === 0
    ? result
    : orbitOf(0, 0, 0, 0, cx, cxLo, cy, cyLo, cap, fold, inC);
  if (orbitCache.size >= ORBIT_CACHE_SIZE) orbitCache.delete(orbitCache.keys().next().value);
  orbitCache.set(key, result);
  return result;
}

/** The Mandelbrot reference: the orbit of zero under z² + c for a double-double c. */
export function referenceOrbit(cx, cxLo, cy, cyLo, maxIter) {
  return orbitOf(0, 0, 0, 0, cx, cxLo, cy, cyLo, maxIter, false, true);
}

/** A Julia reference: the orbit of the double-double plate center under z² + c, c a plain double. */
export function juliaReference(zx, zxLo, zy, zyLo, cx, cy, maxIter) {
  return orbitOf(zx, zxLo, zy, zyLo, cx, 0, cy, 0, maxIter, false, false);
}

/** The burning ship reference: the orbit of zero under the fold map for a double-double c. */
export function shipReference(cx, cxLo, cy, cyLo, maxIter) {
  return orbitOf(0, 0, 0, 0, cx, cxLo, cy, cyLo, maxIter, true, true);
}

/** A burning ship with c fixed by the cursor: the orbit of the double-double plate center. */
export function shipJuliaReference(zx, zxLo, zy, zyLo, cx, cy, maxIter) {
  return orbitOf(zx, zxLo, zy, zyLo, cx, 0, cy, 0, maxIter, true, false);
}

/**
 * How many iterations every pixel within `radius` of the reference may take in one linear step.
 * Zero when the plate is wide enough that offsets matter from the start, and for the fold.
 */
export function seriesSkip(reference, radius) {
  if (!(radius > 0) || !reference.series) return 0;
  if (reference.skipRadius === radius) return reference.skip;
  const reach = reference.reach;
  const limit = reference.count - 2;
  let skip = 0;
  while (skip < limit && reach[skip + 1] * radius <= SERIES_TOLERANCE) skip += 1;
  reference.skipRadius = radius;
  reference.skip = skip;
  return skip;
}

/** |x + d| − |x|, exact in each case, so a fold near the axis does not cancel. */
function diffAbs(x, d) {
  if (x >= 0) return x + d >= 0 ? d : -(2 * x + d);
  return x + d > 0 ? 2 * x + d : -d;
}

/**
 * Escape time of the pixel at offset (ux, uy) from the reference point: an offset in c for the
 * Mandelbrot set and the burning ship, in z for a Julia set.
 * The offset from the reference orbit is iterated in plain doubles, and whenever the pixel's own
 * orbit comes closer to the origin than its offset, or the reference runs out, the pixel becomes
 * an offset from the start of the critical orbit. That rebasing keeps the offset small, so no
 * glitches appear. `skip` iterations, from seriesSkip, are taken at once as a linear step.
 */
export function perturbIterations(reference, ux, uy, maxIter, skip = 0) {
  const inC = reference.inC;
  const fold = reference.fold;
  const dcx = inC ? ux : 0;
  const dcy = inC ? uy : 0;
  let orbit = reference.orbit;
  let last = reference.count - 1;
  let dx = inC ? 0 : ux;
  let dy = inC ? 0 : uy;
  let m = 0;
  let iter = 0;
  if (!inC) {
    const zx0 = orbit[0] + dx;
    const zy0 = orbit[1] + dy;
    if (zx0 * zx0 + zy0 * zy0 > 4) return 0;
  }
  if (skip > 0 && skip < maxIter && skip < last && reference.series) {
    const bx = reference.series[skip * 2];
    const by = reference.series[skip * 2 + 1];
    dx = bx * ux - by * uy;
    dy = bx * uy + by * ux;
    m = skip;
    iter = skip;
  }
  while (iter < maxIter) {
    const zrx = orbit[m * 2];
    const zry = orbit[m * 2 + 1];
    let nx;
    let ny;
    if (fold) {
      const ax = Math.abs(zrx);
      const ay = Math.abs(zry);
      const da = diffAbs(zrx, dx);
      const db = diffAbs(zry, dy);
      nx = 2 * (ax * da - ay * db) + (da * da - db * db) + dcx;
      ny = 2 * (ax * db + ay * da + da * db) + dcy;
    } else {
      nx = 2 * (zrx * dx - zry * dy) + (dx * dx - dy * dy) + dcx;
      ny = 2 * (zrx * dy + zry * dx) + 2 * dx * dy + dcy;
    }
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
      orbit = reference.rebase.orbit;
      last = reference.rebase.count - 1;
    }
  }
  return iter;
}

/**
 * Newton's method for z³ + p z − 1 from a double-double start, for as long as a plain double
 * could not tell neighboring pixels apart. `pixel` is the distance between pixel samples, and the
 * derivative of the orbit with respect to the start says how far apart they have spread. Near a
 * pole one step throws the orbit far out, and from there doubles carry every digit that matters.
 * Returns the point to continue from in doubles and the steps taken.
 */
export function ddNewtonStart(zx, zxLo, zy, zyLo, px, py, pixel, maxSteps) {
  let xhi = zx;
  let xlo = zxLo;
  let yhi = zy;
  let ylo = zyLo;
  let gx = 1;
  let gy = 0;
  let steps = 0;
  while (steps < maxSteps) {
    const x = xhi + xlo;
    const y = yhi + ylo;
    if (Math.hypot(gx, gy) * pixel > 1e-13 * Math.hypot(x, y)) break;
    const xx = ddMul(xhi, xlo, xhi, xlo);
    const yy = ddMul(yhi, ylo, yhi, ylo);
    const xy = ddMul(xhi, xlo, yhi, ylo);
    const x2 = ddSub(xx[0], xx[1], yy[0], yy[1]);
    const y2 = [2 * xy[0], 2 * xy[1]];
    const x2x = ddMul(x2[0], x2[1], xhi, xlo);
    const y2y = ddMul(y2[0], y2[1], yhi, ylo);
    const x2y = ddMul(x2[0], x2[1], yhi, ylo);
    const y2x = ddMul(y2[0], y2[1], xhi, xlo);
    const x3 = ddSub(x2x[0], x2x[1], y2y[0], y2y[1]);
    const y3 = ddAdd(x2y[0], x2y[1], y2x[0], y2x[1]);
    const pxx = ddMul(xhi, xlo, px, 0);
    const pyy = ddMul(yhi, ylo, py, 0);
    const pxy = ddMul(yhi, ylo, px, 0);
    const pyx = ddMul(xhi, xlo, py, 0);
    const bend = ddSub(pxx[0], pxx[1], pyy[0], pyy[1]);
    const bendIm = ddAdd(pxy[0], pxy[1], pyx[0], pyx[1]);
    const fxa = ddAdd(x3[0], x3[1], bend[0], bend[1]);
    const fx = ddAdd(fxa[0], fxa[1], -1, 0);
    const fy = ddAdd(y3[0], y3[1], bendIm[0], bendIm[1]);
    const x2t = ddMul(x2[0], x2[1], 3, 0);
    const y2t = ddMul(y2[0], y2[1], 3, 0);
    const dx = ddAdd(x2t[0], x2t[1], px, 0);
    const dy = ddAdd(y2t[0], y2t[1], py, 0);
    const dxx = ddMul(dx[0], dx[1], dx[0], dx[1]);
    const dyy = ddMul(dy[0], dy[1], dy[0], dy[1]);
    const denom = ddAdd(dxx[0], dxx[1], dyy[0], dyy[1]);
    if (!(denom[0] > 0) || denom[0] === Infinity) break;
    const fxdx = ddMul(fx[0], fx[1], dx[0], dx[1]);
    const fydy = ddMul(fy[0], fy[1], dy[0], dy[1]);
    const fydx = ddMul(fy[0], fy[1], dx[0], dx[1]);
    const fxdy = ddMul(fx[0], fx[1], dy[0], dy[1]);
    const numX = ddAdd(fxdx[0], fxdx[1], fydy[0], fydy[1]);
    const numY = ddSub(fydx[0], fydx[1], fxdy[0], fxdy[1]);
    const stepX = ddDiv(numX[0], numX[1], denom[0], denom[1]);
    const stepY = ddDiv(numY[0], numY[1], denom[0], denom[1]);
    // N'(z) = f f'' / f'², with f'' = 6z, in doubles for the spread of neighboring pixels.
    const fr = fx[0];
    const fi = fy[0];
    const sr = 6 * (fr * x - fi * y);
    const si = 6 * (fr * y + fi * x);
    const dr = dx[0] * dx[0] - dy[0] * dy[0];
    const di = 2 * dx[0] * dy[0];
    const dd = dr * dr + di * di;
    const nr = (sr * dr + si * di) / dd;
    const ni = (si * dr - sr * di) / dd;
    const ngx = nr * gx - ni * gy;
    const ngy = nr * gy + ni * gx;
    gx = ngx;
    gy = ngy;
    const nextX = ddSub(xhi, xlo, stepX[0], stepX[1]);
    const nextY = ddSub(yhi, ylo, stepY[0], stepY[1]);
    xhi = nextX[0];
    xlo = nextX[1];
    yhi = nextY[0];
    ylo = nextY[1];
    steps += 1;
  }
  return { x: xhi + xlo, y: yhi + ylo, steps };
}

/**
 * The repelling fixed point β = (1 + √(1 − 4c)) / 2 of z² + c, polished to double-double by one
 * Newton step on β² − β + c, whose residual is formed in double-double.
 */
export function ddJuliaBeta(cx, cy) {
  const re = 1 - 4 * cx;
  const im = -4 * cy;
  const mag = Math.hypot(re, im);
  const rootRe = Math.sqrt((mag + re) / 2);
  const rootIm = (im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (mag - re) / 2));
  const bx = (1 + rootRe) / 2;
  const by = rootIm / 2;
  const xx = ddMul(bx, 0, bx, 0);
  const yy = ddMul(by, 0, by, 0);
  const xy = ddMul(bx, 0, by, 0);
  const sq = ddSub(xx[0], xx[1], yy[0], yy[1]);
  const sqx = ddSub(sq[0], sq[1], bx, 0);
  const sqy = ddSub(2 * xy[0], 2 * xy[1], by, 0);
  const rx = ddAdd(sqx[0], sqx[1], cx, 0);
  const ry = ddAdd(sqy[0], sqy[1], cy, 0);
  const dr = 2 * bx - 1;
  const di = 2 * by;
  const dd = dr * dr + di * di;
  if (!(dd > 1e-12)) return { x: bx, xLo: 0, y: by, yLo: 0 };
  const resX = rx[0] + rx[1];
  const resY = ry[0] + ry[1];
  const corrX = (resX * dr + resY * di) / dd;
  const corrY = (resY * dr - resX * di) / dd;
  const x = ddAdd(bx, 0, -corrX, 0);
  const y = ddAdd(by, 0, -corrY, 0);
  return { x: x[0], xLo: x[1], y: y[0], yLo: y[1] };
}

/**
 * The pole of Newton's method for z³ + p z − 1 nearest the origin: a root of 3z² + p, polished
 * to double-double. With no bend it is exactly zero.
 */
export function ddNewtonPole(px, py) {
  if (px === 0 && py === 0) return { x: 0, xLo: 0, y: 0, yLo: 0 };
  const re = -px / 3;
  const im = -py / 3;
  const mag = Math.hypot(re, im);
  let zx = Math.sqrt((mag + re) / 2);
  let zy = (im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (mag - re) / 2));
  if (zx < 0 || (zx === 0 && zy < 0)) {
    zx = -zx;
    zy = -zy;
  }
  const xx = ddMul(zx, 0, zx, 0);
  const yy = ddMul(zy, 0, zy, 0);
  const xy = ddMul(zx, 0, zy, 0);
  const sq = ddSub(xx[0], xx[1], yy[0], yy[1]);
  const sq3 = ddMul(sq[0], sq[1], 3, 0);
  const xy6 = ddMul(xy[0], xy[1], 6, 0);
  const rx = ddAdd(sq3[0], sq3[1], px, 0);
  const ry = ddAdd(xy6[0], xy6[1], py, 0);
  const dr = 6 * zx;
  const di = 6 * zy;
  const dd = dr * dr + di * di;
  if (!(dd > 1e-24)) return { x: zx, xLo: 0, y: zy, yLo: 0 };
  const resX = rx[0] + rx[1];
  const resY = ry[0] + ry[1];
  const corrX = (resX * dr + resY * di) / dd;
  const corrY = (resY * dr - resX * di) / dd;
  const x = ddAdd(zx, 0, -corrX, 0);
  const y = ddAdd(zy, 0, -corrY, 0);
  return { x: x[0], xLo: x[1], y: y[0], yLo: y[1] };
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
 * and a plain one stays plain, so views that never dive deep are unchanged.
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
