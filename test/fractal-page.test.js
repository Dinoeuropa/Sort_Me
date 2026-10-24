import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sorting = fs.readFileSync(new URL("../sorting.html", import.meta.url), "utf8");
const fractals = fs.readFileSync(new URL("../fractals.html", import.meta.url), "utf8");
const fractalApp = fs.readFileSync(new URL("../src/fractal-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("sorting and fractals are two pages that link to each other", () => {
  for (const page of [sorting, fractals]) {
    assert.match(page, /Content-Security-Policy/);
    assert.match(page, /script-src 'self'/);
    assert.doesNotMatch(page, /https?:\/\//);
    assert.match(page, /class="site-nav"/);
    assert.match(page, /href="\/"/);
    assert.match(page, /href="\/fractals"/);
    assert.doesNotMatch(page, /\.html"/);
    assert.match(page, /aria-label="Sort Me pages"/);
  }
  assert.match(sorting, /href="\/sorting" aria-current="page"/);
  assert.match(fractals, /href="\/fractals" aria-current="page"/);
  assert.match(sorting, /src="\/src\/app\.js"/);
  assert.match(fractals, /src="\/src\/fractal-app\.js"/);
  assert.match(css, /\.site-nav/);
});

test("the fractal page mirrors the sorting controls", () => {
  assert.match(fractals, /id="fractal"/);
  assert.match(fractals, /id="palette"/);
  assert.match(fractals, /id="depth" type="range"/);
  assert.match(fractals, /id="speed" type="range" min="1" max="100"/);
  assert.match(fractals, /id="presets"/);
  assert.match(fractals, /id="toggle"/);
  assert.match(fractals, /id="step"/);
  assert.match(fractals, /id="sound"/);
  assert.match(fractals, /id="zoom-in"/);
  assert.match(fractals, /id="zoom-out"/);
  assert.match(fractals, /id="zoom-reset"/);
  assert.match(fractals, /id="auto-zoom"/);
  assert.match(fractals, /id="param"/);
  assert.match(fractals, /id="canvas"/);
  assert.match(fractals, /aria-label="Fractal visualization"/);
  assert.match(fractals, /id="viz-dock"/);
  assert.match(fractals, /id="dock-speed"/);
  assert.match(fractals, /id="dock-toggle"/);
  assert.match(fractals, /vendor\/katex\/katex\.min\.css/);
  assert.match(fractals, /id="status"/);
  assert.match(fractals, /id="note"/);
  assert.doesNotMatch(fractals, /id="program"/);
  assert.doesNotMatch(fractals, /id="compare"/);
});

test("selecting a fractal waits for Draw", () => {
  const select = fractalApp.slice(fractalApp.indexOf('fractalSelect.addEventListener("change"'));
  const selectBody = select.slice(0, select.indexOf("paletteSelect"));
  assert.match(selectBody, /arm\(\)/);
  assert.doesNotMatch(selectBody, /restart\(\)/);
  const preset = fractalApp.slice(fractalApp.indexOf('presets.addEventListener("click"'));
  const presetBody = preset.slice(0, preset.indexOf("toggleButton"));
  assert.match(presetBody, /arm\(\)/);
  assert.doesNotMatch(presetBody, /restart\(\)/);
  assert.match(fractalApp, /depthInput\.addEventListener\("change", \(\) => arm\(\)\)/);
  assert.match(
    fractalApp,
    /renderPresets\(\);\s*depthInput\.value = String\(currentFractal\(\)\.defaultDepth\);\s*arm\(\);/,
  );
});

test("dragging a curve repaints once per frame, however many moves arrive", () => {
  const pan = fractalApp.slice(fractalApp.indexOf("function applyPan"), fractalApp.indexOf("function queueZoom"));
  assert.match(pan, /shiftPicture\([^)]*, true\)/);
  const shift = fractalApp.slice(fractalApp.indexOf("function shiftPicture"), fractalApp.indexOf("function startGlide"));
  assert.match(shift, /paintNextFrame\(\)/);
  const next = fractalApp.slice(fractalApp.indexOf("function paintNextFrame"));
  assert.match(next.slice(0, next.indexOf("\n}\n")), /if \(curveFrame\) return;[\s\S]*requestAnimationFrame/);
});

test("a finished fractal can be dragged and zoomed", () => {
  assert.match(fractalApp, /canvas.addEventListener\("pointerdown"/);
  assert.match(fractalApp, /canvas.addEventListener\("pointermove"/);
  assert.match(fractalApp, /canvas.addEventListener\("wheel"/);
  assert.match(fractalApp, /pointerType === "mouse"/);
  assert.match(fractalApp, /recursionLevel/);
  assert.match(fractalApp, /scheduleEscape/);
  assert.match(fractalApp, /paintGpuEscape/);
  assert.match(fractalApp, /gpuDepthMode/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(fractals, /drag or pinch to move and scroll to zoom/);
  assert.match(fractalApp, /cursorParameter/);
  assert.match(fractalApp, /newtonCursor/);
  assert.match(fractalApp, /autoZoom/);
  assert.match(fractalApp, /autoZoomPath/);
  assert.match(fractalApp, /autoZoomTarget/);
  assert.match(fractals, /id="mode-badge"/);
  assert.match(fractals, />reactive</);
  assert.match(css, /\.mode-badge/);
  assert.match(fractalApp, /wheelZoomFactor/);
  assert.match(fractalApp, /easeFactor/);
  assert.match(fractalApp, /levelBlend/);
  assert.match(fractalApp, /SHARP_RASTER_EDGE|rasterSize\([^)]*true\)/);
  assert.match(fractalApp, /"burning"/);
  assert.match(fractalApp, /advanceAutoZoom/);
  assert.match(fractalApp, /autoZoomView/);
  assert.match(fractalApp, /autoZoomRamp/);
  assert.match(fractalApp, /pickPlate/);
  assert.match(fractalApp, /plateBudget/);
  assert.doesNotMatch(fractalApp, /autoPace/);
  assert.match(fractalApp, /renderEscape/);
  assert.doesNotMatch(fractals, /zoom-pattern/);
  assert.match(fractalApp, /if \(state\.autoZoom\) return fractal\.note;/);
  assert.match(css, /\.note \{[^}]*min-height: 2lh;/);
  assert.match(fractalApp, /bitmap: true/);
  assert.doesNotMatch(fractalApp, /zoomPattern|detailTarget|steadyAim/);
});

test("a deep GPU dive refits its palette each quarter octave and eases into it", () => {
  const fit = fractalApp.match(/function gpuPaletteWindow\([^]*?\n\}/);
  assert.ok(fit, "gpuPaletteWindow is in the page");
  const key = fit[0].match(/\[([^\]]*Math\.log2\(preset\.scale\)[^\]]*)\]/);
  assert.ok(key, "the refit key holds the quarter octave");
  assert.doesNotMatch(key[1], /\bcap\b/, "the cap rises every frame of a dive, so it must not force a refit");
  assert.match(fit[0], /easeWindow\(/);
});
