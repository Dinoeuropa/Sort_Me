import { DEEP_ITERATION_LIMIT, DEEP_SHADER_SCALE, isSeahorseCenter, packBlocks, scaleParts, seahorseOrbit } from "./deep-float.js";
import { escapeLut } from "./palettes.js";
import { ITERATION_LIMIT } from "./fractal-view.js";
import {
  juliaReference,
  newtonReference,
  referenceOrbit,
  seriesSkip,
  shipJuliaReference,
  shipReference,
  viewOffset,
} from "./precision.js";

/** The shader loop stops here, the same cap the workers keep. */
export const GPU_ITER_LIMIT = ITERATION_LIMIT;

/**
 * A quadratic coefficient larger than this is left for single steps.
 * Past it, float32 rounding of C δ² swamps the offset the block is allowed to move.
 */
export const GPU_BLOCK_COEFF = 1e6;

const BLOCK_COEFFS = ["ax", "ay", "bx", "by", "cxx", "cxy", "dxx", "dxy", "exx", "exy"];

function blockFitsFloat32(block) {
  if (!block || !(block.radius > 0) || !Number.isFinite(block.radius)) return false;
  if (!(block.length >= 1) || !(block.at >= 0)) return false;
  for (const name of BLOCK_COEFFS) {
    const value = block[name];
    if (!Number.isFinite(value) || Math.abs(value) > GPU_BLOCK_COEFF) return false;
  }
  return true;
}

/**
 * Bivariate blocks the perturb shader may jump.
 * The fold has none. A coefficient past GPU_BLOCK_COEFF is dropped and that run is single-stepped.
 * When the rebase orbit is a different reference, its blocks follow the primary ones and `rebaseAt`
 * is the first of them.
 */
export function gpuQuadraticBlocks(reference) {
  const empty = { blocks: [], rebaseAt: 0 };
  if (!reference || reference.fold || !reference.blocks) return empty;
  const blocks = reference.blocks.filter(blockFitsFloat32);
  if (!reference.rebase || reference.rebase === reference) return { blocks, rebaseAt: 0 };
  const rebaseAt = blocks.length;
  const more = (reference.rebase.blocks || []).filter(blockFitsFloat32);
  return { blocks: blocks.concat(more), rebaseAt };
}

/** Four texels a block: A and B, C and D, E, then start, length, and radius. */
export function packQuadraticBlocks(blocks) {
  const list = blocks || [];
  const width = 1024;
  const texels = Math.max(4, list.length * 4);
  const height = Math.ceil(texels / width);
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < list.length; i += 1) {
    const block = list[i];
    const base = i * 16;
    data[base] = Math.fround(block.ax);
    data[base + 1] = Math.fround(block.ay);
    data[base + 2] = Math.fround(block.bx);
    data[base + 3] = Math.fround(block.by);
    data[base + 4] = Math.fround(block.cxx);
    data[base + 5] = Math.fround(block.cxy);
    data[base + 6] = Math.fround(block.dxx);
    data[base + 7] = Math.fround(block.dxy);
    data[base + 8] = Math.fround(block.exx);
    data[base + 9] = Math.fround(block.exy);
    data[base + 12] = block.at;
    data[base + 13] = block.length;
    data[base + 14] = Math.fround(block.radius);
  }
  return { data, width, height, count: list.length };
}

const LOOP_LIMITS = [256, 1024, 4096, 16384];

/** Smallest compiled loop bound that can run this cap. */
export function loopLimitForCap(cap) {
  const n = cap | 0;
  for (const limit of LOOP_LIMITS) {
    if (n <= limit) return limit;
  }
  return LOOP_LIMITS[LOOP_LIMITS.length - 1];
}

/** Texels per row of the palette and orbit textures. WebGL2 promises at least 2048. */
const LUT_WIDTH = 2048;
const ORBIT_WIDTH = 1024;

/**
 * Which formula the shader runs.
 * 0 Mandelbrot, 1 Julia, 2 burning ship, 3 burning ship with c fixed,
 * 4 Newton for z³ − 1, 5 Newton with the cursor bend.
 */
export function gpuEscapeMode(fractalId, preset) {
  if (fractalId === "mandelbrot") return 0;
  if (fractalId === "julia") return 1;
  if (fractalId === "burning") return "cx" in preset || "cy" in preset ? 3 : 2;
  if (fractalId === "newton") return preset.px || preset.py ? 5 : 4;
  return -1;
}

/**
 * The colors paintEscape would write for this cap and window, as RGBA texels in rows of
 * LUT_WIDTH: basins 0, 1, 2, then the ordinary ramp, `span` iterations each, end to end.
 */
export function buildPaletteLut(paletteId, cap, floor = 0, top = null) {
  const { lut, span } = escapeLut(paletteId, cap, floor, top);
  const count = span * 4;
  const width = Math.min(LUT_WIDTH, count);
  const height = Math.ceil(count / width);
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < count; index += 1) {
    data[index * 4] = lut[index * 3];
    data[index * 4 + 1] = lut[index * 3 + 1];
    data[index * 4 + 2] = lut[index * 3 + 2];
    data[index * 4 + 3] = 255;
  }
  return { data, width, height, span };
}

