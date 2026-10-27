# GPU Resolution and Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make escape-time GPU frames cheaper so a settled picture can be drawn sharper than the screen, without stalling the page on every frame.

**Architecture:** The fragment shader is compiled once per loop bucket so a shallow cap does not carry a 16,384-step loop. Frames are timed with a disjoint timer query instead of a blocking pixel read. Mandelbrot interiors return the cap before iterating, and the existing one-shot perturbation skip gains a quadratic term. A settled view is rasterized above the display size; a pure pan recopies the overlap and shades only the new strips. The page keeps one 2D canvas, because curves, the Draw animation, and worker plates all paint that same surface.

**Tech Stack:** Browser WebGL2, existing ES modules, `node --test`. No new dependencies.

## Global Constraints

- Tests run with `node --test`. No new npm dependencies.
- The page canvas stays a 2D canvas. Do not replace it with the WebGL canvas.
- Do not add WebGPU.
- Loop buckets are exactly 256, 1024, 4096, and 16384. `loopLimitForCap` returns the smallest bucket that is greater than or equal to the cap, and 16384 when the cap is above 4096.
- `src/escape-gpu.js` must not call `readPixels`. The context is created with `preserveDrawingBuffer: false`.
- Exterior Mandelbrot points keep the iteration count of a plain loop. The cardioid and period-2 bulb return the cap. A power-of-two exact period match also returns the cap.
- Do not weaken existing agreement thresholds in `test/precision.test.js` (34 of 36, and 0.985).
- Series extension is one quadratic step at the start of the orbit, the same step on the CPU and the GPU. No chained bilinear blocks.
- Moving GPU frames stay on `motionRaster` (device pixel ratio capped at 2, then `motionScale`). Only a settled frame (`settle === true`) uses `settledRaster`.
- A pan reuses pixels only when the scale, flip, and pixel size are unchanged, the shift rounds to a nonzero amount inside half the frame on both axes, and the moving frame is being drawn at full share (`share === 1`).
- Settled long edge is at most 7680. Settled device pixel ratio is capped at 3, then multiplied by 2.
- Commit only the files the task lists. Do not commit `.superpowers/`.

---

### Task 1: Shader loop buckets

**Files:**
- Modify: `src/escape-gpu.js`
- Test: `test/escape-gpu.test.js`

**Interfaces:**
- Consumes: `GPU_ITER_LIMIT` (16384), the existing `FRAG` shader text, `boot`, `paintGpuEscape`
- Produces: `export function loopLimitForCap(cap: number): 256 | 1024 | 4096 | 16384`. `boot` compiles one program per bucket. `paintGpuEscape` binds the program for `loopLimitForCap(cap)`.

- [ ] **Step 1: Write the failing test**

Add to `test/escape-gpu.test.js`:

```js
import { GPU_ITER_LIMIT, buildPaletteLut, gpuEscapeMode, loopLimitForCap, packOrbit } from "../src/escape-gpu.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/escape-gpu.test.js`

Expected: FAIL, `loopLimitForCap` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/escape-gpu.js`, add:

```js
const LOOP_LIMITS = [256, 1024, 4096, 16384];

/** Smallest compiled loop bound that can run this cap. */
export function loopLimitForCap(cap) {
  const n = cap | 0;
  for (const limit of LOOP_LIMITS) {
    if (n <= limit) return limit;
  }
  return LOOP_LIMITS[LOOP_LIMITS.length - 1];
}
```

Turn the fragment shader into a function of that bound. Replace the template constant:

```js
const int LOOP = ${GPU_ITER_LIMIT};
```

with a function:

```js
function fragmentSource(loopLimit) {
  return `#version 300 es
  ... existing shader ...
  const int LOOP = ${loopLimit};
  ... existing shader ...
  `;
}
```

Keep the vertex shader as it is. In `boot`, compile one linked program per entry of `LOOP_LIMITS`. Each program has its own uniform-location map built from `UNIFORMS`. Store them on the session as `programs`, a `Map` from loop limit to `{ program, where }`. Textures, the canvas, and the probe stay shared. If any bucket fails to compile or link, fail the session the same way a single program failure does today.

In `paintGpuEscape`, after the cap check, choose `loopLimitForCap(iterations)` and bind that program and its location map for the rest of the draw. Do not change the formula, the uniforms' values, or the `readPixels` call in this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/escape-gpu.test.js test/fractal-page.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/escape-gpu.js test/escape-gpu.test.js
git commit -m "Compile the escape shader once per iteration bucket."
```

