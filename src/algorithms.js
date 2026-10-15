import { MAX_LENGTH, MAX_VALUE, MIN_VALUE } from "./arrays.js";

function copyValidated(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_LENGTH) {
    throw new Error(`Array length must be between 1 and ${MAX_LENGTH}.`);
  }
  return values.map((value) => {
    if (!Number.isInteger(value) || value < MIN_VALUE || value > MAX_VALUE) {
      throw new Error(`Each value must be an integer between ${MIN_VALUE} and ${MAX_VALUE}.`);
    }
    return value;
  });
}

function freshStats() {
  return { comparisons: 0, writes: 0, swaps: 0 };
}

function frame(array, indices, mark, stats, sorted, pivot = -1) {
  return {
    array,
    indices,
    mark,
    comparisons: stats.comparisons,
    writes: stats.writes,
    swaps: stats.swaps,
    sorted,
    pivot,
    maxValue: MAX_VALUE,
  };
}

function swap(array, i, j, stats) {
  const tmp = array[i];
  array[i] = array[j];
  array[j] = tmp;
  stats.swaps += 1;
  stats.writes += 2;
}

function* markAll(array, stats, sorted) {
  for (let i = 0; i < array.length; i += 1) sorted.add(i);
  yield frame(array, [], "sorted", stats, sorted);
}

function* bubble(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const n = array.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n - 1 - i; j += 1) {
      stats.comparisons += 1;
      yield frame(array, [j, j + 1], "compare", stats, sorted);
      if (array[j] > array[j + 1]) {
        swap(array, j, j + 1, stats);
        yield frame(array, [j, j + 1], "swap", stats, sorted);
      }
    }
    sorted.add(n - 1 - i);
    yield frame(array, [n - 1 - i], "sorted", stats, sorted);
  }
}

function* selection(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const n = array.length;
  for (let i = 0; i < n; i += 1) {
    let min = i;
    for (let j = i + 1; j < n; j += 1) {
      stats.comparisons += 1;
      yield frame(array, [min, j], "compare", stats, sorted);
      if (array[j] < array[min]) min = j;
    }
    if (min !== i) {
      swap(array, i, min, stats);
      yield frame(array, [i, min], "swap", stats, sorted);
    }
    sorted.add(i);
    yield frame(array, [i], "sorted", stats, sorted);
  }
}

function* insertion(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  if (array.length === 1) {
    yield* markAll(array, stats, sorted);
    return;
  }
  sorted.add(0);
  for (let i = 1; i < array.length; i += 1) {
    const key = array[i];
    let j = i - 1;
    while (j >= 0) {
      stats.comparisons += 1;
      yield frame(array, [j, j + 1], "compare", stats, sorted);
      if (array[j] <= key) break;
      array[j + 1] = array[j];
      stats.writes += 1;
      yield frame(array, [j, j + 1], "swap", stats, sorted);
      j -= 1;
    }
    array[j + 1] = key;
    stats.writes += 1;
    for (let k = 0; k <= i; k += 1) sorted.add(k);
    yield frame(array, [j + 1], "write", stats, sorted);
  }
}

function* shell(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const n = array.length;
  let gap = 1;
  while (gap < n / 3) gap = gap * 3 + 1;
  while (gap >= 1) {
    for (let i = gap; i < n; i += 1) {
      const key = array[i];
      let j = i;
      while (j >= gap) {
        stats.comparisons += 1;
        yield frame(array, [j - gap, j], "compare", stats, sorted);
        if (array[j - gap] <= key) break;
        array[j] = array[j - gap];
        stats.writes += 1;
        yield frame(array, [j - gap, j], "swap", stats, sorted);
        j -= gap;
      }
      array[j] = key;
      stats.writes += 1;
      yield frame(array, [j], "write", stats, sorted);
    }
    gap = Math.floor(gap / 3);
  }
  yield* markAll(array, stats, sorted);
}

function* merge(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  yield* mergeRange(array, 0, array.length, stats, sorted);
  yield* markAll(array, stats, sorted);
}

function* mergeRange(array, lo, hi, stats, sorted) {
  if (hi - lo <= 1) return;
  const mid = (lo + hi) >> 1;
  yield* mergeRange(array, lo, mid, stats, sorted);
  yield* mergeRange(array, mid, hi, stats, sorted);
  yield* mergeHalves(array, lo, mid, hi, stats, sorted);
}

