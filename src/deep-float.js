/**
 * High-precision Mandelbrot orbit for the deep zoom.
 *
 * The seahorse center is a Misiurewicz point: the critical orbit lands on a repelling fixed
 * point after 63 steps. A pair of doubles holds about 32 digits of it, so a dive past roughly
 * 10^28 leaves the spiral. Here the same point is refined in fixed point, the reference orbit
 * is stored as doubles (every term stays inside the escape radius), and a pixel is a scaled
 * offset from that orbit. The pixel's c offset keeps its own exponent, so the view can pass the
 * float64 wall without flushing that offset when the running z is renormalized. Linear blocks
 * jump the long middle of the orbit in one step, which is what lets a shader loop of 16384
 * cover an escape time well past that.
 */

const FRACTION_BITS = 1152;
const ONE = 1n << BigInt(FRACTION_BITS);
const HALF = 1n << BigInt(FRACTION_BITS - 1);

/** Deepest Mandelbrot view scale, as a fraction of the target's distance from the origin. */
export const MANDELBROT_ZOOM_FLOOR = 1e-290;

/**
 * Seahorse views closer than this skip blocks of iterations in the shader. Single-stepping a
 * full frame past a few thousand iterations misses the frame budget.
 */
export const DEEP_SHADER_SCALE = 1e-8;

/**
 * The published double-double of the seahorse center. The live camera stores this pair; the
 * fixed-point point above carries the digits past it. The two have to stay the same point.
 */
const SEAHORSE_HI = {
  x: -0.7436965465439123,
  xLo: 1.6423472316984958e-17,
  y: 0.13172167175968114,
  yLo: 1.0660999617601176e-17,
};

/** The published double-double. The live camera stores this pair; the fixed-point point carries the rest. */
export const SEAHORSE_CENTER = {
  x: SEAHORSE_HI.x,
  xLo: SEAHORSE_HI.xLo,
  y: SEAHORSE_HI.y,
  yLo: SEAHORSE_HI.yLo,
};

/**
 * Deepest seahorse view, as floor(log2(width)). Past 2^-1022, still ~100 bits coarser than the
 * 1152-bit center, and a pixel there escapes inside the iteration cap with room in the shader loop.
 */
export const SEAHORSE_FLOOR_EXP = -1040;

/** True when the camera is on the seahorse center, close enough that a pixel still contains it. */
export function isSeahorseCenter(view) {
  if (!view || !(view.scale > 0) || !Number.isFinite(view.scale)) return false;
  if (!Number.isFinite(view.centerX) || !Number.isFinite(view.centerY)) return false;
  const log = Number.isInteger(view.scaleExp) ? view.scaleExp + Math.log2(view.scale) : Math.log2(view.scale);
  if (!Number.isFinite(log)) return false;
  const dx = (view.centerX - SEAHORSE_HI.x) + ((view.centerXLo || 0) - SEAHORSE_HI.xLo);
  const dy = (view.centerY - SEAHORSE_HI.y) + ((view.centerYLo || 0) - SEAHORSE_HI.yLo);
  const miss = Math.hypot(dx, dy);
  if (miss === 0) return true;
  return Math.log2(miss) <= log + Math.log2(1e-3);
}

/** Real iterations a Mandelbrot deep zoom may spend. The shader loop is much shorter. */
export const DEEP_ITERATION_LIMIT = 131072;

const BLOCK_LIMIT = 64;
const COEFFICIENT_LIMIT = 1e20;

function roundShift(product) {
  const neg = product < 0n;
  const abs = neg ? -product : product;
  const rounded = (abs + HALF) >> BigInt(FRACTION_BITS);
  return neg ? -rounded : rounded;
}

function mul(a, b) {
  return roundShift(a * b);
}

function roundDiv(num, den) {
  if (den === 0n) return 0n;
  const neg = (num < 0n) !== (den < 0n);
  const an = num < 0n ? -num : num;
  const ad = den < 0n ? -den : den;
  const q = (an + ad / 2n) / ad;
  return neg ? -q : q;
}