/**
 * A reference orbit as float texels: the point, and for Newton's method the derivative 3z² + p
 * beside it. A rebase orbit other than the reference itself follows straight after.
 */
export function packOrbit(reference) {
  const rebase = reference.rebase && reference.rebase !== reference ? reference.rebase : null;
  const total = reference.count + (rebase ? rebase.count : 0);
  const width = ORBIT_WIDTH;
  const height = Math.max(1, Math.ceil(total / width));
  const data = new Float32Array(width * height * 4);
  const write = (item, at) => {
    for (let n = 0; n < item.count; n += 1) {
      const offset = (at + n) * 4;
      data[offset] = item.orbit[n * 2];
      data[offset + 1] = item.orbit[n * 2 + 1];
      if (item.denom) {
        data[offset + 2] = item.denom[n * 2];
        data[offset + 3] = item.denom[n * 2 + 1];
      }
    }
  };
  write(reference, 0);
  if (rebase) write(rebase, reference.count);
  return {
    data,
    width,
    height,
    last: reference.count - 1,
    rebaseAt: rebase ? reference.count : 0,
    rebaseLast: (rebase || reference).count - 1,
  };
}

const VERT = `#version 300 es
void main() {
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

function fragmentSource(loopLimit) {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec2 uResolution;
uniform vec2 uBand;
uniform vec2 uOrigin;
uniform vec2 uCenter;
uniform float uScale;
uniform float uFlip;
uniform int uCap;
uniform int uMode;
uniform vec2 uParam;
uniform sampler2D uLut;
uniform int uLutWidth;
uniform int uSpan;
uniform int uPerturb;
uniform sampler2D uOrbit;
uniform int uOrbitWidth;
uniform int uLast;
uniform int uRebaseAt;
uniform int uRebaseLast;
uniform vec2 uOffset;
uniform int uSkip;
uniform vec2 uSeries;
uniform vec2 uSeries2;
uniform float uMant;
uniform int uExp;
uniform sampler2D uBlocks;
uniform int uBlockCount;
uniform int uRebaseBlock;
uniform int uBlockTotal;
uniform int uBlockWidth;
out vec4 outColor;

const int LOOP = ${loopLimit};
// Past FAR, Newton's method only shrinks z by 2/3 a step; the rest is below float precision.
const float FAR = 1e4;
const float LN_FAR = 9.210340371976184;
const float LN_GROW = 0.4054651081081644;
const float LN_THREE = 1.0986122886681098;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cdiv(vec2 a, vec2 b) {
  float s = max(abs(b.x), abs(b.y));
  vec2 bs = b / s;
  vec2 as = a / s;
  return vec2(dot(as, bs), as.y * bs.x - as.x * bs.y) / dot(bs, bs);
}

float lnSize(vec2 z) {
  float s = max(abs(z.x), abs(z.y));
  vec2 t = z / s;
  return log(s) + 0.5 * log(dot(t, t));
}

vec4 orbitAt(int n) {
  return texelFetch(uOrbit, ivec2(n % uOrbitWidth, n / uOrbitWidth), 0);
}

float diffAbs(float x, float d) {
  if (x >= 0.0) return x + d >= 0.0 ? d : -(2.0 * x + d);
  return x + d > 0.0 ? 2.0 * x + d : -d;
}

int basinOf(vec2 z, float limit) {
  vec2 r0 = vec2(1.0, 0.0);
  vec2 r1 = vec2(-0.5, 0.8660254037844386);
  vec2 r2 = vec2(-0.5, -0.8660254037844386);
  vec2 d0 = z - r0;
  vec2 d1 = z - r1;
  vec2 d2 = z - r2;
  float q0 = dot(d0, d0);
  float q1 = dot(d1, d1);
  float q2 = dot(d2, d2);
  if (limit > 0.0) {
    if (q0 < limit) return 0;
    if (q1 < limit) return 1;
    if (q2 < limit) return 2;
    return -1;
  }
  if (q0 <= q1 && q0 <= q2) return 0;
  if (q1 <= q2) return 1;
  return 2;
}

bool mandelbrotBulb(vec2 c) {
  float y2 = c.y * c.y;
  float x1 = c.x - 0.25;
  float q = x1 * x1 + y2;
  if (q * (q + x1) <= 0.25 * y2) return true;
  float xb = c.x + 1.0;
  return xb * xb + y2 <= 0.0625;
}

int escapeDirect(vec2 p, int mode, int cap) {
  vec2 z = mode == 1 || mode == 3 ? p : vec2(0.0);
  vec2 c = mode == 0 || mode == 2 ? p : uParam;
  bool fold = mode >= 2;
  int iter = 0;
  vec2 saved = vec2(0.0);
  int check = 3;
  if (mode == 0 && mandelbrotBulb(p)) return cap;
  for (int i = 0; i < LOOP; i++) {
    if (iter >= cap || dot(z, z) > 4.0) break;
    if (fold) z = abs(z);
    z = cmul(z, z) + c;
    iter += 1;
    if (mode == 0) {
      if (z == saved) return cap;
      if (iter == check) {
        saved = z;
        check *= 2;
      }
    }
  }
  return iter;
}

vec4 blockTexel(int index) {
  return texelFetch(uBlocks, ivec2(index % uBlockWidth, index / uBlockWidth), 0);
}

// The pixel as an offset from the reference orbit, moved onto the start of the critical orbit
// whenever it comes closer to the origin than its offset, as perturbIterations does.
int escapePerturbed(vec2 u, int mode, int cap) {
  bool inC = mode == 0 || mode == 2;
  bool fold = mode >= 2;
  vec2 start = uOffset + u;
  vec2 dc = inC ? start : vec2(0.0);
  vec2 dz = inC ? vec2(0.0) : start;
  int at = 0;
  int last = uLast;
  int m = 0;
  int iter = 0;
  int blockIndex = 0;
  int blockLimit = uBlockCount;
  if (!inC) {
    vec2 z0 = orbitAt(0).xy + dz;
    if (dot(z0, z0) > 4.0) return 0;
  }
  if (uSkip > 0 && uSkip < cap && uSkip < last) {
    dz = cmul(uSeries, start) + cmul(uSeries2, cmul(start, start));
    m = uSkip;
    iter = uSkip;
  }
  for (int i = 0; i < LOOP; i++) {
    if (iter >= cap) break;
    for (int skip = 0; skip < 8; skip++) {
      if (blockIndex >= blockLimit) break;
      if (int(blockTexel(blockIndex * 4 + 3).x) >= m) break;
      blockIndex += 1;
    }
    bool jumped = false;
    if (!fold && blockIndex < blockLimit) {
      vec4 c0 = blockTexel(blockIndex * 4);
      vec4 c1 = blockTexel(blockIndex * 4 + 1);
      vec4 c2 = blockTexel(blockIndex * 4 + 2);
      vec4 meta = blockTexel(blockIndex * 4 + 3);
      int atBlock = int(meta.x);
      int len = int(meta.y);
      if (atBlock == m && iter + len <= cap && m + len <= last && length(dz) < meta.z && length(dc) < meta.z) {
        vec2 x2 = cmul(dz, dz);
        vec2 y2 = cmul(dc, dc);
        vec2 xy = cmul(dz, dc);
        dz = cmul(c0.xy, dz) + cmul(c0.zw, dc) + cmul(c1.xy, x2) + cmul(c1.zw, xy) + cmul(c2.xy, y2);
        m += len;
        iter += len;
        blockIndex += 1;
        jumped = true;
      } else if (atBlock == m) {
        blockIndex += 1;
      }
    }
    if (jumped) {
      vec2 z = orbitAt(at + m).xy + dz;
      float zz = dot(z, z);
      if (zz > 4.0) break;
      if (m >= last || zz < dot(dz, dz)) {
        dz = z;
        m = 0;
        at = uRebaseAt;
        last = uRebaseLast;
        blockIndex = uRebaseBlock;
        blockLimit = uBlockTotal;
      }
      continue;
    }
    vec2 zr = orbitAt(at + m).xy;
    vec2 n;
    if (fold) {
      vec2 a = abs(zr);
      float da = diffAbs(zr.x, dz.x);
      float db = diffAbs(zr.y, dz.y);
      n = vec2(2.0 * (a.x * da - a.y * db) + (da * da - db * db), 2.0 * (a.x * db + a.y * da + da * db));
    } else {
      n = 2.0 * cmul(zr, dz) + cmul(dz, dz);
    }
    dz = n + dc;
    m += 1;
    iter += 1;
    vec2 z = orbitAt(at + m).xy + dz;
    float zz = dot(z, z);
    if (zz > 4.0) break;
    if (m >= last || zz < dot(dz, dz)) {
      dz = z;
      m = 0;
      at = uRebaseAt;
      last = uRebaseLast;
      blockIndex = uRebaseBlock;
      blockLimit = uBlockTotal;
    }
  }
  return iter;
}

float exp2i(int exponent) {
  if (exponent < -126 || exponent > 127) return 0.0;
  return exp2(float(exponent));
}

// Pixel offset in units of the view scale. The reference is the refined seahorse orbit, and a
// block adds its whole run when the offset is still inside the block's radius.
int escapeDeep(vec2 loc, int cap) {
  vec2 dc = loc * uMant;
  vec2 d = vec2(0.0);
  int e = uExp;
  int m = 0;
  int iter = 0;
  int blockIndex = 0;
  int last = uLast;
  for (int i = 0; i < LOOP; i++) {
    if (iter >= cap) break;
    for (int skip = 0; skip < 8; skip++) {
      if (blockIndex >= uBlockCount) break;
      if (int(blockTexel(blockIndex * 2 + 1).x) >= m) break;
      blockIndex += 1;
    }
    bool jumped = false;
    if (blockIndex < uBlockCount) {
      vec4 coef = blockTexel(blockIndex * 2);
      vec4 meta = blockTexel(blockIndex * 2 + 1);
      int at = int(meta.x);
      int len = int(meta.y);
      float guard = max(max(abs(d.x), abs(d.y)), max(max(abs(dc.x), abs(dc.y)), 1e-6));
      if (at == m && iter + len <= cap && float(e) + log2(guard) < meta.z) {
        d = cmul(coef.xy, d) + cmul(coef.zw, dc);
        m += len;
        iter += len;
        blockIndex += 1;
        jumped = true;
      } else if (at == m) {
        blockIndex += 1;
      }
    }
    if (!jumped) {
      vec2 z = orbitAt(m).xy;
      float s = exp2i(e);
      d = 2.0 * cmul(z, d) + cmul(d, d) * s + dc;
      m += 1;
      iter += 1;
    }
    float mag = length(d);
    if (mag > 1024.0) {
      int shift = int(floor(log2(mag))) - 8;
      float down = exp2(float(-shift));
      d *= down;
      dc *= down;
      e += shift;
    }
    if (m > last) m = last;
    vec2 zr = orbitAt(m).xy;
    bool close = e >= -60;
    float ws = close ? exp2i(e) : 0.0;
    vec2 w = zr + d * ws;
    if ((close ? dot(w, w) : dot(zr, zr)) > 4.0) break;
    bool ranOut = m >= last;
    bool nearer = close && dot(w, w) < dot(d * ws, d * ws);
    if (ranOut || nearer) {
      float span = exp2i(e);
      vec2 world = zr + d * span;
      float size = length(world);
      int nextE = int(floor(log2(max(size, 1e-20))));
      d = world * exp2i(-nextE);
      dc *= exp2i(e - nextE);
      e = nextE;
      m = 0;
      blockIndex = 0;
    }
  }
  return iter;
}

// Newton's method for z³ + p z − 1. A deep pixel is first an offset d from the reference,
// N(Z + d) − N(Z) = a / (D + e) − (A / D) e / (D + e) with A = 2Z³ + 1, D = 3Z² + p,
// a = 2d(3Z² + 3Zd + d²), e = 3d(2Z + d), none of which cancels for small d. Once the reference
// ends the pixel goes on in plain floats, where far points shrink by 2/3 a step and a step
// beside the pole at zero is taken in logarithms so nothing overflows.
void newtonPixel(vec2 p, vec2 u, int mode, int cap, out int outIter, out int outBasin) {
  vec2 bend = mode == 5 ? uParam : vec2(0.0);
  int iter = 0;
  int basin = -1;
  bool done = false;
  vec2 z = p;
  if (uPerturb == 1) {
    vec2 d = uOffset + u;
    int m = 0;
    for (int i = 0; i < LOOP; i++) {
      vec4 ref = orbitAt(m);
      vec2 zr = ref.xy;
      z = zr + d;
      if (iter >= cap) break;
      if (mode == 4) {
        int near = basinOf(z, 1e-6);
        if (near >= 0) {
          basin = near;
          iter += 1;
          done = true;
          break;
        }
      }
      bool far = max(abs(zr.x), abs(zr.y)) > FAR;
      vec2 e = 3.0 * cmul(d, 2.0 * zr + d);
      vec2 a = 2.0 * cmul(d, 3.0 * cmul(zr, zr) + 3.0 * cmul(zr, d) + cmul(d, d));
      vec2 grow = 2.0 * cmul(cmul(zr, zr), zr) + vec2(1.0, 0.0);
      vec2 below = ref.zw + e;
      if (m >= uLast) {
        if (mode == 5 && !far) {
          if (below.x == 0.0 && below.y == 0.0) {
            basin = basinOf(z, 0.0);
            iter += 1;
            done = true;
            break;
          }
          vec2 next = cdiv(grow + a, below);
          vec2 step = next - z;
          z = next;
          iter += 1;
          if (dot(step, step) < 1e-12) {
            basin = basinOf(z, 0.0);
            done = true;
          }
        }
        break;
      }
      vec2 next = far ? d * (2.0 / 3.0) : cdiv(a, below) - cmul(cdiv(grow, ref.zw), cdiv(e, below));
      m += 1;
      iter += 1;
      d = next;
      if (mode == 5) {
        vec2 zn = orbitAt(m).xy + d;
        vec2 step = zn - z;
        z = zn;
        if (dot(step, step) < 1e-12) {
          basin = basinOf(z, 0.0);
          done = true;
          break;
        }
      }
    }
  }
  if (!done) {
    for (int i = 0; i < LOOP; i++) {
      if (iter >= cap) break;
      float s = max(abs(z.x), abs(z.y));
      if (s > FAR) {
        int k = max(1, int(ceil((lnSize(z) - LN_FAR) / LN_GROW)));
        z *= exp(-float(k) * LN_GROW);
        iter += k;
        continue;
      }
      if (mode == 4) {
        int near = basinOf(z, 1e-6);
        if (near >= 0) {
          basin = near;
          iter += 1;
          break;
        }
        if (s < 1e-9) {
          iter += 1;
          if (s == 0.0) break;
          float size = -LN_THREE - 2.0 * lnSize(z);
          float turn = -2.0 * atan(z.y, z.x);
          if (size > LN_FAR) {
            int k = int(ceil((size - LN_FAR) / LN_GROW));
            size -= float(k) * LN_GROW;
            iter += k;
          }
          z = exp(size) * vec2(cos(turn), sin(turn));
          continue;
        }
      }
      vec2 z2 = cmul(z, z);
      vec2 f = cmul(z2, z) + cmul(bend, z) - vec2(1.0, 0.0);
      vec2 slope = 3.0 * z2 + bend;
      if (slope.x == 0.0 && slope.y == 0.0) {
        basin = basinOf(z, 0.0);
        iter += 1;
        break;
      }
      vec2 step = cdiv(f, slope);
      z -= step;
      iter += 1;
      if (mode == 5 && dot(step, step) < 1e-12) {
        basin = basinOf(z, 0.0);
        break;
      }
    }
  }
  if (basin < 0) basin = basinOf(z, 0.0);
  outIter = min(iter, cap);
  outBasin = basin;
}

void main() {
  float px = uOrigin.x + gl_FragCoord.x;
  float py = uBand.x + uBand.y - gl_FragCoord.y;
  float nx = px / uResolution.x - 0.5;
  float ny = uFlip > 0.5 ? py / uResolution.y - 0.5 : 0.5 - py / uResolution.y;
  vec2 screen = vec2(nx * (uResolution.x / uResolution.y), ny);
  vec2 u = screen * uScale;
  vec2 p = uCenter + u;
  int cap = uCap;
  int mode = uMode;
  int iter = 0;
  int basin = -1;
  if (mode < 4) {
    if (uPerturb == 2) iter = escapeDeep(uOffset + screen, cap);
    else iter = uPerturb == 1 ? escapePerturbed(u, mode, cap) : escapeDirect(p, mode, cap);
  } else {
    newtonPixel(p, u, mode, cap, iter, basin);
  }
  int slot = basin < 0 ? 3 : basin;
  int index = slot * uSpan + min(iter, cap);
  outColor = texelFetch(uLut, ivec2(index % uLutWidth, index / uLutWidth), 0);
}
`;
}

