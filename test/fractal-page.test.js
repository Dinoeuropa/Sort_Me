import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sorting = fs.readFileSync(new URL("../sorting.html", import.meta.url), "utf8");
const fractals = fs.readFileSync(new URL("../fractals.html", import.meta.url), "utf8");
const fractalApp = fs.readFileSync(new URL("../src/fractal-app.js", import.meta.url), "utf8");
const blankShow = fs.readFileSync(new URL("../src/blank-show.js", import.meta.url), "utf8");
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

test("zoom in, zoom out, and auto zoom sit together as signs", () => {
  const explore = fractals.slice(fractals.indexOf('id="explore"'), fractals.indexOf('class="legend"'));
  assert.match(
    explore,
    /id="zoom-in"[^>]*>\+<\/button>\s*<button[^>]*id="zoom-out"[^>]*>-<\/button>\s*<button[^>]*id="auto-zoom"/,
  );
  assert.match(explore, /aria-label="Zoom in"/);
  assert.match(explore, /aria-label="Zoom out"/);
  assert.doesNotMatch(explore, />Zoom in</);
  assert.doesNotMatch(explore, />Zoom out</);
  assert.match(css, /#explore\s*\{[^}]*flex-wrap:\s*nowrap/);
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
  assert.match(fractals, /id="variation"/);
  assert.match(fractals, /id="presets" class="preset-pop" role="menu"/);
  const controls = fractals.slice(fractals.indexOf('id="palette-blurb"'), fractals.indexOf('id="toggle"'));
  assert.ok(controls.indexOf('id="variation"') < controls.indexOf('id="depth-label"'));
  assert.match(fractals, />\s*Variation\s*</);
  assert.match(fractalApp, /state\.presetId = currentFractal\(\)\.presets\[0\]\.id/);
  assert.match(fractalApp, /button\.dataset\.preset = preset\.id/);
  assert.match(fractalApp, /setAttribute\("aria-checked", String\(preset\.id === state\.presetId\)\)/);
  assert.match(css, /\.preset-menu > button::after/);
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

test("a zoom draws one curve level, never one level on top of another", () => {
  const choice = fractalApp.slice(fractalApp.indexOf("function settledCurve"), fractalApp.indexOf("function paintSettled"));
  const paint = fractalApp.slice(fractalApp.indexOf("function paintSettled"), fractalApp.indexOf("function geometryAt"));
  assert.match(choice, /incomingLevelFade/);
  assert.doesNotMatch(choice, /globalAlpha/);
  assert.match(choice, /shown > 0\.5 && next > base \? \{ level: next, geometry: geometryAt\(next\) \} : \{ level: base, geometry \}/);
  assert.match(paint, /settledCurve\(box\)/);
  assert.equal(paint.match(/drawStored\(/g).length, 1);
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
  assert.match(fractals, /Drag or scroll to explore/);
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
  assert.match(fractalApp, /incomingLevelFade/);
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

test("the reactive badge is a switch that turns cursor reaction off", () => {
  assert.match(
    fractals,
    /<button type="button" id="mode-badge" class="mode-badge" hidden aria-pressed="true">reactive<\/button>/,
  );
  const badgeRule = css.slice(css.indexOf(".mode-badge {"), css.indexOf(".param {"));
  assert.doesNotMatch(badgeRule, /pointer-events:\s*none/);
  assert.match(fractalApp, /reactive: true/);
  const gate = fractalApp.slice(fractalApp.indexOf("function isReactive"), fractalApp.indexOf("function formatMag"));
  assert.match(gate, /state\.reactive/);
  const click = fractalApp.slice(
    fractalApp.indexOf('modeBadge.addEventListener("click"'),
    fractalApp.indexOf("fractalSelect.addEventListener"),
  );
  assert.match(click, /cursorParam = null/);
  assert.match(click, /reactiveView = null/);
  assert.match(click, /scheduleEscape/);
});

test("the legend swatches follow the classic ramp and the open palette", () => {
  assert.match(css, /\.swatch\.early\s*\{[^}]*background:\s*var\(--brass\)/);
  assert.match(css, /\.swatch\.late\s*\{[^}]*background:\s*var\(--coral\)/);
  assert.match(fractalApp, /colorSample\(state\.paletteId/);
  assert.match(fractalApp, /\.swatch\.early/);
  assert.match(fractalApp, /\.swatch\.late/);
});

test("auto zoom is hidden for fractals that cannot glide and stays available when reaction is off", () => {
  assert.match(fractals, /id="auto-zoom"/);
  assert.match(fractalApp, /function canAutoZoom/);
  assert.match(fractalApp, /autoZoomButton\.hidden = !canAutoZoom\(\)/);
  const start = fractalApp.slice(fractalApp.indexOf("function startAutoZoom"), fractalApp.indexOf("const AUTO_FADE_MS"));
  assert.match(start, /canAutoZoom\(\)/);
  assert.doesNotMatch(start, /isReactive\(\)/);
  const chrome = fractalApp.slice(fractalApp.indexOf("function renderChrome"), fractalApp.indexOf("function paceLabel"));
  assert.match(chrome, /modeBadge\.hidden = !\(canAutoZoom\(\) && state\.finished && !state\.running\)/);
  assert.match(chrome, /modeBadge\.setAttribute\("aria-pressed"/);
});

test("a deep GPU dive refits its palette each quarter octave and eases into it", () => {
  const fit = fractalApp.match(/function gpuPaletteWindow\([^]*?\n\}/);
  assert.ok(fit, "gpuPaletteWindow is in the page");
  const key = fit[0].match(/\[([^\]]*Math\.log2\(preset\.scale\)[^\]]*)\]/);
  assert.ok(key, "the refit key holds the quarter octave");
  assert.doesNotMatch(key[1], /\bcap\b/, "the cap rises every frame of a dive, so it must not force a refit");
  assert.match(fit[0], /easeWindow\(/);
});

test("a blank fractal canvas shows an enlarged Draw in the frame", () => {
  const frame = fractals.slice(fractals.indexOf('class="canvas-frame"'), fractals.indexOf('id="viz-dock"'));
  assert.match(frame, /<button type="button" id="stage-draw" class="primary stage-draw">Draw<\/button>/);
  assert.match(fractals, /id="toggle" class="primary">Draw<\/button>/);
  const rule = css.slice(css.indexOf(".stage-draw {"), css.indexOf(".stage-draw {") + 400);
  assert.match(rule, /left:\s*50%/);
  assert.match(rule, /top:\s*50%/);
  assert.match(rule, /transform:\s*translate\(-50%, -50%\)/);
  assert.match(rule, /font-size:\s*1\.85rem/);
  assert.match(rule, /z-index:\s*2/);
  assert.match(fractalApp, /const stageDraw = document\.querySelector\("#stage-draw"\)/);
  assert.match(fractalApp, /function canvasIsBlank\(\) \{\s*return !state\.running && !state\.paused && !state\.finished;\s*\}/);
  assert.match(fractalApp, /stageDraw\.hidden = !canvasIsBlank\(\)/);
  assert.match(fractalApp, /blankShow\.setVisible\(canvasIsBlank\(\)\)/);
  assert.match(fractalApp, /stageDraw\.addEventListener\("click", toggle\)/);
  assert.match(frame, /id="blank-show" class="blank-show" aria-hidden="true"/);
  assert.match(frame, /data-film="mandelbrot"/);
  assert.match(frame, /data-film="julia"/);
  assert.match(frame, /data-film="burning"/);
  assert.doesNotMatch(frame, /data-film="quick"|data-film="merge"|data-film="heap"/);
  assert.doesNotMatch(frame, /src="\/media\//);
  const filmRule = css.slice(css.indexOf(".blank-film {"), css.indexOf(".blank-film {") + 280);
  assert.match(filmRule, /filter:\s*blur\(14px\)/);
  assert.match(blankShow, /ZOOM_SCENES/);
  assert.match(blankShow, /sceneAt\(elapsed, ZOOM_SCENES\)/);
  assert.match(blankShow, /prefers-reduced-motion/);
  assert.match(blankShow, /showMode\(/);
  assert.doesNotMatch(blankShow, /kind === "sort"|data-film="quick"/);
});

test("sound is an icon at the top left of the fractal frame", () => {
  const controls = fractals.slice(fractals.indexOf('class="controls"'), fractals.indexOf('id="error"'));
  assert.doesNotMatch(controls, /id="sound"/);
  const frame = fractals.slice(fractals.indexOf('class="canvas-frame"'), fractals.indexOf('id="viz-dock"'));
  assert.match(frame, /id="sound" class="sound-toggle" aria-pressed="false" aria-label="Sound"/);
  assert.match(frame, /class="sound-icon sound-on"/);
  assert.match(frame, /class="sound-icon sound-off"/);
  assert.match(frame, /d="M20 7 8 17"/);
  const rule = css.slice(css.indexOf(".sound-toggle {"), css.indexOf(".sound-toggle {") + 700);
  assert.match(rule, /top:\s*0\.7rem/);
  assert.match(rule, /left:\s*0\.8rem/);
  assert.match(rule, /\.sound-toggle\[aria-pressed="false"\] \.sound-off/);
  assert.doesNotMatch(fractalApp, /soundButton\.textContent/);
});

test("auto zoom turns cursor reaction off without forgetting the preference", () => {
  const gate = fractalApp.slice(fractalApp.indexOf("function isReactive"), fractalApp.indexOf("function formatMag"));
  assert.match(gate, /canAutoZoom\(id\) && state\.reactive && !state\.autoZoom/);
  const chrome = fractalApp.slice(fractalApp.indexOf("function renderChrome"), fractalApp.indexOf("function paceLabel"));
  assert.match(chrome, /modeBadge\.setAttribute\("aria-pressed", String\(reactive\)\)/);
  assert.match(chrome, /modeBadge\.textContent = reactive \? "reactive on" : "reactive off"/);
  assert.match(chrome, /modeBadge\.disabled = state\.autoZoom/);
  const start = fractalApp.slice(fractalApp.indexOf("function startAutoZoom"), fractalApp.indexOf("const AUTO_FADE_MS"));
  assert.doesNotMatch(start, /state\.reactive = false/);
});

test("reset during auto zoom refreshes the reactive badge", () => {
  const reset = fractalApp.slice(fractalApp.indexOf("function resetExplore"), fractalApp.indexOf("function redrawExplored"));
  assert.match(reset, /haltAutoZoom\(\);/);
  assert.match(reset, /renderChrome\(\);/);
});