function div(a, b) {
  return roundDiv(a << BigInt(FRACTION_BITS), b);
}

/** Decimal string to fixed point, rounded to the nearest unit. */
function fixedFromDecimal(text) {
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const [whole, frac = ""] = body.split(".");
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, "") || "0";
  const scale = frac.length;
  const num = BigInt(digits) << BigInt(FRACTION_BITS);
  const den = 10n ** BigInt(scale);
  const rounded = (num + den / 2n) / den;
  return neg ? -rounded : rounded;
}

/** A double rounded into fixed point. Subnormals and non-finite values become zero. */
export function fixedFromNumber(value) {
  if (!Number.isFinite(value) || value === 0) return 0n;
  const neg = value < 0;
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log2(abs));
  const mant = abs * 2 ** -exp;
  const bits = 53;
  const mantInt = BigInt(Math.round(mant * 2 ** (bits - 1)));
  const shift = FRACTION_BITS + exp - (bits - 1);
  let out;
  if (shift >= 0) out = mantInt << BigInt(shift);
  else {
    const sh = BigInt(-shift);
    out = (mantInt + (1n << (sh - 1n))) >> sh;
  }
  return neg ? -out : out;
}

/** Fixed point back to a double, rounded to the leading 53 bits. */
export function fixedToNumber(value) {
  if (value === 0n) return 0;
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const bits = abs.toString(2).length;
  if (bits <= 53) {
    const n = Number(abs) / 2 ** FRACTION_BITS;
    return neg ? -n : n;
  }
  const shift = bits - 53;
  const top = Number(abs >> BigInt(shift));
  const n = top * 2 ** (shift - FRACTION_BITS);
  return neg ? -n : n;
}

function stepFixed(zx, zy, cx, cy) {
  const xx = mul(zx, zx);
  const yy = mul(zy, zy);
  const xy = mul(zx, zy);
  return [xx - yy + cx, (xy << 1n) + cy];
}

/**
 * Escape time of z² + c in fixed point. `ux` and `uy` are a double offset added to c, so a probe
 * can sit 10^−40 from a center that a double could not name.
 */
export function fixedMandelbrotIterations(cx, cy, ux, uy, maxIter) {
  const cRe = cx + fixedFromNumber(ux);
  const cIm = cy + fixedFromNumber(uy);
  let zx = 0n;
  let zy = 0n;
  const four = 4n << BigInt(FRACTION_BITS);
  const cap = maxIter | 0;
  for (let iter = 0; iter < cap; iter += 1) {
    const xx = mul(zx, zx);
    const yy = mul(zy, zy);
    if (xx + yy > four) return iter;
    const xy = mul(zx, zy);
    zx = xx - yy + cRe;
    zy = (xy << 1n) + cIm;
  }
  return cap;
}

/** mant * 2^exp as a fixed-point offset. `2^exp` itself need not fit in a double. */
function fixedScaledOffset(exp, mant) {
  if (!Number.isInteger(exp) || !Number.isFinite(mant) || mant === 0) return 0n;
  const neg = mant < 0;
  const abs = Math.abs(mant);
  const mantExp = Math.floor(Math.log2(abs));
  const mantNorm = abs * 2 ** -mantExp;
  const bits = 53;
  const mantInt = BigInt(Math.round(mantNorm * 2 ** (bits - 1)));
  const shift = FRACTION_BITS + exp + mantExp - (bits - 1);
  let out;
  if (shift >= 0) out = mantInt << BigInt(shift);
  else {
    const sh = BigInt(-shift);
    if (sh > 4096n) return 0n;
    out = (mantInt + (1n << (sh - 1n))) >> sh;
  }
  return neg ? -out : out;
}

