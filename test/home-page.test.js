import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync(new URL("../home.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/home-app.js", import.meta.url), "utf8");
const sorting = fs.readFileSync(new URL("../sorting.html", import.meta.url), "utf8");
const fractals = fs.readFileSync(new URL("../fractals.html", import.meta.url), "utf8");

test("the home page is a quiet chooser over the screensaver", () => {
  assert.match(home, /Content-Security-Policy/);
  assert.match(home, /script-src 'self'/);
  assert.doesNotMatch(home, /https?:\/\//);
  assert.doesNotMatch(home, /\.html"/);
  assert.match(home, /<h1>Sort Me<\/h1>/);
  assert.match(home, /class="home-card"/);
  assert.match(home, /class="home-film"/);
  assert.match(home, /data-film="mandelbrot"/);
  assert.match(home, /poster="\/media\/mandelbrot-zoom\.jpg"/);
  assert.equal(home.match(/poster="/g).length, 1);
  assert.match(home, /data-film="quick"/);
  assert.match(home, /data-film="merge"/);
  assert.match(home, /data-film="heap"/);
  assert.match(home, /preload="none"/);
  assert.doesNotMatch(home, /src="\/media\//);
  assert.match(home, /aria-hidden="true"/);
  assert.doesNotMatch(home, /<canvas/);
  assert.match(home, /href="\/sorting"/);
  assert.match(home, /href="\/fractals"/);
  assert.match(home, /src="\/src\/home-app\.js"/);
  assert.doesNotMatch(home, /id="program"/);
  assert.doesNotMatch(home, /id="fractal"/);
  assert.doesNotMatch(home, /id="compare"/);
});

test("home type sits on the existing panel ink", () => {
  const root = css.slice(css.indexOf(":root"), css.indexOf("}"));
  assert.match(root, /--bg:\s*#12100e/);
  assert.match(root, /--panel:\s*#1c1814/);
  assert.match(root, /--text:\s*#f6efe4/);
  assert.match(root, /--brass:\s*#e2b657/);
  assert.match(root, /--coral:\s*#ef6f4c/);
  assert.match(css, /\.home-card\s*\{[^}]*background:\s*var\(--panel\)/);
  assert.match(css, /\.home-card\s*\{[^}]*color:\s*var\(--text\)/);
  assert.match(css, /\.home-film\s*\{[^}]*object-fit:\s*cover/);
  assert.doesNotMatch(css, /\.home-canvas/);
  assert.match(home, /class="home-card"/);
  assert.match(home, /<h1>Sort Me<\/h1>/);
});

test("the tool pages link back to home and mark themselves", () => {
  assert.match(sorting, /href="\/">Home<\/a>/);
  assert.match(sorting, /href="\/sorting" aria-current="page"/);
  assert.match(fractals, /href="\/">Home<\/a>/);
  assert.match(fractals, /href="\/fractals" aria-current="page"/);
});

test("the home page plays films and does not render them", () => {
  assert.match(app, /prefers-reduced-motion/);
  assert.match(app, /showMode\(/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /sceneAt\(/);
  assert.match(app, /FADE_MS/);
  assert.match(app, /opacity/);
  assert.match(app, /filmLayer/);
  assert.match(app, /filmBudget/);
  assert.match(app, /filmSrc/);
  assert.match(app, /removeAttribute\("src"\)/);
  assert.match(app, /attrPath/);
  assert.match(app, /film\.poster = scene\.poster/);
  assert.match(app, /zIndex/);
  assert.doesNotMatch(app, /escapeBand|paintEscape|getContext|sortFrames|fractalCamera|draw\(/);
  assert.doesNotMatch(app, /from "\.\/(?:fractals|palettes|views|algorithms)\.js"/);
});