---

### Task 2: Stop blocking on a pixel read

**Files:**
- Modify: `src/escape-gpu.js`
- Modify: `src/fractal-app.js` (`timeGpu` only)
- Test: `test/escape-gpu.test.js`

**Interfaces:**
- Consumes: `loopLimitForCap`, the session from Task 1, `timeGpu` in `src/fractal-app.js`
- Produces: `export function pollGpuCost(): number | null`. Null when no completed timer sample is waiting. A number is milliseconds per million pixels per iteration of the draw that just finished on the GPU. `paintGpuEscape` no longer calls `readPixels`.

- [ ] **Step 1: Write the failing test**

Add to `test/escape-gpu.test.js`:

```js
import { readFileSync } from "node:fs";

test("a GPU frame is timed without reading a pixel back", () => {
  const source = readFileSync(new URL("../src/escape-gpu.js", import.meta.url), "utf8");
  assert.equal(source.includes("readPixels"), false);
  assert.match(source, /EXT_disjoint_timer_query_webgl2/);
  assert.match(source, /preserveDrawingBuffer:\s*false/);
  assert.match(source, /export function pollGpuCost/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/escape-gpu.test.js`

Expected: FAIL, because `readPixels` is still in the file.

- [ ] **Step 3: Write minimal implementation**

In `boot`, request the context with `preserveDrawingBuffer: false`. Keep `alpha: false`, `antialias: false`, `depth: false`, `stencil: false`, and `powerPreference: "high-performance"`.

Load `gl.getExtension("EXT_disjoint_timer_query_webgl2")` onto the session. Around `gl.drawArrays` in `paintGpuEscape`:

- If a previous query is still stored, do not start another one.
- Otherwise, when the extension exists, `beginQuery(TIME_ELAPSED_EXT, query)` before the draw and `endQuery(TIME_ELAPSED_EXT)` after it.
- Store `{ query, width, height, cap }` on the session, using the full frame's `width`, `height`, and iteration cap (not the band size).
- Delete the `readPixels` call and the `probe` buffer.

`pollGpuCost`:

- Return null when there is no stored query.
- Return null when `QUERY_RESULT_AVAILABLE` is false. Do not wait.
- When the result is available, read `QUERY_RESULT` (nanoseconds), delete the query, clear the stored sample, and return `nanoseconds / 1e6 / (((width * height) / 1e6) * max(1, cap))`.
- If `GPU_DISJOINT_EXT` is set, delete the query and return null.