/** Escape time of the seahorse center plus mant * 2^exp, iterated in the 1152-bit point. */
export function seahorseOffsetIterations(exp, mant, maxIter) {
  const point = seahorsePoint();
  const cRe = point.re + fixedScaledOffset(exp, mant);
  const cIm = point.im;
  let zx = 0n;
  let zy = 0n;
  const four = 4n << BigInt(FRACTION_BITS);
  const cap = maxIter | 0;
  for (let iter = 0; iter < cap; iter += 1) {
    const xx = mul(zx, zx);
    const yy = mul(zy, zy);
    if (xx + yy > four) return iter;
    const xy = mul(zx, zy);
    zx = xx - yy + cRe;
    zy = (xy << 1n) + cIm;
  }
  return cap;
}

/** One Newton step on z₆₄(c) − z₆₃(c), the condition that step 63 has landed on a fixed point. */
function newtonStep(cx, cy) {
  let zx = 0n;
  let zy = 0n;
  let dx = 0n;
  let dy = 0n;
  let prevZx = 0n;
  let prevZy = 0n;
  let prevDx = 0n;
  let prevDy = 0n;
  for (let n = 0; n < 64; n += 1) {
    prevZx = zx;
    prevZy = zy;
    prevDx = dx;
    prevDy = dy;
    const rx = mul(zx, dx);
    const ry = mul(zy, dy);
    const ix = mul(zx, dy);
    const iy = mul(zy, dx);
    const ndx = ((rx - ry) << 1n) + ONE;
    const ndy = (ix + iy) << 1n;
    const next = stepFixed(zx, zy, cx, cy);
    zx = next[0];
    zy = next[1];
    dx = ndx;
    dy = ndy;
  }
  const fx = zx - prevZx;
  const fy = zy - prevZy;
  const dfx = dx - prevDx;
  const dfy = dy - prevDy;
  const den = mul(dfx, dfx) + mul(dfy, dfy);
  const numX = mul(fx, dfx) + mul(fy, dfy);
  const numY = mul(fy, dfx) - mul(fx, dfy);
  return [cx - div(numX, den), cy - div(numY, den)];
}

function measureResidual(cx, cy) {
  let zx = 0n;
  let zy = 0n;
  let prevX = 0n;
  let prevY = 0n;
  for (let n = 0; n < 64; n += 1) {
    prevX = zx;
    prevY = zy;
    const next = stepFixed(zx, zy, cx, cy);
    zx = next[0];
    zy = next[1];
  }
  return Math.hypot(fixedToNumber(zx - prevX), fixedToNumber(zy - prevY));
}

let refined = null;

/** The seahorse center refined until the fixed-point residual is far below a double. */
export function seahorsePoint() {
  if (refined) return refined;
  let cx = fixedFromDecimal("-0.74369654654391224602677650092828");
  let cy = fixedFromDecimal("0.13172167175968114661019334859519");
  for (let step = 0; step < 12; step += 1) {
    const next = newtonStep(cx, cy);
    const moved = Math.hypot(fixedToNumber(next[0] - cx), fixedToNumber(next[1] - cy));
    cx = next[0];
    cy = next[1];
    if (!(moved > 0)) break;
  }
  const x = fixedToNumber(cx);
  const y = fixedToNumber(cy);
  refined = {
    re: cx,
    im: cy,
    x,
    xLo: fixedToNumber(cx - fixedFromNumber(x)),
    y,
    yLo: fixedToNumber(cy - fixedFromNumber(y)),
    residual: measureResidual(cx, cy),
  };
  return refined;
}

let orbitCache = null;

/** Drop the cached seahorse orbit. Tests use this to compare a sliced build with a fresh one. */
export function clearSeahorseOrbit() {
  orbitCache = null;
}

