export const MIN_VALUE = 1;
export const MAX_VALUE = 1000;
export const MIN_LENGTH = 1;
export const MAX_LENGTH = 1000;

function assertSize(length, maxValue) {
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new Error(`Length must be an integer from ${MIN_LENGTH} to ${MAX_LENGTH}.`);
  }
  if (!Number.isInteger(maxValue) || maxValue < MIN_VALUE || maxValue > MAX_VALUE) {
    throw new Error(`Max value must be an integer from ${MIN_VALUE} to ${MAX_VALUE}.`);
  }
}

function indexFrom(rng, length) {
  const raw = Math.floor(rng() * length);
  return Math.min(length - 1, Math.max(0, raw));
}

export function parseArrayText(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new Error("Enter at least one integer.");

  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  if (parts.length > MAX_LENGTH) {
    throw new Error(`Use at most ${MAX_LENGTH} numbers.`);
  }

  return parts.map((part) => {
    if (!/^-?\d+$/.test(part)) throw new Error(`Not an integer: ${part}`);
    const value = Number(part);
    if (value < MIN_VALUE || value > MAX_VALUE) {
      throw new Error(`Each value must be an integer between ${MIN_VALUE} and ${MAX_VALUE}.`);
    }
    return value;
  });
}

export function randomArray(length, maxValue, rng = Math.random) {
  assertSize(length, maxValue);
  const values = [];
  for (let i = 0; i < length; i += 1) {
    const value = 1 + Math.floor(rng() * maxValue);
    values.push(Math.min(maxValue, Math.max(MIN_VALUE, value)));
  }
  return values;
}

function spread(length, maxValue, descending) {
  assertSize(length, maxValue);
  const values = [];
  for (let i = 0; i < length; i += 1) {
    const rising = length === 1 ? maxValue : 1 + Math.floor((i * (maxValue - 1)) / (length - 1));
    values.push(descending ? maxValue + 1 - rising : rising);
  }
  return values;
}

export function reversedArray(length, maxValue) {
  return spread(length, maxValue, true);
}

export function nearlySortedArray(length, maxValue, rng = Math.random) {
  const values = spread(length, maxValue, false);
  if (length < 2) return values;
  const i = indexFrom(rng, length);
  const j = indexFrom(rng, length);
  const tmp = values[i];
  values[i] = values[j];
  values[j] = tmp;
  return values;
}
