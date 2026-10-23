import assert from "node:assert/strict";
import test from "node:test";
import { PROGRAMS } from "../src/algorithms.js";
import { VIEWS } from "../src/views.js";
import {
  FADE_MS,
  SCENES,
  fractalCamera,
  frameIndex,
  sceneAt,
  screensaverSize,
  showMode,
  sortFrames,
} from "../src/home-show.js";

test("the screensaver alternates fractals and sorting", () => {
  assert.ok(SCENES.length >= 4);
  assert.equal(SCENES[0].kind, "fractal");
  assert.equal(SCENES[0].id, "mandelbrot");
  assert.equal(SCENES.filter((scene) => scene.fractalId === "mandelbrot").length, 1);
  for (let i = 0; i < SCENES.length; i += 1) {
    const next = SCENES[(i + 1) % SCENES.length];
    assert.notEqual(SCENES[i].kind, next.kind);
    assert.equal(SCENES[i].duration > FADE_MS, true);
  }
  assert.ok(SCENES.filter((scene) => scene.kind === "fractal").length >= 2);
  assert.ok(SCENES.filter((scene) => scene.kind === "sort").length >= 2);
});

test("each scene fades in from the one before it", () => {
  const opening = sceneAt(0);
  assert.equal(opening.id, "mandelbrot");
  assert.equal(opening.fade, 0);
  assert.equal(opening.progress, 0);
  const mid = sceneAt(FADE_MS / 2);
  assert.equal(mid.id, "mandelbrot");
  assert.ok(mid.fade > 0.45 && mid.fade < 0.55);
  const shown = sceneAt(FADE_MS + 40);
  assert.equal(shown.fade, 1);
  assert.equal(shown.kind, "fractal");

  const first = SCENES[0];
  const following = sceneAt(first.duration + 20);
  assert.equal(following.kind, "sort");
  assert.ok(following.fade < 0.2);

  const wrapped = sceneAt(-5);
  assert.equal(wrapped.id, SCENES.at(-1).id);
});

test("the mandelbrot flight zooms and pans", () => {
  const start = fractalCamera("mandelbrot", 0);
  const mid = fractalCamera("mandelbrot", 0.45);
  const end = fractalCamera("mandelbrot", 1);
  assert.equal(start.fractalId, "mandelbrot");
  assert.equal(start.paletteId, "classic");
  assert.equal(start.preset.centerX, -0.75);
  assert.equal(start.preset.centerY, 0);
  assert.equal(start.preset.scale, 2.6);
  assert.ok(mid.preset.scale < start.preset.scale * 0.5);
  assert.ok(end.preset.scale < start.preset.scale * 0.2);
  const traveled = Math.hypot(mid.preset.centerX - start.preset.centerX, mid.preset.centerY - start.preset.centerY);
  assert.ok(traveled > 0.04);
  const drifted = Math.hypot(end.preset.centerX - mid.preset.centerX, end.preset.centerY - mid.preset.centerY);
  assert.ok(drifted > 0.01);
  for (const camera of [start, mid, end]) {
    assert.ok(camera.preset.scale > 0);
    assert.ok(Number.isFinite(camera.preset.centerX));
    assert.ok(Number.isFinite(camera.preset.centerY));
    assert.ok(camera.iterations >= 40 && camera.iterations <= 140);
  }
});

test("fractal flights stay on the site palettes and keep their parameters", () => {
  for (const scene of SCENES.filter((item) => item.kind === "fractal")) {
    const camera = fractalCamera(scene.id, 0.3);
    assert.ok(camera.paletteId === "classic" || camera.paletteId === "heat");
    assert.equal(camera.fractalId, scene.fractalId);
  }
  const juliaStart = fractalCamera("julia", 0);
  const juliaEnd = fractalCamera("julia", 1);
  assert.equal(juliaStart.preset.cx, juliaEnd.preset.cx);
  assert.equal(juliaStart.preset.cy, juliaEnd.preset.cy);
  assert.ok(juliaEnd.preset.scale < juliaStart.preset.scale);
  assert.equal(fractalCamera("burning", 0.6).preset.flipY, true);
  assert.throws(() => fractalCamera("missing", 0), /unknown screensaver/i);
});

test("sort scenes play real programs through to a held, ordered array", () => {
  for (const scene of SCENES.filter((item) => item.kind === "sort")) {
    assert.equal(PROGRAMS.some((program) => program.id === scene.programId), true, scene.programId);
    assert.notEqual(scene.programId, "bogo");
    assert.equal(VIEWS.some((view) => view.id === scene.viewId), true, scene.viewId);
    assert.equal(scene.length >= 8 && scene.length <= 80, true);
  }
  const frames = sortFrames("bubble", 6, 4);
  const again = sortFrames("bubble", 6, 4);
  assert.deepEqual(frames[0].array, again[0].array);
  assert.deepEqual(frames.at(-1).array, [1, 2, 3, 4, 5, 6]);
  assert.equal(frames[0].maxValue, 6);
  assert.equal(frameIndex(0, frames.length), 0);
  assert.equal(frameIndex(1, frames.length), frames.length - 1);
  assert.equal(frameIndex(0.82, frames.length), frames.length - 1);
  const mid = frameIndex(0.3, frames.length);
  assert.equal(mid > 0 && mid < frames.length - 1, true);
});

test("the fractal plate keeps the screen's aspect under a size cap", () => {
  assert.deepEqual(screensaverSize(1600, 900, 480), { width: 480, height: 270 });
  assert.deepEqual(screensaverSize(300, 200, 480), { width: 300, height: 200 });
  assert.deepEqual(screensaverSize(0, 0, 480), { width: 2, height: 2 });
});

test("reduced motion holds a still picture", () => {
  assert.equal(showMode(true), "still");
  assert.equal(showMode(false), "play");
});
