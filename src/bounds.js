const boundCache = new Map();

/** Worst-case comparison lower bound: ceil(log2(n!)). */
export function comparisonLowerBound(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("n must be a non-negative integer");
  }
  if (n < 2) return 0;
  const cached = boundCache.get(n);
  if (cached !== undefined) return cached;

  let fact = 1n;
  for (let k = 2n; k <= BigInt(n); k += 1n) fact *= k;

  const bitLength = fact.toString(2).length;
  const powerOfTwo = (fact & (fact - 1n)) === 0n;
  const bound = powerOfTwo ? bitLength - 1 : bitLength;
  boundCache.set(n, bound);
  return bound;
}

export function boundMeter(comparisons, bound, { comparison = true, finished = false } = {}) {
  if (!comparison) {
    return {
      width: 0,
      over: false,
      note: "This program does not compare values, so the lower bound does not apply. The bound is still shown for reference.",
    };
  }
  if (bound === 0) {
    return {
      width: 0,
      over: false,
      note: "One value is already in order.",
    };
  }
  const ratio = comparisons / bound;
  const over = ratio > 1;
  let note = "The meter fills as comparisons approach the worst-case lower bound.";
  if (finished && over) note = `${ratio.toFixed(1)}× the worst-case lower bound.`;
  else if (finished) note = "Finished at or under the worst-case lower bound. Typical inputs often do.";
  return {
    width: Math.min(100, ratio * 100),
    over,
    note,
  };
}
