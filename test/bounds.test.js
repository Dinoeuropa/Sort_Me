import assert from "node:assert/strict";
import test from "node:test";
import { comparisonLowerBound } from "../src/bounds.js";

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

test("comparison lower bound rejects non-integers", () => {
  assert.throws(() => comparisonLowerBound(1.5), /non-negative integer/);
  assert.throws(() => comparisonLowerBound(-1), /non-negative integer/);
});