function* mergeHalves(array, lo, mid, hi, stats, sorted) {
  const aux = array.slice(lo, hi);
  const leftLen = mid - lo;
  const rightLen = hi - lo;
  let i = 0;
  let j = leftLen;
  for (let k = lo; k < hi; k += 1) {
    if (i >= leftLen) {
      array[k] = aux[j];
      j += 1;
    } else if (j >= rightLen) {
      array[k] = aux[i];
      i += 1;
    } else {
      stats.comparisons += 1;
      yield frame(array, [lo + i, lo + j], "compare", stats, sorted);
      if (aux[i] <= aux[j]) {
        array[k] = aux[i];
        i += 1;
      } else {
        array[k] = aux[j];
        j += 1;
      }
    }
    stats.writes += 1;
    yield frame(array, [k], "write", stats, sorted);
  }
}

function* quick(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  yield* quickRange(array, 0, array.length - 1, stats, sorted);
  yield* markAll(array, stats, sorted);
}

function* quickRange(array, lo, hi, stats, sorted) {
  if (lo > hi) return;
  if (lo === hi) {
    sorted.add(lo);
    yield frame(array, [lo], "sorted", stats, sorted);
    return;
  }
  const pivot = hi;
  let store = lo;
  for (let i = lo; i < hi; i += 1) {
    stats.comparisons += 1;
    yield frame(array, [i, pivot], "compare", stats, sorted, pivot);
    if (array[i] < array[pivot]) {
      if (i !== store) {
        swap(array, i, store, stats);
        yield frame(array, [i, store], "swap", stats, sorted, pivot);
      }
      store += 1;
    }
  }
  if (store !== hi) {
    swap(array, store, hi, stats);
    yield frame(array, [store, hi], "swap", stats, sorted, store);
  }
  sorted.add(store);
  yield frame(array, [store], "sorted", stats, sorted);
  yield* quickRange(array, lo, store - 1, stats, sorted);
  yield* quickRange(array, store + 1, hi, stats, sorted);
}

function* heap(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const n = array.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i -= 1) {
    yield* sift(array, i, n, stats, sorted);
  }
  for (let end = n - 1; end > 0; end -= 1) {
    swap(array, 0, end, stats);
    sorted.add(end);
    yield frame(array, [0, end], "swap", stats, sorted);
    yield* sift(array, 0, end, stats, sorted);
  }
  yield* markAll(array, stats, sorted);
}

function* sift(array, start, heapSize, stats, sorted) {
  let i = start;
  while (true) {
    let largest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < heapSize) {
      stats.comparisons += 1;
      yield frame(array, [left, largest], "compare", stats, sorted);
      if (array[left] > array[largest]) largest = left;
    }
    if (right < heapSize) {
      stats.comparisons += 1;
      yield frame(array, [right, largest], "compare", stats, sorted);
      if (array[right] > array[largest]) largest = right;
    }
    if (largest === i) break;
    swap(array, i, largest, stats);
    yield frame(array, [i, largest], "swap", stats, sorted);
    i = largest;
  }
}

function* cocktail(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  let start = 0;
  let end = array.length - 1;
  let moved = true;
  while (moved && start <= end) {
    moved = false;
    for (let j = start; j < end; j += 1) {
      stats.comparisons += 1;
      yield frame(array, [j, j + 1], "compare", stats, sorted);
      if (array[j] > array[j + 1]) {
        swap(array, j, j + 1, stats);
        moved = true;
        yield frame(array, [j, j + 1], "swap", stats, sorted);
      }
    }
    if (end >= 0) {
      sorted.add(end);
      yield frame(array, [end], "sorted", stats, sorted);
    }
    end -= 1;
    for (let j = end; j > start; j -= 1) {
      stats.comparisons += 1;
      yield frame(array, [j - 1, j], "compare", stats, sorted);
      if (array[j - 1] > array[j]) {
        swap(array, j - 1, j, stats);
        moved = true;
        yield frame(array, [j - 1, j], "swap", stats, sorted);
      }
    }
    if (start <= end) {
      sorted.add(start);
      yield frame(array, [start], "sorted", stats, sorted);
    }
    start += 1;
  }
  yield* markAll(array, stats, sorted);
}

