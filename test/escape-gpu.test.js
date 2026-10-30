import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { paintEscape } from "../src/palettes.js";
import { ITERATION_LIMIT } from "../src/fractal-view.js";
import { juliaReference, newtonReference, perturbIterations, referenceOrbit, shipReference } from "../src/precision.js";
import {
  GPU_BLOCK_COEFF,
  GPU_ITER_LIMIT,
  buildPaletteLut,
  gpuDrawLimit,
  gpuEscapeMode,
  gpuQuadraticBlocks,
  loopLimitForCap,
  packOrbit,
  packQuadraticBlocks,
} from "../src/escape-gpu.js";

function painted(cap, iteration, basin, floor, top) {
  return paintEscape("classic", [iteration], [basin], 1, 1, cap, 1, null, floor, top);
}

test("the shader palette holds the colors paintEscape writes, fitted window included", () => {
  for (const [cap, floor, top] of [[48, 0, null], [3000, 120, 900], [ITERATION_LIMIT, 4000, 9000]]) {
    const lut = buildPaletteLut("classic", cap, floor, top);
    const span = cap + 1;
    assert.equal(lut.span, span);
    assert.ok(lut.width <= 2048);
    assert.ok(lut.width * lut.height >= span * 4);
    assert.equal(lut.data.length, lut.width * lut.height * 4);
    for (const iter of [0, 1, floor, floor + 1, Math.floor(cap / 2), top ?? cap - 1, cap - 1, cap]) {
      for (let slot = 0; slot < 4; slot += 1) {
        const expected = painted(cap, iter, slot < 3 ? slot : -1, floor, top);
        const offset = (slot * span + iter) * 4;
        assert.deepEqual([...lut.data.subarray(offset, offset + 4)], [...expected], `cap ${cap} slot ${slot} iter ${iter}`);
      }
    }
  }
  assert.equal(GPU_ITER_LIMIT, ITERATION_LIMIT);
});

test("a reference orbit packs into one float texture with its rebase orbit after it", () => {
  const ref = referenceOrbit(-0.75, 0, 0.1, 0, 500);
  const packed = packOrbit(ref);
  assert.equal(packed.last, ref.count - 1);
  assert.equal(packed.rebaseAt, 0);
  assert.equal(packed.rebaseLast, ref.count - 1);
  assert.ok(packed.width <= 2048);
  assert.equal(packed.data.length, packed.width * packed.height * 4);
  for (const n of [0, 1, ref.count - 1]) {
    assert.equal(packed.data[n * 4], Math.fround(ref.orbit[n * 2]));
    assert.equal(packed.data[n * 4 + 1], Math.fround(ref.orbit[n * 2 + 1]));
  }

  const julia = juliaReference(0.1, 0, 0.2, 0, -0.123, 0.745, 2500);
  const both = packOrbit(julia);
  assert.equal(both.rebaseAt, julia.count);
  assert.equal(both.rebaseLast, julia.rebase.count - 1);
  assert.ok(both.width * both.height >= julia.count + julia.rebase.count);
  for (const n of [0, 3, julia.rebase.count - 1]) {
    assert.equal(both.data[(both.rebaseAt + n) * 4], Math.fround(julia.rebase.orbit[n * 2]));
    assert.equal(both.data[(both.rebaseAt + n) * 4 + 1], Math.fround(julia.rebase.orbit[n * 2 + 1]));
  }

  const newton = newtonReference(-0.625, 0, -0.2551, 0, 0, 0, 120);
  const steps = packOrbit(newton);
  assert.equal(steps.last, newton.count - 1);
  for (const n of [0, newton.count - 1]) {
    assert.equal(steps.data[n * 4], Math.fround(newton.orbit[n * 2]));
    assert.equal(steps.data[n * 4 + 2], Math.fround(newton.denom[n * 2]));
    assert.equal(steps.data[n * 4 + 3], Math.fround(newton.denom[n * 2 + 1]));
  }
});

