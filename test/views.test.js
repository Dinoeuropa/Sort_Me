import assert from "node:assert/strict";
import test from "node:test";
import { VIEWS, draw } from "../src/views.js";

function mockContext() {
  return {
    canvas: { width: 300, height: 180 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    rect() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    save() {},
    restore() {},
    setLineDash() {},
    fillText() {},
  };
}

const frame = {
  array: [1, 1000, 40, 40],
  maxValue: 1000,
  indices: [1],
  mark: "compare",
  comparisons: 2,
  writes: 0,
  swaps: 0,
  sorted: new Set([0]),
  pivot: 3,
};

test("visualization programs are selectable and distinct", () => {
  const ids = VIEWS.map((view) => view.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 4);
  for (const view of VIEWS) {
    assert.equal(typeof view.name, "string");
    assert.equal(view.name.length > 0, true);
  }
});

test("every visualization draws a 1000-scale frame without throwing", () => {
  for (const view of VIEWS) {
    assert.doesNotThrow(() => draw(view.id, mockContext(), frame, 300, 180), view.id);
  }
});

test("unknown visualization ids are rejected", () => {
  assert.throws(() => draw("missing", mockContext(), frame, 10, 10), /unknown visualization/i);
});