In `timeGpu` in `src/fractal-app.js`, poll before painting, then paint. When the poll returns a finite number greater than 0, fold it into `gpuClock.cost` with the same half-and-half average used today. Wall-clock `performance.now()` around the paint is removed, so a frame no longer waits on the GPU. The first frames leave `gpuClock.cost` as `NaN`, and `motionScale` already treats that as a full-size frame.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/escape-gpu.test.js test/fractal-page.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/escape-gpu.js src/fractal-app.js test/escape-gpu.test.js
git commit -m "Time GPU frames with a timer query instead of a pixel read."
```

---

### Task 3: Mandelbrot interior early-out

**Files:**
- Modify: `src/fractals.js` (`mandelbrotIterations`)
- Modify: `src/escape-gpu.js` (`escapeDirect` only)
- Test: `test/fractals.test.js`

**Interfaces:**
- Consumes: `mandelbrotIterations`, `escapeDirect` in the fragment source
- Produces: `export function mandelbrotBulb(cx, cy): boolean`. Interiors of the main cardioid and the period-2 bulb return the cap. A direct Mandelbrot orbit that lands exactly on a saved point at a power-of-two iteration returns the cap. Exterior points are unchanged.

- [ ] **Step 1: Write the failing test**

Add to `test/fractals.test.js`, and import `mandelbrotBulb` from `../src/fractals.js`:

```js
test("the cardioid and period-2 bulb are known before the loop runs", () => {
  assert.equal(mandelbrotBulb(0, 0), true);
  assert.equal(mandelbrotBulb(-1, 0), true);
  assert.equal(mandelbrotBulb(0.1, 0.1), true);
  assert.equal(mandelbrotBulb(0.3, 0.5), false);
  assert.equal(mandelbrotBulb(-1.5, 0.01), false);
  assert.equal(mandelbrotBulb(0.26, 0), false);
  const plain = (cx, cy, maxIter) => {
    let x = 0;
    let y = 0;
    let iter = 0;
    while (x * x + y * y <= 4 && iter < maxIter) {
      const next = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = next;
      iter += 1;
    }
    return iter;
  };
  for (const [cx, cy] of [[0.3, 0.5], [-0.1, 1], [0.4, -0.3], [-1.5, 0.01], [0.1, 0.7]]) {
    assert.equal(escapeValue("mandelbrot", {}, cx, cy, 300).iteration, plain(cx, cy, 300), `${cx},${cy}`);
  }
});
```

`(0.26, 0)` sits just outside the cusp, so the bulb test is false there. The five points escape before 300 iterations.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/fractals.test.js`

Expected: FAIL, because `mandelbrotBulb` is not exported.

- [ ] **Step 3: Write minimal implementation**

Export `mandelbrotBulb` with the two inequalities below, and replace `mandelbrotIterations` with:

```js
export function mandelbrotBulb(cx, cy) {
  const y2 = cy * cy;
  const x1 = cx - 0.25;
  const q = x1 * x1 + y2;
  if (q * (q + x1) <= 0.25 * y2) return true;
  const xb = cx + 1;
  return xb * xb + y2 <= 0.0625;
}

function mandelbrotIterations(cx, cy, maxIter) {
  if (mandelbrotBulb(cx, cy)) return maxIter;
  let x = 0;
  let y = 0;
  let iter = 0;
  let savedX = 0;
  let savedY = 0;
  let check = 3;
  while (x * x + y * y <= 4 && iter < maxIter) {
    const next = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = next;
    iter += 1;
    if (x === savedX && y === savedY) return maxIter;
    if (iter === check) {
      savedX = x;
      savedY = y;
      check *= 2;
    }
  }
  return iter;
}
```

In `escapeDirect`, before the loop, for `mode == 0` only, apply the same two inequalities to `p` and `return cap` when either holds. Inside the loop, for `mode == 0` only, keep a saved `vec2` and a check that starts at 3 and doubles, and `return cap` when `z` equals the saved point. GLSL:

```glsl
bool mandelbrotBulb(vec2 c) {
  float y2 = c.y * c.y;
  float x1 = c.x - 0.25;
  float q = x1 * x1 + y2;
  if (q * (q + x1) <= 0.25 * y2) return true;
  float xb = c.x + 1.0;
  return xb * xb + y2 <= 0.0625;
}
```

Initialize the saved point and `check` inside `escapeDirect`. Julia and burning-ship modes must not take this branch. Do not change `escapePerturbed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/fractals.test.js test/escape-gpu.test.js test/precision.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fractals.js src/escape-gpu.js test/fractals.test.js
git commit -m "Return the cap for Mandelbrot interiors before iterating."
```

---

### Task 4: Quadratic perturbation skip

**Files:**
- Modify: `src/precision.js` (`orbitOf`, `seriesSkip`, `perturbIterations`)
- Modify: `src/escape-gpu.js` (uniform `uSeries2`, the skip apply in `escapePerturbed`)
- Test: `test/precision.test.js`

**Interfaces:**
- Consumes: `reference.series` (`B_n`), `reference.reach`, `seriesSkip`, `perturbIterations`, uniform `uSeries`
- Produces: `reference.quad`, the complex `A_n` of `δ_n = B_n u + A_n u²`. `seriesSkip` may advance farther while the omitted cubic term stays inside `SERIES_TOLERANCE`. `perturbIterations` applies `B` and `A` together. The shader uniform `uSeries2` is `A` at the same index as `uSeries`.

