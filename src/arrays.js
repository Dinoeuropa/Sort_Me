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
