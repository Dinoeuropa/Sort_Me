import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sorting = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const fractals = fs.readFileSync(new URL("../fractals.html", import.meta.url), "utf8");
const fractalApp = fs.readFileSync(new URL("../src/fractal-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("sorting and fractals are two local pages that link to each other", () => {
  for (const page of [sorting, fractals]) {
    assert.match(page, /Content-Security-Policy/);
    assert.match(page, /script-src 'self'/);
    assert.doesNotMatch(page, /https?:\/\//);
    assert.match(page, /class="site-nav"/);
    assert.match(page, /href="\.\/index\.html"/);
    assert.match(page, /href="\.\/fractals\.html"/);
    assert.match(page, /aria-label="Sort Me pages"/);
  }
  assert.match(sorting, /href="\.\/index\.html" aria-current="page"/);
  assert.match(fractals, /href="\.\/fractals\.html" aria-current="page"/);
  assert.match(sorting, /src="\.\/src\/app\.js"/);
  assert.match(fractals, /src="\.\/src\/fractal-app\.js"/);
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
