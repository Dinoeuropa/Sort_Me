import assert from "node:assert/strict";
import test from "node:test";
import { slopeArray } from "../src/arrays.js";
import { continueComparison, laneScale, startComparison, stepLanes } from "../src/compare.js";

test("status bars shrink as more programs are compared", () => {
  const one = laneScale(1);
  const two = laneScale(2);
  const four = laneScale(4);
  assert.equal(one.scale, 1);
  assert.equal(one.type, 1);
  assert.ok(two.scale < one.scale);
  assert.ok(four.scale < two.scale);
  assert.ok(four.type < two.type);
  assert.ok(four.type > four.scale);
  assert.ok(four.scale >= 0.5);
  assert.ok(four.type >= 0.75);
  assert.equal(laneScale(8).scale, four.scale);
  assert.equal(laneScale(4).lanes, 4);
});

test("compare needs two different sorting programs", () => {
  assert.throws(() => startComparison(["merge"], [1, 2, 3]), /at least two/i);
  assert.throws(() => startComparison(["merge", "merge"], [1, 2, 3]), /at least two/i);
});

test("compare accepts at most four programs", () => {
  const four = startComparison(["bubble", "selection", "insertion", "merge"], [2, 1]);
  assert.equal(four.length, 4);
  assert.throws(
    () => startComparison(["bubble", "selection", "insertion", "merge", "quick"], [2, 1]),
    /at most four/i,
  );
});

test("changing the values restarts the same comparison", () => {
  const lanes = startComparison(["merge", "quick"], [3, 1, 2]);
  stepLanes(lanes, 2);
  const next = continueComparison(lanes, [1, 3, 2]);
  assert.deepEqual(
    next.map((lane) => lane.id),
    ["merge", "quick"],
  );
  assert.equal(
    next.every((lane) => lane.finished === false && lane.frame === null),
    true,
  );
  let guard = 0;
  let done = false;
  while (!done) {
    done = stepLanes(next, 20);
    guard += 1;
    if (guard > 10000) throw new Error("restarted comparison did not finish");
  }
  for (const lane of next) {
    assert.deepEqual(lane.frame.array.slice(), [1, 2, 3], lane.id);
  }
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