- [ ] **Step 1: Write the failing test**

Add to `test/precision.test.js`:

```js
test("the quadratic skip matches an unskipped perturbation on a small plate", () => {
  const target = autoZoomTarget("mandelbrot", {});
  const scale = 1e-12;
  const cap = 2048;
  const reference = referenceOrbit(target.x, target.xLo, target.y, target.yLo, cap);
  assert.ok(reference.quad);
  assert.equal(reference.quad.length, reference.series.length);
  const skip = seriesSkip(reference, scale * Math.SQRT1_2);
  assert.ok(skip > 0, `skip ${skip}`);
  let same = 0;
  const samples = 16;
  for (let j = 0; j < 4; j += 1) {
    for (let i = 0; i < 4; i += 1) {
      const ux = ((i + 0.5) / 4 - 0.5) * scale;
      const uy = ((j + 0.5) / 4 - 0.5) * scale;
      const fast = perturbIterations(reference, ux, uy, cap, skip);
      const exact = perturbIterations(reference, ux, uy, cap, 0);
      if (fast === exact) same += 1;
    }
  }
  assert.equal(same, samples);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/precision.test.js`

Expected: FAIL, because `reference.quad` is missing.

- [ ] **Step 3: Write minimal implementation**

In `orbitOf`, beside `series` and `reach`, allocate `quad` and `cubic` as `Float64Array`s of the same length as `series` when `series` exists. They stay null for the fold.

Initial values, with `inC` true for an offset in c:

- `B_0 = 0` when `inC`, else `1`. `A_0 = 0`. `C_0 = 0`. This matches the current `series[0]`.

Recurrence, `Z_n` the reference point already stored at index `n` (the value in `orbit` before the step that produces index `n + 1`, which is `orbit` at `n`):

- `B_{n+1} = 2 Z_n B_n + (inC ? 1 : 0)` — this is the recurrence already in the file. Do not change it.
- `A_{n+1} = 2 Z_n A_n + B_n²`
- `C_{n+1} = 2 Z_n C_n + 2 A_n B_n`

Complex products use the same `px, py` real and imaginary parts the `B` recurrence already uses. Store `A` in `quad` and `C` in `cubic`. `cubic` is only for the skip bound. Attach `quad` on the returned reference. Do not attach `cubic` if that would change the object shape consumed elsewhere; keep `cubic` local and fold its size into `reach`, or store the bound in the existing `reach` array.

Replace the `reach` update so entry `n` is the running maximum of `error(k) / |Z_k|` for `k <= n`, where

```js
function skipError(radius, b, a, c) {
  return Math.hypot(c[0], c[1]) * radius * radius * radius;
}
```

and the step is usable only when the kept terms are still a small fraction of `Z`:

```js
const kept = Math.hypot(bx, by) * radius + Math.hypot(ax, ay) * radius * radius;
const usable = size > 0 && kept <= 0.25 * size && skipError(radius, b, a, c) <= SERIES_TOLERANCE * size;
```

`seriesSkip` walks while `usable` holds at `skip + 1`, using that radius. Cache on `skipRadius` as it does now. Radius `0`, a missing series, and the fold still return 0. The skip still stops at `count - 2`.

In `perturbIterations`, when the skip applies, replace the linear step with:

```js
const ux2 = ux * ux - uy * uy;
const uy2 = 2 * ux * uy;
const bx = reference.series[skip * 2];
const by = reference.series[skip * 2 + 1];
const ax = reference.quad[skip * 2];
const ay = reference.quad[skip * 2 + 1];
dx = bx * ux - by * uy + ax * ux2 - ay * uy2;
dy = bx * uy + by * ux + ax * uy2 + ay * ux2;
```

`m` and `iter` still become `skip`.

