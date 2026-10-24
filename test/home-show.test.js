import assert from "node:assert/strict";
import test from "node:test";
import { escapeBand } from "../src/fractals.js";
import { PROGRAMS } from "../src/algorithms.js";
import { VIEWS } from "../src/views.js";
import {
  FADE_MS,
  FILM_MS,
  FRAME_COUNT,
  FRAME_HEIGHT,
  FRAME_RATE,
  FRAME_WIDTH,
  SCENES,
  SORTS,
  fadeAmount,
  filmBudget,
  filmLayer,
  filmSrc,
  sceneAt,
  showMode,
  sortFrames,
  zoomCamera,
} from "../src/home-show.js";

test("the screensaver crossfades fractal zooms and three sorting films", () => {
  assert.deepEqual(
    SCENES.map((scene) => scene.id),
    ["mandelbrot", "julia", "burning", "quick", "merge", "heap"],
  );
  assert.deepEqual(
    SCENES.map((scene) => scene.kind),
    ["zoom", "zoom", "zoom", "sort", "sort", "sort"],
  );
  assert.equal(FRAME_WIDTH, 3840);
  assert.equal(FRAME_HEIGHT, 2160);
  assert.equal(FRAME_RATE, 24);
  assert.equal(FRAME_COUNT, 192);
  assert.equal(FILM_MS, 8000);
  for (const scene of SCENES) {
    assert.equal(scene.duration, FILM_MS);
    assert.equal(scene.duration > FADE_MS, true);
    const suffix = scene.kind === "zoom" ? "zoom" : "sort";
    assert.equal(scene.src, `/media/${scene.id}-${suffix}.mp4`);
    assert.equal(scene.poster, `/media/${scene.id}-${suffix}.jpg`);
  }
  assert.deepEqual(SORTS.map((sort) => [sort.programId, sort.viewId]), [
    ["quick", "bars"],
    ["merge", "slope"],
    ["heap", "radial"],
  ]);
  for (const sort of SORTS) {
    assert.equal(PROGRAMS.some((program) => program.id === sort.programId), true);
    assert.equal(VIEWS.some((view) => view.id === sort.viewId), true);
  }
});

test("a crossfade eases in instead of cutting", () => {
  assert.equal(fadeAmount(0), 0);
  assert.equal(fadeAmount(1), 1);
  assert.ok(fadeAmount(0.5) > 0.45 && fadeAmount(0.5) < 0.55);
  const early = fadeAmount(0.25);
  assert.ok(early > 0.05 && early < 0.2);
  assert.ok(early < 0.25);

  const opening = sceneAt(0);
  assert.equal(opening.id, "mandelbrot");
  assert.equal(opening.kind, "zoom");
  assert.equal(opening.fade, 0);
  assert.equal(opening.progress, 0);

  const mid = sceneAt(FADE_MS / 2);
  assert.equal(mid.id, "mandelbrot");
  assert.ok(mid.fade > 0.45 && mid.fade < 0.55);

  const shown = sceneAt(FADE_MS + 40);
  assert.equal(shown.fade, 1);
  assert.equal(shown.kind, "zoom");

  const slot = FILM_MS - FADE_MS;
  const beforeHandoff = sceneAt(slot - 20);
  assert.equal(beforeHandoff.id, "mandelbrot");
  assert.equal(beforeHandoff.fade, 1);
  assert.ok(beforeHandoff.progress < 1);

  const following = sceneAt(slot + 20);
  assert.equal(following.id, "julia");
  assert.equal(following.kind, "zoom");
  assert.ok(following.fade < 0.2);
  assert.ok(following.outgoingLeft > FADE_MS - 40);

  const overlap = sceneAt(slot + FADE_MS / 2);
  assert.equal(overlap.id, "julia");
  assert.ok(overlap.fade > 0.45 && overlap.fade < 0.55);
  assert.ok(Math.abs(overlap.outgoingLeft - FADE_MS / 2) < 1);

  const sorts = sceneAt(slot * 3 + FADE_MS / 2);
  assert.equal(sorts.id, "quick");
  assert.equal(sorts.kind, "sort");
  assert.ok(sorts.fade > 0.45 && sorts.fade < 0.55);
  assert.ok(Math.abs(sorts.outgoingLeft - FADE_MS / 2) < 1);

  const cycle = slot * SCENES.length;
  const stillLast = sceneAt(cycle - 5);
  assert.equal(stillLast.id, "heap");
  assert.equal(stillLast.fade, 1);
  assert.ok(stillLast.progress < 1);

  const wrap = sceneAt(cycle + FADE_MS / 2);
  assert.equal(wrap.id, "mandelbrot");
  assert.equal(wrap.kind, "zoom");
  assert.ok(wrap.fade > 0.45 && wrap.fade < 0.55);
  assert.ok(Math.abs(wrap.outgoingLeft - FADE_MS / 2) < 1);

  assert.equal(sceneAt(-5).id, "heap");

  assert.ok(filmLayer("mandelbrot", wrap) > filmLayer("heap", wrap));
  assert.equal(filmLayer("julia", wrap), 0);
  assert.equal(filmLayer("quick", wrap), 0);
});