const UNIFORMS = [
  "uResolution", "uBand", "uOrigin", "uCenter", "uScale", "uFlip", "uCap", "uMode", "uParam", "uLut", "uLutWidth", "uSpan",
  "uPerturb", "uOrbit", "uOrbitWidth", "uLast", "uRebaseAt", "uRebaseLast", "uOffset", "uSkip", "uSeries", "uSeries2",
  "uMant", "uExp", "uBlocks", "uBlockCount", "uRebaseBlock", "uBlockTotal", "uBlockWidth",
];

let gpu = null;
let failed = false;
let gpuSurface = null;

/** Draw onto this canvas. The zoom worker passes its OffscreenCanvas before the first frame. */
export function useGpuSurface(canvas) {
  if (gpu || failed || !canvas) return;
  gpuSurface = canvas;
}

function shader(gl, type, source) {
  const item = gl.createShader(type);
  gl.shaderSource(item, source);
  gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
    gl.deleteShader(item);
    return null;
  }
  return item;
}

function texture(gl) {
  const item = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, item);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return item;
}

function boot() {
  if (gpu || failed) return gpu;
  if (!gpuSurface && typeof document === "undefined") return null;
  try {
    const canvas = gpuSurface || document.createElement("canvas");
    if (!canvas) {
      failed = true;
      return null;
    }
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      failed = true;
      return null;
    }
    const vert = shader(gl, gl.VERTEX_SHADER, VERT);
    if (!vert) {
      failed = true;
      return null;
    }
    const programs = new Map();
    for (const loopLimit of LOOP_LIMITS) {
      const frag = shader(gl, gl.FRAGMENT_SHADER, fragmentSource(loopLimit));
      if (!frag) {
        failed = true;
        return null;
      }
      const program = gl.createProgram();
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        failed = true;
        return null;
      }
      const where = {};
      for (const name of UNIFORMS) where[name] = gl.getUniformLocation(program, name);
      programs.set(loopLimit, { program, where });
    }
    const lut = texture(gl);
    const orbit = texture(gl);
    gl.bindTexture(gl.TEXTURE_2D, orbit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
    const blocks = texture(gl);
    gl.bindTexture(gl.TEXTURE_2D, blocks);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
    gpu = {
      gl,
      canvas,
      programs,
      lut,
      lutKey: "",
      orbit,
      blocks,
      reference: null,
      timerExt: gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    };
    return gpu;
  } catch {
    failed = true;
    return null;
  }
}