function* counting(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const max = array.reduce((peak, value) => Math.max(peak, value), 0);
  const count = new Array(max + 1).fill(0);
  for (let i = 0; i < array.length; i += 1) {
    count[array[i]] += 1;
    yield frame(array, [i], "read", stats, sorted);
  }
  let index = 0;
  for (let value = 0; value <= max; value += 1) {
    while (count[value] > 0) {
      count[value] -= 1;
      array[index] = value;
      stats.writes += 1;
      sorted.add(index);
      yield frame(array, [index], "write", stats, sorted);
      index += 1;
    }
  }
}

function* radix(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const max = array.reduce((peak, value) => Math.max(peak, value), 0);
  let exp = 1;
  while (Math.floor(max / exp) > 0) {
    yield* radixPass(array, exp, stats, sorted);
    exp *= 10;
    if (Math.floor(max / exp) > 0) sorted.clear();
  }
  yield* markAll(array, stats, sorted);
}

function* radixPass(array, exp, stats, sorted) {
  const n = array.length;
  const count = new Array(10).fill(0);
  const digits = new Array(n);
  for (let i = 0; i < n; i += 1) {
    digits[i] = Math.floor(array[i] / exp) % 10;
    count[digits[i]] += 1;
    yield frame(array, [i], "read", stats, sorted);
  }
  for (let digit = 1; digit < 10; digit += 1) count[digit] += count[digit - 1];
  const out = new Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    const pos = count[digits[i]] - 1;
    count[digits[i]] = pos;
    out[pos] = array[i];
  }
  for (let i = 0; i < n; i += 1) {
    array[i] = out[i];
    stats.writes += 1;
    sorted.add(i);
    yield frame(array, [i], "write", stats, sorted);
  }
}

const BUILDERS = {
  bubble,
  selection,
  insertion,
  shell,
  merge,
  quick,
  heap,
  cocktail,
  counting,
  radix,
};

export const PROGRAMS = [
  {
    id: "bubble",
    name: "Bubble sort",
    comparison: true,
    complexity: "O(n²)",
    blurb: "Swaps neighbours that are out of order until each pass locks the next maximum.",
  },
  {
    id: "selection",
    name: "Selection sort",
    comparison: true,
    complexity: "O(n²)",
    blurb: "Places the next minimum at the front of the unsorted range.",
  },
  {
    id: "insertion",
    name: "Insertion sort",
    comparison: true,
    complexity: "O(n²)",
    blurb: "Slides each value left into the sorted prefix.",
  },
  {
    id: "shell",
    name: "Shell sort",
    comparison: true,
    complexity: "O(n^1.5) typical",
    blurb: "Insertion sort over shrinking gaps, finishing with a full insertion pass.",
  },
  {
    id: "merge",
    name: "Merge sort",
    comparison: true,
    complexity: "O(n log n)",
    blurb: "Sorts each half, then writes the two runs back together.",
  },
  {
    id: "quick",
    name: "Quick sort",
    comparison: true,
    complexity: "O(n log n) average",
    blurb: "Partitions around a pivot, then sorts both sides.",
  },
  {
    id: "heap",
    name: "Heap sort",
    comparison: true,
    complexity: "O(n log n)",
    blurb: "Builds a max-heap, then moves the largest value to the end.",
  },
  {
    id: "cocktail",
    name: "Cocktail sort",
    comparison: true,
    complexity: "O(n²)",
    blurb: "Bubble sort that alternates left-to-right and right-to-left.",
  },
  {
    id: "counting",
    name: "Counting sort",
    comparison: false,
    complexity: "O(n + k)",
    blurb: "Tallies every value up to 1000, then writes them back in order.",
  },
  {
    id: "radix",
    name: "Radix sort",
    comparison: false,
    complexity: "O(d · n)",
    blurb: "Sorts by decimal digit, from the ones place through the thousands.",
  },
];

export function createRun(id, values) {
  const build = BUILDERS[id];
  if (!build) throw new Error(`Unknown program: ${id}`);
  return build(copyValidated(values));
}

export function execute(id, values) {
  const run = createRun(id, values);
  const limit = values.length * values.length * 12 + values.length * 80 + 100;
  let last;
  let steps = 0;
  while (true) {
    const next = run.next();
    if (next.done) break;
    last = next.value;
    steps += 1;
    if (steps > limit) throw new Error(`Runaway program: ${id}`);
  }
  if (!last) throw new Error(`Program produced no frames: ${id}`);
  return {
    array: last.array.slice(),
    comparisons: last.comparisons,
    writes: last.writes,
    swaps: last.swaps,
  };
}