test("each escape fractal picks the shader that matches its formula", () => {
  assert.equal(gpuEscapeMode("mandelbrot", {}), 0);
  assert.equal(gpuEscapeMode("julia", { cx: -0.1, cy: 0.7 }), 1);
  assert.equal(gpuEscapeMode("burning", { flipY: true }), 2);
  assert.equal(gpuEscapeMode("burning", { cx: 0.2, cy: -0.4 }), 3);
  assert.equal(gpuEscapeMode("newton", {}), 4);
  assert.equal(gpuEscapeMode("newton", { px: 0.1, py: 0 }), 5);
  assert.equal(gpuEscapeMode("koch", {}), -1);
});

test("the shader loop is the smallest bucket that covers the cap", () => {
  assert.equal(loopLimitForCap(1), 256);
  assert.equal(loopLimitForCap(256), 256);
  assert.equal(loopLimitForCap(257), 1024);
  assert.equal(loopLimitForCap(1024), 1024);
  assert.equal(loopLimitForCap(1025), 4096);
  assert.equal(loopLimitForCap(4096), 4096);
  assert.equal(loopLimitForCap(4097), 16384);
  assert.equal(loopLimitForCap(GPU_ITER_LIMIT), 16384);
  assert.equal(loopLimitForCap(999999), 16384);
});

test("a GPU frame is timed without reading a pixel back", () => {
  const source = readFileSync(new URL("../src/escape-gpu.js", import.meta.url), "utf8");
  assert.equal(source.includes("readPixels"), false);
  assert.match(source, /EXT_disjoint_timer_query_webgl2/);
  assert.match(source, /preserveDrawingBuffer:\s*false/);
  assert.match(source, /export function useGpuSurface/);
  assert.match(source, /export function pollGpuCost/);
  assert.match(source, /int escapeDeep/);
  assert.match(source, /uPerturb == 2/);
  assert.match(source, /timeThis = Boolean\(ext\) && !session\.timerSample && \(!rows \|\| \(from === 0 && to === height\)\)/);
});

