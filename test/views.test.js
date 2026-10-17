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

test("a color wheel can show values as a circular gradient", () => {
  assert.equal(
    VIEWS.some((view) => view.id === "wheel"),
    true,
  );
});

test("heat strip keeps a value gradient after every cell is placed", () => {
  const paints = [];
  const ctx = mockContext();
  ctx.fillRect = (x, y, w, h) => {
    paints.push({ x, y, w, h, fill: ctx.fillStyle });
  };
  draw(
    "heat",
    ctx,
    {
      array: [1, 2, 3, 4],
      maxValue: 4,
      indices: [],
      mark: "idle",
      comparisons: 0,
      writes: 4,
      swaps: 0,
      sorted: new Set([0, 1, 2, 3]),
      pivot: -1,
    },
    200,
    80,
  );
  const cells = paints.filter((paint) => paint.h > 10 && paint.w < 200);
  assert.equal(cells.length, 4);
  assert.equal(new Set(cells.map((paint) => paint.fill)).size, 4);
  for (const paint of cells) assert.notEqual(paint.fill, "#79c2a8");
});