/** True once WebGL2 and the shader are ready, so deep views can skip the workers. */
export function gpuAvailable() {
  return Boolean(boot());
}

function positiveSize(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Largest square drawing buffer this GPU will actually back, or null without WebGL2.
 * WebGL2 only promises 4096; asking for more silently shrinks the buffer and disagrees with uResolution.
 */
export function gpuDrawLimit() {
  const session = boot();
  if (!session) return null;
  const { gl } = session;
  const sizes = [];
  try {
    const renderbuffer = positiveSize(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    if (renderbuffer) sizes.push(renderbuffer);
  } catch { /* a missing parameter is not a limit */ }
  try {
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    if (viewport) {
      const wide = positiveSize(viewport[0]);
      const tall = positiveSize(viewport[1]);
      if (wide) sizes.push(wide);
      if (tall) sizes.push(tall);
    }
  } catch { /* a missing parameter is not a limit */ }
  return sizes.length ? Math.min(...sizes) : null;
}

/**
 * Milliseconds per million pixels per iteration of the draw that just finished on the GPU,
 * or null when no completed timer sample is waiting.
 */
export function pollGpuCost() {
  if (!gpu || !gpu.timerSample) return null;
  const { gl, timerExt, timerSample } = gpu;
  const { query, width, height, cap } = timerSample;
  if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return null;
  if (timerExt && gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
    gl.deleteQuery(query);
    gpu.timerSample = null;
    return null;
  }
  const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
  gl.deleteQuery(query);
  gpu.timerSample = null;
  return nanoseconds / 1e6 / (((width * height) / 1e6) * Math.max(1, cap));
}

/** Iterations a reference is computed for: rounded up, so a slowly rising cap reuses one orbit. */
function referenceCap(mode, cap, deep) {
  if (mode >= 4) return cap;
  const limit = deep ? DEEP_ITERATION_LIMIT : GPU_ITER_LIMIT;
  return Math.min(limit, Math.ceil(cap / 1024) * 1024);
}

function usesDeepReference(mode, preset) {
  return mode === 0 && isSeahorseCenter(preset) && preset.scale < DEEP_SHADER_SCALE;
}

function computeReference(mode, preset, cap) {
  if (usesDeepReference(mode, preset)) return seahorseOrbit(cap);
  const x = preset.centerX;
  const xLo = preset.centerXLo || 0;
  const y = preset.centerY;
  const yLo = preset.centerYLo || 0;
  if (mode === 0) return referenceOrbit(x, xLo, y, yLo, cap);
  if (mode === 1) return juliaReference(x, xLo, y, yLo, preset.cx || 0, preset.cy || 0, cap);
  if (mode === 2) return shipReference(x, xLo, y, yLo, cap);
  if (mode === 3) return shipJuliaReference(x, xLo, y, yLo, preset.cx || 0, preset.cy || 0, cap);
  return newtonReference(x, xLo, y, yLo, preset.px || 0, preset.py || 0, cap);
}

/**
 * The reference orbit for a deep view, on the GPU. One within half a frame of the camera is
 * reused, its distance from the camera handed to the shader, so a glide or a dive mostly
 * reuses the orbit it already has.
 */
function referenceFor(session, mode, preset, cap) {
  const { gl } = session;
  const deep = usesDeepReference(mode, preset);
  const reach = referenceCap(mode, cap, deep);
  const key = [mode, deep ? "deep" : "dd", preset.cx, preset.cy, preset.px, preset.py, reach].join(":");
  const held = session.reference;
  if (held && held.key === key) {
    const offset = viewOffset(preset, held.center);
    if (Math.hypot(offset.dx, offset.dy) <= preset.scale * 0.5) return { ...held, offset };
  }
  const reference = computeReference(mode, preset, reach);
  const packed = packOrbit(reference);
  gl.bindTexture(gl.TEXTURE_2D, session.orbit);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, packed.width, packed.height, 0, gl.RGBA, gl.FLOAT, packed.data);
  const quad = deep ? null : gpuQuadraticBlocks(reference);
  const blockPack = deep ? packBlocks(reference.blocks) : packQuadraticBlocks(quad.blocks);
  gl.bindTexture(gl.TEXTURE_2D, session.blocks);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA32F, blockPack.width, blockPack.height, 0, gl.RGBA, gl.FLOAT, blockPack.data,
  );
  session.reference = {
    key,
    center: {
      centerX: preset.centerX,
      centerXLo: preset.centerXLo || 0,
      centerY: preset.centerY,
      centerYLo: preset.centerYLo || 0,
    },
    reference,
    packed,
    blocks: blockPack,
  };
  return { ...session.reference, offset: { dx: 0, dy: 0 } };
}

