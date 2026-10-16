import assert from "node:assert/strict";
import test from "node:test";
import { slopeArray } from "../src/arrays.js";
import { startComparison, stepLanes } from "../src/compare.js";

test("compare needs two different sorting programs", () => {
  assert.throws(() => startComparison(["merge"], [1, 2, 3]), /at least two/i);
  assert.throws(() => startComparison(["merge", "merge"], [1, 2, 3]), /at least two/i);
});

test("every compared program sorts the same +1 progression", () => {
  const values = [4, 1, 3, 2];
  const lanes = startComparison(["bubble", "merge", "quick", "counting"], values);
  assert.equal(lanes.length, 4);
  let guard = 0;
  let done = false;
  while (!done) {
    done = stepLanes(lanes, 50);
    guard += 1;
    if (guard > 10000) throw new Error("comparison did not finish");
  }
  for (const lane of lanes) {
    assert.deepEqual(lane.frame.array.slice(), [1, 2, 3, 4], lane.id);
    assert.equal(lane.finished, true);
  }
});

test("compared programs keep the slope progression at length 100", () => {
  const values = slopeArray(100).reverse();
  const lanes = startComparison(["heap", "radix"], values);
  let guard = 0;
  while (!stepLanes(lanes, 200)) {
    guard += 1;
    if (guard > 10000) throw new Error("comparison did not finish");
  }
  for (const lane of lanes) {
    assert.deepEqual(lane.frame.array.slice(), slopeArray(100), lane.id);
  }
});