test("gpuDrawLimit is the smallest drawing-buffer guarantee, or null without WebGL2", () => {
  assert.equal(gpuDrawLimit(), null);
  const source = readFileSync(new URL("../src/escape-gpu.js", import.meta.url), "utf8");
  assert.match(source, /export function gpuDrawLimit/);
  assert.match(source, /MAX_RENDERBUFFER_SIZE/);
  assert.match(source, /MAX_VIEWPORT_DIMS/);
  const paint = source.slice(source.indexOf("export function paintGpuEscape"));
  assert.match(paint, /drawingBufferWidth/);
  assert.match(paint, /drawingBufferHeight/);
  assert.match(
    paint,
    /drawingBufferWidth[\s\S]{0,200}drawingBufferHeight[\s\S]{0,200}return null/,
  );
  const app = readFileSync(new URL("../src/fractal-app.js", import.meta.url), "utf8");
  assert.match(app, /settledRaster\([^;]*gpuDrawLimit\(\)/);
  assert.match(app, /zoomRaster\(/);
  assert.match(app, /const share = 1/);
  assert.doesNotMatch(app, /motionPace\(state\.zoomPace/);
  assert.doesNotMatch(app, /autoZoom \? 1 : motionScale/);
  assert.match(app, /paletteProbe\.step\(\)/);
  assert.doesNotMatch(app, /at the monitor's own resolution/);
  assert.match(app, /settledRaster, which can be larger than the screen and is limited by the GPU's drawing buffer/);
  assert.match(app, /zoomFrameBlit\(/);
  assert.match(app, /gpuZoomPlan\(/);
  assert.match(app, /queueGpuEscape\(/);
  assert.match(app, /advanceAutoZoom\(path, state\.autoOctave, 1\)/);
  assert.match(app, /if \(next\.done && !state\.autoFade && state\.autoStart\) beginAutoFade\(\)/);
  assert.match(app, /queueGpuZoom\(/);
  assert.doesNotMatch(app, /overlayGpuZoom\(/);
  assert.doesNotMatch(app, /next\.done \? path\.maxOctave : next\.octave/);
  assert.doesNotMatch(app, /retargetAutoZoom\(/);
  assert.doesNotMatch(app, /Math\.min\(120, Math\.max\(16, now - \(state\.zoomStamp/);
});

test("quadratic blocks that fit in float32 pack four texels and skip the middle of a deep pixel", () => {
  // The smooth top of the island, a long reference orbit. The zoom aims a filament
  // just above it, where this same edge would fill the frame.
  const edge = {
    x: -1.7548776662466927,
    xLo: -3.5521875096478247e-17,
    y: 0.011953206752823513,
    yLo: -8.640220701907486e-19,
  };
  const cap = 4096;
  const ref = referenceOrbit(edge.x, edge.xLo, edge.y, edge.yLo, cap);
  const gpu = gpuQuadraticBlocks(ref);
  assert.equal(gpu.rebaseAt, 0);
  assert.ok(gpu.blocks.length > 16, `kept ${gpu.blocks.length}`);
  assert.ok(gpu.blocks.every((block) => Math.abs(block.cxx) <= GPU_BLOCK_COEFF && Math.abs(block.exx) <= GPU_BLOCK_COEFF));
  const packed = packQuadraticBlocks(gpu.blocks);
  assert.equal(packed.count, gpu.blocks.length);
  assert.equal(packed.data[0], Math.fround(gpu.blocks[0].ax));
  assert.equal(packed.data[1], Math.fround(gpu.blocks[0].ay));
  assert.equal(packed.data[2], Math.fround(gpu.blocks[0].bx));
  assert.equal(packed.data[3], Math.fround(gpu.blocks[0].by));
  assert.equal(packed.data[4], Math.fround(gpu.blocks[0].cxx));
  assert.equal(packed.data[12], gpu.blocks[0].at);
  assert.equal(packed.data[13], gpu.blocks[0].length);
  assert.equal(packed.data[14], Math.fround(gpu.blocks[0].radius));
  const bare = { ...ref, blocks: null };
  bare.rebase = bare;
  const slow = perturbIterations(bare, 1e-12, 3e-13, cap, 0, { trace: true });
  const trimmed = { ...ref, blocks: gpu.blocks };
  trimmed.rebase = trimmed;
  const fast = perturbIterations(trimmed, 1e-12, 3e-13, cap, 0, { trace: true });
  const exact = perturbIterations(ref, 1e-12, 3e-13, cap, 0, { trace: true });
  assert.equal(fast.iter, exact.iter);
  assert.equal(fast.iter, slow.iter);
  assert.ok(fast.steps < slow.steps * 0.5, `steps ${fast.steps} of ${slow.steps}`);

  const huge = {
    at: 0, length: 8, radius: 1,
    ax: 1, ay: 0, bx: 0, by: 0, cxx: GPU_BLOCK_COEFF * 10, cxy: 0, dxx: 0, dxy: 0, exx: 0, exy: 0,
  };
  const dropped = gpuQuadraticBlocks({ fold: false, blocks: [huge], rebase: null });
  assert.equal(dropped.blocks.length, 0);
  assert.equal(dropped.rebaseAt, 0);
  assert.equal(gpuQuadraticBlocks(shipReference(-1.8, 0, 0.01, 0, 200)).blocks.length, 0);

  const julia = juliaReference(-0.12, 0, 0.18, 0, -0.8, 0.156, 2048);
  const juliaGpu = gpuQuadraticBlocks(julia);
  assert.ok(juliaGpu.rebaseAt > 0 && juliaGpu.blocks.length > juliaGpu.rebaseAt);

  const source = readFileSync(new URL("../src/escape-gpu.js", import.meta.url), "utf8");
  assert.match(source, /packQuadraticBlocks/);
  assert.match(source, /cmul\(c1\.xy, x2\)/);
  assert.match(source, /export function queueGpuEscape/);
  assert.match(source, /bindFramebuffer/);
  assert.match(source, /preserveDrawingBuffer:\s*false/);
  const perturbArm = source.slice(source.indexOf("} else {"), source.indexOf("gl.activeTexture(gl.TEXTURE0)"));
  assert.match(perturbArm, /packQuadraticBlocks|quadBlocks|gpuQuadraticBlocks/);
});
