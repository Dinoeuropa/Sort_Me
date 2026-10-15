import assert from "node:assert/strict";
import test from "node:test";
import { PROGRAMS, execute } from "../src/algorithms.js";

const CASES = [
  [3, 1, 2],
  [1],
  [100, 1, 100, 2],
  [1, 1, 1, 1],
  [5, 4, 3, 2, 1],
  [8, 3, 8, 1, 9, 2, 9, 4],
];

function sortedCopy(values) {
  return values.slice().sort((a, b) => a - b);
}

test("a program menu is available to select from", () => {
  const ids = PROGRAMS.map((program) => program.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 6);
  for (const program of PROGRAMS) {
    assert.equal(typeof program.name, "string");
    assert.equal(typeof program.comparison, "boolean");
    assert.equal(typeof program.complexity, "string");
    assert.match(program.latex, /^O\(/);
    assert.equal(typeof program.blurb, "string");
  }
  assert.ok(PROGRAMS.some((program) => program.comparison));
  assert.ok(PROGRAMS.some((program) => !program.comparison));
});

test("every program sorts arrays whose values stay within 1..100", () => {
  for (const program of PROGRAMS) {
    for (const values of CASES) {
      const result = execute(program.id, values);
      assert.deepEqual(result.array, sortedCopy(values), program.id);
      assert.equal(result.array.length, values.length);
      assert.ok(result.comparisons >= 0);
      assert.ok(result.writes >= 0);
      assert.ok(result.swaps >= 0);
    }
  }
});

test("every program sorts a long array capped at 100", () => {
  const values = Array.from({ length: 80 }, (_, index) => ((index * 37) % 100) + 1);
  for (const program of PROGRAMS) {
    const result = execute(program.id, values);
    assert.deepEqual(result.array, sortedCopy(values), program.id);
  }
});

test("comparison programs count at least one comparison on unsorted input", () => {
  for (const program of PROGRAMS.filter((item) => item.comparison)) {
    const result = execute(program.id, [3, 1, 2]);
    assert.ok(result.comparisons > 0, program.id);
  }
});

test("non-comparison programs do not count element ordering comparisons", () => {
  for (const program of PROGRAMS.filter((item) => !item.comparison)) {
    const result = execute(program.id, [4, 1, 3, 2]);
    assert.equal(result.comparisons, 0, program.id);
  }
});

test("unknown program ids are rejected", () => {
  assert.throws(() => execute("bogo", [1, 2]), /unknown program/i);
});