function extendOrbit(cap) {
  const point = seahorsePoint();
  if (!orbitCache) {
    orbitCache = {
      re: point.re,
      im: point.im,
      zx: 0n,
      zy: 0n,
      count: 1,
      orbit: new Float64Array((cap + 1) * 2),
      blocks: [],
    };
  }
  const needed = cap + 1;
  if (orbitCache.orbit.length < needed * 2) {
    const next = new Float64Array(needed * 2);
    next.set(orbitCache.orbit);
    orbitCache.orbit = next;
  }
  const four = 4n << BigInt(FRACTION_BITS);
  while (orbitCache.count < needed) {
    const n = orbitCache.count;
    const xx = mul(orbitCache.zx, orbitCache.zx);
    const yy = mul(orbitCache.zy, orbitCache.zy);
    if (xx + yy > four) break;
    const xy = mul(orbitCache.zx, orbitCache.zy);
    orbitCache.zx = xx - yy + orbitCache.re;
    orbitCache.zy = (xy << 1n) + orbitCache.im;
    orbitCache.orbit[n * 2] = fixedToNumber(orbitCache.zx);
    orbitCache.orbit[n * 2 + 1] = fixedToNumber(orbitCache.zy);
    orbitCache.count = n + 1;
  }
}

/**
 * Append linear blocks for the new tail of the orbit.
 * A block that stopped only because the orbit ran out stays open, so the next extension
 * continues it instead of sealing a short block and walking the whole orbit again.
 */
function growBlocks() {
  const orbit = orbitCache.orbit;
  const count = orbitCache.count;
  const blocks = orbitCache.blocks;
  let n = orbitCache.blockAt || 0;
  while (n < count - 2) {
    let ax = 1;
    let ay = 0;
    let bx = 0;
    let by = 0;
    let length = 0;
    let radius = Infinity;
    let closed = false;
    while (length < BLOCK_LIMIT && n + length < count - 2) {
      const zx = orbit[(n + length) * 2];
      const zy = orbit[(n + length) * 2 + 1];
      const size = Math.hypot(zx, zy);
      if (!(size > 1e-6)) {
        closed = true;
        break;
      }
      const nax = 2 * (zx * ax - zy * ay);
      const nay = 2 * (zx * ay + zy * ax);
      const nbx = 2 * (zx * bx - zy * by) + 1;
      const nby = 2 * (zx * by + zy * bx);
      const peak = Math.max(Math.abs(nax), Math.abs(nay), Math.abs(nbx), Math.abs(nby));
      if (!Number.isFinite(peak) || peak > COEFFICIENT_LIMIT) {
        closed = true;
        break;
      }
      const growth = Math.hypot(nax, nay) + Math.hypot(nbx, nby);
      const allow = Math.min(1e-4, (1e-7 * size) / growth);
      if (!(allow > 0) || !Number.isFinite(allow)) {
        closed = true;
        break;
      }
      ax = nax;
      ay = nay;
      bx = nbx;
      by = nby;
      radius = Math.min(radius, allow);
      length += 1;
    }
    if (!closed && length < BLOCK_LIMIT) break;
    if (length >= 8 && radius < Infinity) {
      blocks.push({
        at: n,
        length,
        ax,
        ay,
        bx,
        by,
        radius,
        radiusExp: Math.floor(Math.log2(radius)),
      });
      n += length;
    } else {
      n += Math.max(1, length);
    }
  }
  orbitCache.blockAt = n;
}

/**
 * Reference orbit of the refined seahorse center, extended up to `maxIter` and reused.
 * `blocks` are the linear jumps. The orbit never escapes, so `count` is maxIter + 1.
 */
export function seahorseOrbit(maxIter) {
  const cap = Math.max(1, maxIter | 0);
  extendOrbit(cap);
  if (!orbitCache.blocks) orbitCache.blocks = [];
  if ((orbitCache.blockAt || 0) < orbitCache.count) growBlocks();
  const count = Math.min(orbitCache.count, cap + 1);
  const blocks = [];
  for (const block of orbitCache.blocks) {
    if (block.at + block.length >= count) break;
    blocks.push(block);
  }
  const reference = {
    orbit: orbitCache.orbit,
    count,
    blocks,
    deep: true,
    inC: true,
    fold: false,
  };
  reference.rebase = reference;
  return reference;
}

