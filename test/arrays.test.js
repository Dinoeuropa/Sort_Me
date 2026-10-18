import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LENGTH,
  MAX_VALUE,
  isSorted,
  nearlySortedArray,
  randomArray,
  reversedArray,
  shuffleSteps,
  slopeArray,
} from "../src/arrays.js";

function isUnitProgression(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted[0] !== 1 || sorted[sorted.length - 1] !== values.length) return false;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

test("a sort list stops at 250 values in a +1 progression", () => {
  assert.equal(MAX_LENGTH, 250);
  assert.equal(MAX_VALUE, 250);
  assert.equal(slopeArray(250).at(-1), 250);
  assert.throws(() => slopeArray(251), /250/);
});

test("the slope is the sequence 1, 2, 3 and so on", () => {
  assert.deepEqual(slopeArray(1), [1]);
  assert.deepEqual(slopeArray(5), [1, 2, 3, 4, 5]);
  assert.equal(isSorted(slopeArray(5)), true);
  assert.equal(isSorted(reversedArray(5)), false);
});

test("shuffling a sorted list is a permutation shown as swaps", () => {
  const frames = [...shuffleSteps(slopeArray(6), () => 0)];
  assert.ok(frames.length > 0);
  for (const frame of frames) {
    assert.equal(frame.mark, "swap");
    assert.equal(isUnitProgression(frame.array), true);
    assert.equal(frame.comparisons, 0);
  }
  assert.equal(isSorted(frames.at(-1).array), false);
});

test("every generated array sorts into a +1 progression", () => {
  for (const length of [2, 5, 48, 250]) {
    assert.equal(isUnitProgression(slopeArray(length)), true, `slope ${length}`);
    assert.equal(isUnitProgression(reversedArray(length)), true, `reversed ${length}`);
    assert.equal(isUnitProgression(randomArray(length, () => 0.3)), true, `random ${length}`);
    assert.equal(isUnitProgression(nearlySortedArray(length, () => 0.2)), true, `nearly ${length}`);
  }
});

test("reversedArray is the slope running downward", () => {
  assert.deepEqual(reversedArray(5), [5, 4, 3, 2, 1]);
});

test("nearlySortedArray swaps two positions on the slope", () => {
  const draws = [0, 0.9];
  assert.deepEqual(nearlySortedArray(10, () => draws.shift()), [10, 2, 3, 4, 5, 6, 7, 8, 9, 1]);
});

test("randomArray shuffles the slope without repeating or skipping", () => {
  const values = randomArray(8, () => 0);
  assert.deepEqual(values.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepEqual(values, [1, 2, 3, 4, 5, 6, 7, 8]);
});
