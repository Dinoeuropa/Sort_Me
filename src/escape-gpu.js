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

int escapeDirect(vec2 p, int mode, int cap) {
  vec2 z = mode == 1 || mode == 3 ? p : vec2(0.0);
  vec2 c = mode == 0 || mode == 2 ? p : uParam;
  bool fold = mode >= 2;
  int iter = 0;
  for (int i = 0; i < LOOP; i++) {
    if (iter >= cap || dot(z, z) > 4.0) break;
    if (fold) z = abs(z);
    z = cmul(z, z) + c;
    iter += 1;
  }
  return iter;
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
  if (!inC) {
    vec2 z0 = orbitAt(0).xy + dz;
    if (dot(z0, z0) > 4.0) return 0;
  }
  if (uSkip > 0 && uSkip < cap && uSkip < last) {
    dz = cmul(uSeries, start);
    m = uSkip;
    iter = uSkip;
  }
  for (int i = 0; i < LOOP; i++) {
    if (iter >= cap) break;
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
  float py = uBand.x + uBand.y - gl_FragCoord.y;
  float ny = uFlip > 0.5 ? py / uResolution.y - 0.5 : 0.5 - py / uResolution.y;
  float nx = gl_FragCoord.x / uResolution.x - 0.5;
  vec2 u = vec2(nx * uScale * (uResolution.x / uResolution.y), ny * uScale);
  vec2 p = uCenter + u;
  int cap = uCap;
  int mode = uMode;
  int iter = 0;
  int basin = -1;
  if (mode < 4) {
    iter = uPerturb == 1 ? escapePerturbed(u, mode, cap) : escapeDirect(p, mode, cap);
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
  "uResolution", "uBand", "uCenter", "uScale", "uFlip", "uCap", "uMode", "uParam", "uLut", "uLutWidth", "uSpan",
  "uPerturb", "uOrbit", "uOrbitWidth", "uLast", "uRebaseAt", "uRebaseLast", "uOffset", "uSkip", "uSeries",
];

let gpu = null;
let failed = false;

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
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
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
    gpu = {
      gl,
      canvas,
      programs,
      lut,
      lutKey: "",
      orbit,
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
function referenceCap(mode, cap) {
  if (mode >= 4) return cap;
  return Math.min(GPU_ITER_LIMIT, Math.ceil(cap / 1024) * 1024);
}

function computeReference(mode, preset, cap) {
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
  const reach = referenceCap(mode, cap);
  const key = [mode, preset.cx, preset.cy, preset.px, preset.py, reach].join(":");
  const held = session.reference;
  if (held && held.key === key) {
    const offset = viewOffset(preset, held.center);
    if (Math.hypot(offset.dx, offset.dy) <= preset.scale * 0.5) return { ...held, offset };
  }
  const reference = computeReference(mode, preset, reach);
  const packed = packOrbit(reference);
  gl.bindTexture(gl.TEXTURE_2D, session.orbit);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, packed.width, packed.height, 0, gl.RGBA, gl.FLOAT, packed.data);
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
  };
  return { ...session.reference, offset: { dx: 0, dy: 0 } };
}

/**
 * Color the pixels on the GPU and return that canvas. `depth` is "direct" for plain float
 * coordinates or "perturb" for offsets from a double-double reference, from gpuDepthMode.
 * `rows` draws only a band of rows counted from the top, and the canvas returned is that band
 * alone, so a heavy frame can be drawn a band at a time. `floor` and `top` fit the
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
}) {
  const mode = gpuEscapeMode(fractalId, preset);
  const iterations = cap | 0;
  if (mode < 0 || iterations < 1 || iterations > GPU_ITER_LIMIT || width < 1 || height < 1) return null;
  if (depth !== "direct" && depth !== "perturb") return null;
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
  const tall = to - from;
  if (canvas.width !== width || canvas.height !== tall) {
    canvas.width = width;
    canvas.height = tall;
  }
  gl.viewport(0, 0, width, tall);
  gl.useProgram(program);
  gl.uniform2f(where.uResolution, width, height);
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
  gl.uniform1i(where.uPerturb, depth === "perturb" ? 1 : 0);
  if (depth === "perturb") {
    const held = referenceFor(session, mode, preset, iterations);
    const { packed, reference, offset } = held;
    gl.uniform1i(where.uOrbitWidth, packed.width);
    gl.uniform1i(where.uLast, packed.last);
    gl.uniform1i(where.uRebaseAt, packed.rebaseAt);
    gl.uniform1i(where.uRebaseLast, packed.rebaseLast);
    gl.uniform2f(where.uOffset, offset.dx, offset.dy);
    const aspect = width / height;
    const radius = Math.hypot(offset.dx, offset.dy) + Math.hypot(preset.scale * aspect, preset.scale) / 2;
    const skip = reference.series ? seriesSkip(reference, radius) : 0;
    gl.uniform1i(where.uSkip, skip);
    gl.uniform2f(where.uSeries, skip > 0 ? reference.series[skip * 2] : 0, skip > 0 ? reference.series[skip * 2 + 1] : 0);
  } else {
    gl.uniform1i(where.uOrbitWidth, 1);
    gl.uniform1i(where.uLast, 0);
    gl.uniform1i(where.uRebaseAt, 0);
    gl.uniform1i(where.uRebaseLast, 0);
    gl.uniform2f(where.uOffset, 0, 0);
    gl.uniform1i(where.uSkip, 0);
    gl.uniform2f(where.uSeries, 0, 0);
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, lut);
  gl.uniform1i(where.uLut, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, session.orbit);
  gl.uniform1i(where.uOrbit, 1);
  const ext = session.timerExt;
  // A band covers fewer pixels than the stored frame size, so timing it would understate cost.
  const timeThis = Boolean(ext) && !session.timerSample && (!rows || (from === 0 && to === height));
  if (timeThis) {
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    session.timerSample = { query, width, height, cap: iterations };
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (timeThis) gl.endQuery(ext.TIME_ELAPSED_EXT);
  return canvas;
}
