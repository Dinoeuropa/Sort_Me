export const MIN_VALUE = 1;
export const MAX_VALUE = 250;
export const MIN_LENGTH = 1;
export const MAX_LENGTH = 250;

function assertLength(length) {
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new Error(`Length must be an integer from ${MIN_LENGTH} to ${MAX_LENGTH}.`);
  }
}

function indexFrom(rng, length) {
  const raw = Math.floor(rng() * length);
  return Math.min(length - 1, Math.max(0, raw));
}

/** Sorted form of every generated array: 1, 2, 3, …, length. */
export function slopeArray(length) {
  assertLength(length);
  return Array.from({ length }, (_, index) => index + 1);
}

export function randomArray(length, rng = Math.random) {
  const values = slopeArray(length);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
  return values;
}

export function isSorted(values) {
  if (!Array.isArray(values) || values.length === 0) return false;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== i + 1) return false;
  }
  return true;
}

/** Fisher–Yates swaps, one frame per exchange, for the prelude before a fresh sort. */
export function* shuffleSteps(values, rng = Math.random) {
  const array = values.slice();
  let swaps = 0;
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    if (j === i) continue;
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
    swaps += 1;
    yield {
      array: array.slice(),
      indices: [j, i],
      mark: "swap",
      comparisons: 0,
      writes: swaps * 2,
      swaps,
      sorted: new Set(),
      pivot: -1,
      maxValue: array.length,
    };
  }
}

export function reversedArray(length) {
  return slopeArray(length).reverse();
}

export function nearlySortedArray(length, rng = Math.random) {
  const values = slopeArray(length);
  if (length < 2) return values;
  const i = indexFrom(rng, length);
  const j = indexFrom(rng, length);
  const tmp = values[i];
  values[i] = values[j];
  values[j] = tmp;
  return values;
}
