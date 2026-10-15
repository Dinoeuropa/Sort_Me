import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LENGTH,
  MAX_VALUE,
  parseArrayText,
  randomArray,
  reversedArray,
  nearlySortedArray,
} from "../src/arrays.js";

test("constants allow values and lengths up to 1000", () => {
  assert.equal(MAX_VALUE, 1000);
  assert.equal(MAX_LENGTH, 1000);
});

test("parseArrayText accepts integers from 1 through 1000", () => {
  assert.deepEqual(parseArrayText("1, 1000 42"), [1, 1000, 42]);
});

test("parseArrayText rejects values above 1000, below 1, and non-integers", () => {
  assert.throws(() => parseArrayText("1001"), /1 and 1000/);
  assert.throws(() => parseArrayText("0"), /1 and 1000/);
  assert.throws(() => parseArrayText("-4"), /1 and 1000/);
  assert.throws(() => parseArrayText("1.5"), /integer/);
  assert.throws(() => parseArrayText("nope"), /integer/);
  assert.throws(() => parseArrayText(""), /at least one/);
});

test("parseArrayText rejects more than 1000 numbers", () => {
  const text = Array.from({ length: 1001 }, () => "1").join(" ");
  assert.throws(() => parseArrayText(text), /1000/);
});

test("randomArray stays inside the requested value cap", () => {
  const values = randomArray(1000, 1000, () => 0.999999);
  assert.equal(values.length, 1000);
  assert.ok(values.every((value) => Number.isInteger(value) && value >= 1 && value <= 1000));
  assert.ok(values.includes(1000));
});

test("reversedArray spreads from the cap down to 1", () => {
  assert.deepEqual(reversedArray(5, 1000), [1000, 751, 501, 251, 1]);
  assert.deepEqual(reversedArray(1000, 1000)[0], 1000);
  assert.deepEqual(reversedArray(1000, 1000)[999], 1);
});

test("nearlySortedArray swaps a few positions in an ascending array", () => {
  const draws = [0.0, 0.9];
  const values = nearlySortedArray(10, 1000, () => draws.shift());
  assert.deepEqual(values, [1000, 112, 223, 334, 445, 556, 667, 778, 889, 1]);
});
