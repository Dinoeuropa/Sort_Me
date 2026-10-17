import assert from "node:assert/strict";
import test from "node:test";
import { boundMeter, comparisonLowerBound } from "../src/bounds.js";

test("comparison lower bound is zero for arrays that need no ordering", () => {
  assert.equal(comparisonLowerBound(0), 0);
  assert.equal(comparisonLowerBound(1), 0);
});

test("comparison lower bound matches ceil(log2(n!))", () => {
  assert.equal(comparisonLowerBound(2), 1);
  assert.equal(comparisonLowerBound(3), 3);
  assert.equal(comparisonLowerBound(4), 5);
  assert.equal(comparisonLowerBound(10), 22);
});

test("comparison lower bound is exact for the maximum array length", () => {
  const bound = comparisonLowerBound(1000);
  assert.equal(Number.isInteger(bound), true);
  assert.ok(bound > 8000);
  assert.ok(bound < 9000);
});

test("a finished sort past the bound fills the meter and states the multiple", () => {
  const meter = boundMeter(31266, 1637, { finished: true });
  assert.equal(meter.over, true);
  assert.equal(meter.width, 100);
  assert.equal(meter.note, "19.1× the worst-case lower bound.");
});

test("a finished sort within the bound keeps the meter under the cap", () => {
  const meter = boundMeter(10, 22, { finished: true });
  assert.equal(meter.over, false);
  assert.ok(meter.width < 100);
  assert.match(meter.note, /at or under/);
});

test("a program that does not compare values leaves the meter empty", () => {
  const meter = boundMeter(0, 22, { comparison: false, finished: true });
  assert.equal(meter.width, 0);
  assert.equal(meter.over, false);
  assert.match(meter.note, /does not compare/);
});

test("comparison lower bound rejects non-integers", () => {
  assert.throws(() => comparisonLowerBound(1.5), /non-negative integer/);
  assert.throws(() => comparisonLowerBound(-1), /non-negative integer/);
});