/** Power of two that exists in the working precision. Outside that range the factor is a rounding error. */
function pow2(exp, float32) {
  const limit = float32 ? 127 : 1023;
  const floor = float32 ? -126 : -1022;
  if (exp < floor || exp > limit) return 0;
  return float32 ? Math.fround(2 ** exp) : 2 ** exp;
}

/**
 * Scale that adds a term whose exponent sits `exp` above the destination.
 * A gap wider than the significand is below one rounding error, so the term is skipped
 * rather than flushed through a power of two the format cannot hold.
 */
function termScale(exp, sig, float32) {
  if (exp < -sig) return 0;
  return pow2(exp, float32);
}

function renormDelta(dx, dy, e, float32, round) {
  const mag = Math.hypot(dx, dy);
  if (mag > 1024) {
    const shift = Math.floor(Math.log2(mag)) - 8;
    const down = 2 ** -shift;
    dx = round(dx * down);
    dy = round(dy * down);
    e += shift;
  } else if (float32) {
    dx = Math.fround(dx);
    dy = Math.fround(dy);
  }
  return { dx, dy, e };
}

function cmul(ax, ay, bx, by, round) {
  const x = round(round(ax * bx) - round(ay * by));
  const y = round(round(ax * by) + round(ay * bx));
  return [x, y];
}

function blockFits(block, dx, dy, dcx, dcy, e, ec) {
  const dGuard = Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
  const cGuard = Math.max(Math.abs(dcx), Math.abs(dcy), 1e-6);
  const dBits = e + Math.log2(dGuard);
  const cBits = ec + Math.log2(cGuard);
  return dBits < block.radiusExp && cBits < block.radiusExp;
}

/**
 * Escape time of the pixel at offset (ux, uy) from the seahorse center.
 * Without `exp`, (ux, uy) is a world offset and its exponent is split off here.
 * With `exp`, (ux, uy) is the mantissa and `exp` is kept for the whole pixel: the z offset
 * carries its own exponent, and a term is added only while the two still share a significand.
 * `blocks: false` steps one iteration at a time. `float32` rounds the way the shader does.
 * With `trace`, returns `{ iter, steps }` where `steps` is the shader loop count.
 */
