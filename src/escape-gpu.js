import { colorSample } from "./palettes.js";

/** The shader loop stops here. A taller cap stays on the worker path. */
export const GPU_ITER_LIMIT = 4096;

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
 * The same colors paintEscape would write, packed for a nearest-neighbor lookup.
 * Four rows: basins 0, 1, 2, then the ordinary ramp. One column per iteration.
 */
export function buildPaletteLut(paletteId, cap) {
  const span = Math.max(1, cap) + 1;
  const data = new Uint8Array(span * 4 * 4);
  for (let slot = 0; slot < 4; slot += 1) {
    const basin = slot < 3 ? slot : -1;
    for (let iter = 0; iter < span; iter += 1) {
      const rgb = colorSample(paletteId, iter, cap, basin);
      const offset = (slot * span + iter) * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }
  return data;
}

const VERT = `#version 300 es
void main() {
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uScale;
uniform float uFlip;
uniform int uCap;
uniform int uMode;
uniform vec2 uParam;
uniform sampler2D uLut;
out vec4 outColor;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
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

void main() {
  float py = uResolution.y - gl_FragCoord.y - 0.5;
  float ny = uFlip > 0.5
    ? (py + 0.5) / uResolution.y - 0.5
    : 0.5 - (py + 0.5) / uResolution.y;
  float spanY = uScale;
  float spanX = uScale * (uResolution.x / uResolution.y);
  float cx = uCenter.x + (gl_FragCoord.x / uResolution.x - 0.5) * spanX;
  float cy = uCenter.y + ny * spanY;
  int cap = uCap;
  int iter = 0;
  int basin = -1;
  int mode = uMode;
  if (mode < 4) {
    vec2 z = mode == 1 || mode == 3 ? vec2(cx, cy) : vec2(0.0);
    vec2 c = mode == 0 || mode == 2 ? vec2(cx, cy) : uParam;
    bool fold = mode >= 2;
    for (int i = 0; i < 4096; i++) {
      if (iter >= cap || dot(z, z) > 4.0) break;
      if (fold) z = abs(z);
      z = cmul(z, z) + c;
      iter += 1;
    }
  } else {
    vec2 z = vec2(cx, cy);
    vec2 bend = mode == 5 ? uParam : vec2(0.0);
    for (int i = 0; i < 4096; i++) {
      if (iter >= cap) break;
      if (mode == 4) {
        int near = basinOf(z, 1e-6);
        if (near >= 0) {
          basin = near;
          iter += 1;
          break;
        }
      }
      vec2 z2 = cmul(z, z);
      vec2 z3 = cmul(z2, z);
      vec2 f = z3 + vec2(bend.x * z.x - bend.y * z.y, bend.x * z.y + bend.y * z.x) - vec2(1.0, 0.0);
      if (mode == 4) f = z3 - vec2(1.0, 0.0);
      vec2 d = 3.0 * z2 + bend;
      float denom = dot(d, d);
      if (!(denom > 0.0) || denom > 1e30) {
        basin = basinOf(z, 0.0);
        iter += 1;
        break;
      }
      vec2 step = vec2(dot(f, d), f.y * d.x - f.x * d.y) / denom;
      z -= step;
      iter += 1;
      if (mode == 5 && dot(step, step) < 1e-12) {
        basin = basinOf(z, 0.0);
        break;
      }
    }
    if (basin < 0) basin = basinOf(z, 0.0);
  }
  int slot = basin < 0 ? 3 : basin;
  float u = (float(iter) + 0.5) / float(cap + 1);
  float v = (float(slot) + 0.5) / 4.0;
  outColor = texture(uLut, vec2(u, v));
}
`;

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
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      failed = true;
      return null;
    }
    const vert = shader(gl, gl.VERTEX_SHADER, VERT);
    const frag = shader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) {
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
    const lut = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gpu = { gl, canvas, program, lut, lutKey: "" };
    return gpu;
  } catch {
    failed = true;
    return null;
  }
}

/**
 * Color the visible pixels on the GPU and return that canvas.
 * Nothing is kept but the picture itself: no iteration grid, no saved plate.
 * Returns null where WebGL2 is missing or the cap is past the shader loop.
 */
export function paintGpuEscape({ width, height, fractalId, preset, cap, paletteId }) {
  const mode = gpuEscapeMode(fractalId, preset);
  const iterations = cap | 0;
  if (mode < 0 || iterations < 1 || iterations > GPU_ITER_LIMIT || width < 1 || height < 1) return null;
  const session = boot();
  if (!session) return null;
  const { gl, canvas, program, lut } = session;
  const key = `${paletteId}:${iterations}`;
  if (session.lutKey !== key) {
    const table = buildPaletteLut(paletteId, iterations);
    gl.bindTexture(gl.TEXTURE_2D, lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, iterations + 1, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, table);
    session.lutKey = key;
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.uniform2f(gl.getUniformLocation(program, "uResolution"), width, height);
  gl.uniform2f(gl.getUniformLocation(program, "uCenter"), preset.centerX, preset.centerY);
  gl.uniform1f(gl.getUniformLocation(program, "uScale"), preset.scale);
  gl.uniform1f(gl.getUniformLocation(program, "uFlip"), preset.flipY ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(program, "uCap"), iterations);
  gl.uniform1i(gl.getUniformLocation(program, "uMode"), mode);
  const paramX = mode === 5 ? preset.px || 0 : preset.cx || 0;
  const paramY = mode === 5 ? preset.py || 0 : preset.cy || 0;
  gl.uniform2f(gl.getUniformLocation(program, "uParam"), paramX, paramY);
  gl.uniform1i(gl.getUniformLocation(program, "uLut"), 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, lut);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return canvas;
}