/**
 * Color the pixels on the GPU and return that canvas. `depth` is "direct" for plain float
 * coordinates or "perturb" for offsets from a double-double reference, from gpuDepthMode.
 * `rows` draws only a band of rows counted from the top, and the canvas returned is that band
 * alone, so a heavy frame can be drawn a band at a time. `cols` clips columns the same way,
 * and both together return the intersection rectangle. `floor` and `top` fit the
 * palette as paintEscape does. Returns null where WebGL2 is missing or the cap is past the loop.
 */
export function paintGpuEscape({
  width,
  height,
  fractalId,
  preset,
  cap,
  paletteId,
  depth = "direct",
  floor = 0,
  top = null,
  rows = null,
  cols = null,
  defer = false,
}) {
  const mode = gpuEscapeMode(fractalId, preset);
  const iterations = cap | 0;
  const deep = depth === "deep";
  const ceiling = deep ? DEEP_ITERATION_LIMIT : GPU_ITER_LIMIT;
  if (mode < 0 || iterations < 1 || iterations > ceiling || width < 1 || height < 1) return null;
  if (depth !== "direct" && depth !== "perturb" && !deep) return null;
  const session = boot();
  if (!session) return null;
  const loopLimit = loopLimitForCap(iterations);
  const { program, where } = session.programs.get(loopLimit);
  const { gl, canvas, lut } = session;
  const lutKey = `${paletteId}:${iterations}:${floor}:${top}`;
  if (session.lutKey !== lutKey) {
    const table = buildPaletteLut(paletteId, iterations, floor, top);
    gl.bindTexture(gl.TEXTURE_2D, lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, table.width, table.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, table.data);
    session.lutKey = lutKey;
    session.lutWidth = table.width;
  }
  const from = rows ? Math.max(0, Math.min(height - 1, rows.from | 0)) : 0;
  const to = rows ? Math.max(from + 1, Math.min(height, rows.to | 0)) : height;
  const x0 = cols ? Math.max(0, Math.min(width, cols.from | 0)) : 0;
  const x1 = cols ? Math.max(x0, Math.min(width, cols.to | 0)) : width;
  const tall = to - from;
  const wide = x1 - x0;
  if (wide < 1 || tall < 1) return null;
  if (canvas.width !== wide || canvas.height !== tall) {
    canvas.width = wide;
    canvas.height = tall;
  }
  if (
    gl.drawingBufferWidth
    && gl.drawingBufferHeight
    && (gl.drawingBufferWidth < canvas.width || gl.drawingBufferHeight < canvas.height)
  ) {
    return null;
  }
  gl.viewport(0, 0, wide, tall);
  gl.useProgram(program);
  gl.uniform2f(where.uResolution, width, height);
  gl.uniform2f(where.uOrigin, x0, 0);
  gl.uniform2f(where.uBand, from, tall);
  gl.uniform2f(where.uCenter, preset.centerX, preset.centerY);
  gl.uniform1f(where.uScale, preset.scale);
  gl.uniform1f(where.uFlip, preset.flipY ? 1 : 0);
  gl.uniform1i(where.uCap, iterations);
  gl.uniform1i(where.uMode, mode);
  const paramX = mode >= 4 ? preset.px || 0 : preset.cx || 0;
  const paramY = mode >= 4 ? preset.py || 0 : preset.cy || 0;
  gl.uniform2f(where.uParam, paramX, paramY);
  gl.uniform1i(where.uLutWidth, session.lutWidth);
  gl.uniform1i(where.uSpan, iterations + 1);
  gl.uniform1i(where.uPerturb, deep ? 2 : depth === "perturb" ? 1 : 0);
  const parts = scaleParts(preset.scale);
  gl.uniform1f(where.uMant, deep ? parts.mant : 1);
  gl.uniform1i(where.uExp, deep ? parts.exp : 0);
  if (depth === "perturb" || deep) {
    const held = referenceFor(session, mode, preset, iterations);
    const { packed, reference, offset } = held;
    gl.uniform1i(where.uOrbitWidth, packed.width);
    gl.uniform1i(where.uLast, packed.last);
    gl.uniform1i(where.uRebaseAt, packed.rebaseAt);
    gl.uniform1i(where.uRebaseLast, packed.rebaseLast);
    if (deep) {
      gl.uniform2f(where.uOffset, offset.dx / preset.scale, offset.dy / preset.scale);
      gl.uniform1i(where.uSkip, 0);
      gl.uniform2f(where.uSeries, 0, 0);
      gl.uniform2f(where.uSeries2, 0, 0);
      gl.uniform1i(where.uBlockCount, held.blocks ? held.blocks.count : 0);
      gl.uniform1i(where.uRebaseBlock, 0);
      gl.uniform1i(where.uBlockTotal, held.blocks ? held.blocks.count : 0);
      gl.uniform1i(where.uBlockWidth, held.blocks ? held.blocks.width : 1);
    } else {
      gl.uniform2f(where.uOffset, offset.dx, offset.dy);
      const aspect = width / height;
      const radius = Math.hypot(offset.dx, offset.dy) + Math.hypot(preset.scale * aspect, preset.scale) / 2;
      const skip = reference.series ? seriesSkip(reference, radius) : 0;
      gl.uniform1i(where.uSkip, skip);
      gl.uniform2f(where.uSeries, skip > 0 ? reference.series[skip * 2] : 0, skip > 0 ? reference.series[skip * 2 + 1] : 0);
      gl.uniform2f(
        where.uSeries2,
        skip > 0 && reference.quad ? reference.quad[skip * 2] : 0,
        skip > 0 && reference.quad ? reference.quad[skip * 2 + 1] : 0,
      );
      const quad = gpuQuadraticBlocks(reference);
      const shared = !reference.rebase || reference.rebase === reference;
      const primary = shared ? quad.blocks.length : quad.rebaseAt;
      gl.uniform1i(where.uBlockCount, primary);
      gl.uniform1i(where.uRebaseBlock, shared ? 0 : quad.rebaseAt);
      gl.uniform1i(where.uBlockTotal, quad.blocks.length);
      gl.uniform1i(where.uBlockWidth, held.blocks ? held.blocks.width : 1);
    }
  } else {
    gl.uniform1i(where.uOrbitWidth, 1);
    gl.uniform1i(where.uLast, 0);
    gl.uniform1i(where.uRebaseAt, 0);
    gl.uniform1i(where.uRebaseLast, 0);
    gl.uniform2f(where.uOffset, 0, 0);
    gl.uniform1i(where.uSkip, 0);
    gl.uniform2f(where.uSeries, 0, 0);
    gl.uniform2f(where.uSeries2, 0, 0);
    gl.uniform1i(where.uBlockCount, 0);
    gl.uniform1i(where.uRebaseBlock, 0);
    gl.uniform1i(where.uBlockTotal, 0);
    gl.uniform1i(where.uBlockWidth, 1);
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, lut);
  gl.uniform1i(where.uLut, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, session.orbit);
  gl.uniform1i(where.uOrbit, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, session.blocks);
  gl.uniform1i(where.uBlocks, 2);
  const ext = session.timerExt;
  // A band or strip covers fewer pixels than the stored frame size, so timing it would understate cost.
  const timeThis = Boolean(ext) && !session.timerSample && (!rows || (from === 0 && to === height)) && (!cols || (x0 === 0 && x1 === width));
  if (timeThis) {
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    session.timerSample = { query, width, height, cap: iterations };
  }
  const queued = Boolean(defer) && !rows && !cols;
  if (queued) {
    if (!bindFrameTarget(session, wide, tall)) {
      if (timeThis) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        session.timerSample = null;
      }
      return null;
    }
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (timeThis) gl.endQuery(ext.TIME_ELAPSED_EXT);
  if (queued) {
    if (session.fence) gl.deleteSync(session.fence);
    session.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    session.frameW = wide;
    session.frameH = tall;
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!session.fence) return null;
    session.deferred = true;
    return null;
  }
  return canvas;
}