export function scaledEscape(reference, ux, uy, maxIter, options = {}) {
  const cap = maxIter | 0;
  const float32 = Boolean(options.float32);
  const round = float32 ? Math.fround : (value) => value;
  const sig = float32 ? 24 : 53;
  const useBlocks = options.blocks !== false && reference.blocks && reference.blocks.length > 0;
  const blocks = useBlocks ? reference.blocks : [];
  let ec = 0;
  let dcx = 0;
  let dcy = 0;
  if (Number.isInteger(options.exp)) {
    ec = options.exp;
    dcx = round(ux);
    dcy = round(uy);
  } else {
    const mag = Math.max(Math.abs(ux), Math.abs(uy));
    if (mag > 0 && Number.isFinite(mag)) {
      ec = Math.floor(Math.log2(mag));
      const inv = pow2(-ec, false);
      dcx = round(ux * inv);
      dcy = round(uy * inv);
    }
  }
  let e = ec;
  let dx = 0;
  let dy = 0;
  let m = 0;
  let iter = 0;
  let steps = 0;
  let blockIndex = 0;
  const last = reference.count - 1;
  const orbit = reference.orbit;
  const finish = (value) => (options.trace ? { iter: value, steps } : value);

  while (iter < cap && steps < cap) {
    while (blockIndex < blocks.length && blocks[blockIndex].at < m) blockIndex += 1;
    const block = blockIndex < blocks.length ? blocks[blockIndex] : null;
    let jumped = false;
    if (block && block.at === m && iter + block.length <= cap && blockFits(block, dx, dy, dcx, dcy, e, ec)) {
      const ax = round(block.ax);
      const ay = round(block.ay);
      const bx = round(block.bx);
      const by = round(block.by);
      const t = termScale(ec - e, sig, float32);
      const [adx, ady] = cmul(ax, ay, dx, dy, round);
      const [bdx, bdy] = cmul(bx, by, round(dcx * t), round(dcy * t), round);
      dx = round(adx + bdx);
      dy = round(ady + bdy);
      m += block.length;
      iter += block.length;
      blockIndex += 1;
      jumped = true;
    } else if (block && block.at === m) {
      blockIndex += 1;
    }
    if (!jumped) {
      const zx = round(orbit[m * 2]);
      const zy = round(orbit[m * 2 + 1]);
      const quad = termScale(e, sig, float32);
      const cScale = termScale(ec - e, sig, float32);
      const [zzx, zzy] = cmul(dx, dy, dx, dy, round);
      const [lix, liy] = cmul(zx, zy, dx, dy, round);
      dx = round(round(2 * lix) + round(zzx * quad) + round(dcx * cScale));
      dy = round(round(2 * liy) + round(zzy * quad) + round(dcy * cScale));
      m += 1;
      iter += 1;
    }
    steps += 1;
    const packed = renormDelta(dx, dy, e, float32, round);
    dx = packed.dx;
    dy = packed.dy;
    e = packed.e;
    if (m > last) m = last;
    const zx = orbit[m * 2];
    const zy = orbit[m * 2 + 1];
    const close = e >= (float32 ? -60 : -900);
    const ws = close ? pow2(e, float32) : 0;
    const wx = float32 ? Math.fround(Math.fround(zx) + Math.fround(dx * ws)) : zx + dx * ws;
    const wy = float32 ? Math.fround(Math.fround(zy) + Math.fround(dy * ws)) : zy + dy * ws;
    if ((close ? wx * wx + wy * wy : zx * zx + zy * zy) > 4) return finish(iter);
    const ranOut = m >= last;
    const nearer = close && wx * wx + wy * wy < (dx * dx + dy * dy) * ws * ws;
    if (ranOut || nearer) {
      if (!close) {
        const zmag = Math.hypot(zx, zy);
        if (zmag > 0) {
          const we = Math.floor(Math.log2(zmag));
          const up = pow2(-we, float32);
          dx = round(zx * up);
          dy = round(zy * up);
          e = we;
        }
      } else {
        const size = Math.hypot(wx, wy);
        const floor = float32 ? 2 ** -126 : 2 ** -1022;
        const nextE = Math.floor(Math.log2(Math.max(size, floor)));
        const up = pow2(-nextE, float32);
        dx = round(wx * up);
        dy = round(wy * up);
        e = nextE;
      }
      m = 0;
      blockIndex = 0;
    }
  }
  return finish(iter);
}

/**
 * scale = mant * 2^exp, with mant in [1, 2).
 * An explicit exponent is used when the width itself would overflow or underflow a float.
 */
export function scaleParts(scale, exp) {
  if (Number.isInteger(exp)) {
    const mant = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return { mant, exp };
  }
  if (!(scale > 0) || !Number.isFinite(scale)) return { mant: 1, exp: 0 };
  const e = Math.floor(Math.log2(scale));
  const inv = pow2(-e, false);
  return { mant: inv === 0 ? 1 : scale * inv, exp: e };
}

/**
 * Block table as float texels, two per block: coefficients, then start, length, and the
 * radius exponent. A float32 radius itself would flush to zero at these depths.
 */
export function packBlocks(blocks) {
  const list = blocks || [];
  const width = 1024;
  const texels = Math.max(2, list.length * 2);
  const height = Math.ceil(texels / width);
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < list.length; i += 1) {
    const block = list[i];
    const base = i * 2 * 4;
    data[base] = block.ax;
    data[base + 1] = block.ay;
    data[base + 2] = block.bx;
    data[base + 3] = block.by;
    data[base + 4] = block.at;
    data[base + 5] = block.length;
    data[base + 6] = block.radiusExp;
    data[base + 7] = 0;
  }
  return { data, width, height, count: list.length };
}
