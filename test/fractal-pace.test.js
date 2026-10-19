import assert from "node:assert/strict";
import test from "node:test";
import { framesFor, unitsPerFrame } from "../src/fractal-pace.js";

test("a drawing stays on screen for many frames, even at full speed", () => {
  assert.ok(framesFor(1) > framesFor(50));
  assert.ok(framesFor(50) > framesFor(100));
  assert.ok(framesFor(100) >= 36);
  assert.ok(framesFor(1) >= 400);
});

test("nothing finishes in a single frame unless it is already tiny", () => {
  for (const total of [400, 1024, 20000]) {
    assert.ok(unitsPerFrame(100, total) < total, String(total));
    assert.ok(unitsPerFrame(1, total) < unitsPerFrame(100, total));
    let drawn = 0;
    let frames = 0;
    while (drawn < total) {
      drawn += unitsPerFrame(28, total);
      frames += 1;
      assert.ok(frames < total + 2);
    }
    assert.ok(frames >= 36, String(total));
  }
});

test("a step is a visible piece and not the whole picture", () => {
  assert.ok(unitsPerFrame(100, 5000, true) < 5000);
  assert.ok(unitsPerFrame(100, 5000, true) < unitsPerFrame(100, 5000, false));
  assert.equal(unitsPerFrame(40, 0, false), 0);
});