In the shader, add `uniform vec2 uSeries2;`. Where `dz = cmul(uSeries, start)` is applied, use the same quadratic combination of `uSeries`, `uSeries2`, and `start`. Add `"uSeries2"` to `UNIFORMS`. In `paintGpuEscape`, set `uSeries2` from `reference.quad` at the skip index, and `vec2(0)` when there is no quad or no skip. The CPU reference is what `referenceFor` already returns; read `.quad` from it.

Existing tests allow the linear skip to miss 2 of 36 pixels. This task's new test requires all 16 to match. If a longer skip breaks an existing test, shorten the skip by raising the `0.25` coefficient or by keeping the old `reach * radius <= SERIES_TOLERANCE` condition in addition to the cubic test. Do not lower the existing numeric thresholds.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/precision.test.js test/escape-gpu.test.js test/fractals.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/precision.js src/escape-gpu.js test/precision.test.js
git commit -m "Skip perturbation iterations with a quadratic term."
```

---

### Task 5: Settled supersample

**Files:**
- Modify: `src/fractal-view.js`
- Modify: `src/fractal-app.js` (`viewBox`, `paintGpuFrame`)
- Test: `test/fractal-view.test.js`

**Interfaces:**
- Consumes: `motionRaster`, `paintGpuFrame(view, box, settle)`, `viewBox`
- Produces: `export const SETTLED_DPR_MAX = 3`, `export const SETTLED_SUPERSAMPLE = 2`, `export const SETTLED_EDGE_MAX = 7680`, `export function settledRaster(width, height, dpr): { width, height }`. `viewBox` gains `rawDpr`, the uncapped `devicePixelRatio` (at least 1). `paintGpuFrame` uses `settledRaster(box.width, box.height, box.rawDpr)` when `settle` is true and `motionRaster(box)` otherwise.

- [ ] **Step 1: Write the failing test**

Add to `test/fractal-view.test.js`, importing the new symbols from `./fractal-view.js`:

```js
test("a settled raster is twice the device pixels, capped at 3x and a 7680 edge", () => {
  assert.equal(SETTLED_DPR_MAX, 3);
  assert.equal(SETTLED_SUPERSAMPLE, 2);
  assert.equal(SETTLED_EDGE_MAX, 7680);
  assert.deepEqual(settledRaster(800, 600, 1), { width: 1600, height: 1200 });
  assert.deepEqual(settledRaster(800, 600, 2), { width: 3200, height: 2400 });
  assert.deepEqual(settledRaster(800, 600, 4), { width: 4800, height: 3600 });
  const wide = settledRaster(4000, 2000, 2);
  assert.equal(Math.max(wide.width, wide.height), 7680);
  assert.equal(wide.width / wide.height, 2);
  assert.deepEqual(settledRaster(0, 10, 1), { width: 1, height: 20 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/fractal-view.test.js`

Expected: FAIL, `settledRaster` is not exported.

- [ ] **Step 3: Write minimal implementation**

```js
export const SETTLED_DPR_MAX = 3;
export const SETTLED_SUPERSAMPLE = 2;
export const SETTLED_EDGE_MAX = 7680;

/** Pixel size of a settled GPU frame: device pixels up to 3x, then doubled, then fit to 7680. */
export function settledRaster(width, height, dpr = 1) {
  const ratio = Math.min(Math.max(Number(dpr) || 1, 1), SETTLED_DPR_MAX);
  let pixelW = Math.max(1, Math.floor(Math.max(0, width) * ratio * SETTLED_SUPERSAMPLE));
  let pixelH = Math.max(1, Math.floor(Math.max(0, height) * ratio * SETTLED_SUPERSAMPLE));
  const edge = Math.max(pixelW, pixelH);
  if (edge > SETTLED_EDGE_MAX) {
    const fit = SETTLED_EDGE_MAX / edge;
    pixelW = Math.max(1, Math.floor(pixelW * fit));
    pixelH = Math.max(1, Math.floor(pixelH * fit));
  }
  return { width: pixelW, height: pixelH };
}
```

A zero CSS side becomes one pixel: `settledRaster(0, 10, 1)` is `{ width: 1, height: 20 }`.

In `viewBox`, set `rawDpr` to `window.devicePixelRatio || 1` with no cap. Keep the existing `dpr` cap of 2.

In `paintGpuFrame`, replace `const dest = motionRaster(box)` with:

```js
const dest = settle ? settledRaster(box.width, box.height, box.rawDpr || box.dpr) : motionRaster(box);
```

The rest of the function, including `motionScale` and band sharpening, stays. Sharpening therefore fills the settled size.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/fractal-view.test.js test/fractal-page.test.js`

Expected: PASS. The page test matches `paintGpuEscape` and `gpuDepthMode` as substrings; do not remove those names.

- [ ] **Step 5: Commit**

```bash
git add src/fractal-view.js src/fractal-app.js test/fractal-view.test.js
git commit -m "Draw settled escape frames above the display resolution."
```

---

### Task 6: Pan strips

**Files:**
- Modify: `src/fractal-view.js`
- Modify: `src/escape-gpu.js` (uniform `uOrigin`, `cols` argument)
- Modify: `src/fractal-app.js` (`paintGpuFrame`)
- Test: `test/fractal-view.test.js`

**Interfaces:**
- Consumes: `panEscape` (a positive `dx` moves the center by `-(dx / width) * spanX`), `paintGpuEscape`'s `rows`
- Produces:
  - `export function panPixels(oldView, newView, width, height): { x, y } | null` when the scale or flip differs.
  - `export function panRepaint(frameWidth, frameHeight, shiftX, shiftY): { copy, rects } | null`.
  - `paintGpuEscape` accepts `cols: { from, to }` in the same pixel space as `rows`. The returned canvas is the intersection rectangle. Uniform `uOrigin.x` is the column start in the full frame; `uResolution` stays the full frame size.

`panPixels` reports how many screen pixels the old picture moves. Positive `x` moves content right. It is the inverse of `panEscape`'s center shift:

```js
export function panPixels(oldView, newView, width, height) {
  if (!oldView || !newView || !(oldView.scale > 0) || oldView.scale !== newView.scale) return null;
  if (Boolean(oldView.flipY) !== Boolean(newView.flipY)) return null;
  const spanY = newView.scale;
  const spanX = spanY * (width / Math.max(1, height));
  const worldX = (newView.centerX + (newView.centerXLo || 0)) - (oldView.centerX + (oldView.centerXLo || 0));
  const worldY = (newView.centerY + (newView.centerYLo || 0)) - (oldView.centerY + (oldView.centerYLo || 0));
  const ySign = newView.flipY ? -1 : 1;
  return {
    x: Math.round((-worldX / spanX) * width),
    y: Math.round((ySign * worldY / spanY) * height),
  };
}
```

`panRepaint` returns null when both rounded shifts are 0, or when either absolute shift is greater than half the corresponding side. Otherwise:

```js
export function panRepaint(frameWidth, frameHeight, shiftX, shiftY) {
  const sx = Math.round(shiftX);
  const sy = Math.round(shiftY);
  const width = frameWidth | 0;
  const height = frameHeight | 0;
  if (width < 1 || height < 1) return null;
  if (sx === 0 && sy === 0) return null;
  if (Math.abs(sx) > width / 2 || Math.abs(sy) > height / 2) return null;
  const rects = [];
  if (sx > 0) rects.push({ x: 0, y: 0, w: sx, h: height });
  else if (sx < 0) rects.push({ x: width + sx, y: 0, w: -sx, h: height });
  const overlapW = width - Math.abs(sx);
  const overlapX = sx > 0 ? sx : 0;
  if (sy > 0) rects.push({ x: overlapX, y: 0, w: overlapW, h: sy });
  else if (sy < 0) rects.push({ x: overlapX, y: height + sy, w: overlapW, h: -sy });
  const copy = {
    sx: sx > 0 ? 0 : -sx,
    sy: sy > 0 ? 0 : -sy,
    sw: overlapW,
    sh: height - Math.abs(sy),
    dx: sx > 0 ? sx : 0,
    dy: sy > 0 ? sy : 0,
  };
  return { copy, rects };
}
```

- [ ] **Step 1: Write the failing test**

Add to `test/fractal-view.test.js`:

```js
test("a pan names the new strips and the overlap to keep", () => {
  const before = { centerX: 0, centerY: 0, scale: 2, flipY: false };
  const after = panEscape(before, 30, -12, 300, 200);
  const shift = panPixels(before, after, 300, 200);
  assert.deepEqual(shift, { x: 30, y: -12 });
  assert.equal(panPixels(before, { ...after, scale: 1 }, 300, 200), null);
  const paint = panRepaint(300, 200, shift.x, shift.y);
  assert.deepEqual(paint.copy, { sx: 0, sy: 12, sw: 270, sh: 188, dx: 30, dy: 0 });
  assert.deepEqual(paint.rects, [
    { x: 0, y: 0, w: 30, h: 200 },
    { x: 30, y: 188, w: 270, h: 12 },
  ]);
  assert.equal(panRepaint(300, 200, 0, 0), null);
  assert.equal(panRepaint(300, 200, 200, 0), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/fractal-view.test.js`

Expected: FAIL, `panPixels` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add `panPixels` and `panRepaint` exactly as specified above.

In the fragment shader, add `uniform vec2 uOrigin;`. The pixel coordinate becomes:

```glsl
float px = uOrigin.x + gl_FragCoord.x;
float py = uBand.x + uBand.y - gl_FragCoord.y;
float nx = px / uResolution.x - 0.5;
```

`uResolution` remains the full frame. Add `"uOrigin"` to `UNIFORMS`.

`paintGpuEscape` already accepts `rows`. Accept `cols` the same way: `from` inclusive, `to` exclusive, clamped to `[0, width]`. The offscreen canvas size becomes `(x1 - x0)` by `(y1 - y0)`. Set `uOrigin` to `(x0, 0)` and `uBand` to `(y0, y1 - y0)`. A call with neither `rows` nor `cols` keeps today's full-frame canvas and sets `uOrigin` to `(0, 0)`.

In `paintGpuFrame`, remember the last full-share GPU view on `state.gpuPan` as `{ view, width, height }` after a successful full-share draw (`share === 1` and no `rows` partial). On a later call that is not `settle`, when `share === 1` and the destination size matches `state.gpuPan`, call `panPixels`. When `panRepaint` returns a plan:

- Copy the current page canvas to a scratch canvas of the same size (create it once and resize when needed).
- `drawImage` the overlap from the scratch canvas using `copy`.
- For each rect, call `paintGpuEscape` with `rows: { from: rect.y, to: rect.y + rect.h }` and `cols: { from: rect.x, to: rect.x + rect.w }`, then `drawImage` that sheet at `(rect.x, rect.y)`.
- Skip the full-frame `paintGpuEscape` for that call.
- If any strip returns null, fall through to the existing full-frame draw.

Do this only inside the branch that currently paints a new sheet (the branch guarded by `!(settle && state.gpuKey === key && state.gpuShare < 1)`). A settled sharpen pass still paints full-width bands and does not use the pan path. Clear `state.gpuPan` when the scale changes, the destination size changes, or the GPU frame is not drawn.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/fractal-view.test.js test/escape-gpu.test.js test/fractal-page.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fractal-view.js src/escape-gpu.js src/fractal-app.js test/fractal-view.test.js
git commit -m "Redraw only the strips a pan reveals."
```

---

## Self-review

- Spec coverage: stall removal is Task 2. Loop buckets are Task 1. Interior early-out is Task 3. Quadratic series, the extension past the linear term, is Task 4. Settled resolution is Task 5. Pan strips are Task 6. Chained bilinear blocks and WebGPU are excluded in Global Constraints.
- The page stays on one 2D canvas, so a direct WebGL element is intentionally not a task.
- Placeholder scan: every new function is written out. Shader edits name the uniform and the line they replace.
- Type consistency: `loopLimitForCap`, `pollGpuCost`, `settledRaster`, `panPixels`, and `panRepaint` keep the signatures used by later tasks. `uSeries2` and `uOrigin` are the shader names Tasks 4 and 6 add.