/** Render a full frame into a texture and return once it is queued. The canvas is not readable yet. */
export function queueGpuEscape(args) {
  const session = boot();
  if (!session) return null;
  session.deferred = false;
  paintGpuEscape({ ...args, defer: true });
  return session.deferred ? true : null;
}

/** True when the queued frame's commands have finished. A missing queue counts as ready. */
export function gpuFrameReady() {
  const session = gpu;
  if (!session?.deferred || !session.fence) return !session?.deferred;
  const { gl } = session;
  const status = gl.clientWaitSync(session.fence, 0, 0);
  return status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED;
}

/** Copy a finished queued frame onto the canvas. Null while it is still running. */
export function finishGpuFrame() {
  const session = gpu;
  if (!session?.deferred || !gpuFrameReady()) return null;
  const { gl } = session;
  const w = session.frameW;
  const h = session.frameH;
  if (session.canvas.width !== w || session.canvas.height !== h) {
    session.canvas.width = w;
    session.canvas.height = h;
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, session.frameFb);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (session.fence) {
    gl.deleteSync(session.fence);
    session.fence = null;
  }
  session.deferred = false;
  return session.canvas;
}

/** Drop a queued frame so a later draw does not present it. */
export function cancelGpuFrame() {
  const session = gpu;
  if (!session) return;
  if (session.fence) {
    session.gl.deleteSync(session.fence);
    session.fence = null;
  }
  session.deferred = false;
  session.gl.bindFramebuffer(session.gl.FRAMEBUFFER, null);
}

function bindFrameTarget(session, width, height) {
  const { gl } = session;
  // The color target must not sit on a texture unit the shader samples, or the draw is rejected.
  gl.activeTexture(gl.TEXTURE3);
  if (!session.frameTex) {
    session.frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, session.frameTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    session.frameFb = gl.createFramebuffer();
  }
  gl.bindTexture(gl.TEXTURE_2D, session.frameTex);
  if (session.frameTexW !== width || session.frameTexH !== height) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, session.frameFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, session.frameTex, 0);
    session.frameTexW = width;
    session.frameTexH = height;
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, session.frameFb);
  }
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, session.blocks);
  gl.viewport(0, 0, width, height);
  return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
}