test("each film zooms on a fixed center", () => {
  for (const scene of SCENES.filter((item) => item.kind === "zoom")) {
    const start = zoomCamera(scene.id, 0);
    const mid = zoomCamera(scene.id, 0.5);
    const end = zoomCamera(scene.id, 1);
    assert.equal(start.fractalId, scene.fractalId);
    assert.equal(start.preset.centerX, mid.preset.centerX);
    assert.equal(mid.preset.centerX, end.preset.centerX);
    assert.equal(start.preset.centerY, mid.preset.centerY);
    assert.equal(mid.preset.centerY, end.preset.centerY);
    assert.ok(mid.preset.scale < start.preset.scale);
    assert.ok(end.preset.scale < mid.preset.scale);
    assert.ok(end.preset.scale < start.preset.scale * 0.25);
    const geometric = Math.sqrt(start.preset.scale * end.preset.scale);
    assert.ok(Math.abs(mid.preset.scale - geometric) / geometric < 0.01);
    assert.ok(end.iterations >= start.iterations);
    assert.ok(start.paletteId === "classic" || start.paletteId === "heat");
    assert.equal(start.paletteId, end.paletteId);
  }

  const juliaStart = zoomCamera("julia", 0);
  const juliaEnd = zoomCamera("julia", 1);
  assert.equal(juliaStart.preset.cx, -0.123);
  assert.equal(juliaStart.preset.cy, 0.745);
  assert.equal(juliaStart.preset.cx, juliaEnd.preset.cx);
  assert.equal(juliaStart.preset.cy, juliaEnd.preset.cy);
  assert.equal(zoomCamera("burning", 0.6).preset.flipY, true);
  assert.equal(zoomCamera("mandelbrot", 0).paletteId, "classic");
  assert.equal(zoomCamera("burning", 1).paletteId, "heat");
  assert.throws(() => zoomCamera("missing", 0), /unknown screensaver zoom/i);
});

test("a recorded sort plays through to an ordered list", async () => {
  for (const sort of SORTS) {
    const frames = await sortFrames(sort.id);
    const again = await sortFrames(sort.id);
    assert.equal(frames.length, FRAME_COUNT);
    assert.deepEqual(frames[0].array, again[0].array);
    assert.deepEqual(frames.at(-1).array, frames[0].array.slice().sort((a, b) => a - b));
    assert.notDeepEqual(frames[0].array, frames.at(-1).array);
    assert.equal(frames.at(-1).array.every((value, index) => value === index + 1), true);
    assert.equal(frames[0].viewId, sort.viewId);
  }
  await assert.rejects(() => sortFrames("bogo"), /unknown screensaver sort/i);
});

test("a zoom stays on fractal structure through the last frame", () => {
  const width = 96;
  const height = 54;
  for (const scene of SCENES.filter((item) => item.kind === "zoom")) {
    for (const progress of [0, 0.5, 1]) {
      const camera = zoomCamera(scene.id, progress);
      const band = escapeBand(
        camera.fractalId,
        camera.preset,
        width,
        height,
        camera.iterations,
        0,
        height,
      );
      let inside = 0;
      for (const iteration of band.iterations) {
        if (iteration >= camera.iterations) inside += 1;
      }
      const share = inside / band.iterations.length;
      assert.ok(share < 0.7, `${scene.id} at ${progress} is ${(share * 100).toFixed(0)}% interior`);
    }
  }
});

test("a narrow screen or a slow link plays the light film", () => {
  assert.equal(filmBudget({ width: 1440, downlink: 20 }), "screen");
  assert.equal(filmBudget({ width: 1440 }), "screen");
  assert.equal(filmBudget({ width: 390, downlink: 30 }), "lite");
  assert.equal(filmBudget({ width: 1440, saveData: true, downlink: 30 }), "lite");
  assert.equal(filmBudget({ width: 1440, effectiveType: "3g" }), "lite");
  assert.equal(filmBudget({ width: 1440, effectiveType: "4g", downlink: 1.5 }), "lite");
  for (const scene of SCENES.filter((item) => item.kind === "zoom")) {
    assert.equal(filmSrc(scene, "screen"), scene.screen);
    assert.equal(filmSrc(scene, "lite"), scene.lite);
    assert.notEqual(filmSrc(scene, "screen"), scene.src);
    assert.match(scene.screen, /-screen\.mp4$/);
    assert.match(scene.lite, /-lite\.mp4$/);
  }
  for (const scene of SCENES.filter((item) => item.kind === "sort")) {
    assert.equal(filmSrc(scene, "lite"), scene.src);
    assert.equal(filmSrc(scene, "screen"), scene.src);
  }
});

test("reduced motion holds a still picture", () => {
  assert.equal(showMode(true), "still");
  assert.equal(showMode(false), "play");
});
