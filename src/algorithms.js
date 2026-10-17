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

function* ordered(array, stats, sorted) {
  for (let i = 1; i < array.length; i += 1) {
    stats.comparisons += 1;
    yield frame(array, [i - 1, i], "compare", stats, sorted);
    if (array[i - 1] > array[i]) return false;
  }
  return true;
}

function* bogo(source, rng = Math.random) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const random = typeof rng === "function" ? rng : Math.random;
  while (!(yield* ordered(array, stats, sorted))) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
      if (j === i) continue;
      swap(array, i, j, stats);
      yield frame(array, [i, j], "swap", stats, sorted);
    }
  }
  yield* markAll(array, stats, sorted);
}

function* gnome(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  let index = 0;
  while (index < array.length) {
    if (index === 0) {
      index += 1;
      continue;
    }
    stats.comparisons += 1;
    yield frame(array, [index - 1, index], "compare", stats, sorted);
    if (array[index] >= array[index - 1]) index += 1;
    else {
      swap(array, index, index - 1, stats);
      yield frame(array, [index, index - 1], "swap", stats, sorted);
      index -= 1;
    }
  }
  yield* markAll(array, stats, sorted);
}

function* comb(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const n = array.length;
  let gap = n;
  let swapped = true;
  while (gap > 1 || swapped) {
    gap = Math.floor(gap / 1.3);
    if (gap < 1) gap = 1;
    swapped = false;
    for (let i = 0; i + gap < n; i += 1) {
      stats.comparisons += 1;
      yield frame(array, [i, i + gap], "compare", stats, sorted);
      if (array[i] > array[i + gap]) {
        swap(array, i, i + gap, stats);
        swapped = true;
        yield frame(array, [i, i + gap], "swap", stats, sorted);
      }
    }
  }
  yield* markAll(array, stats, sorted);
}

function minRunLength(n) {
  let extra = 0;
  let size = n;
  while (size >= 32) {
    extra |= size & 1;
    size >>= 1;
  }
  return size + extra;
}

function* insertSpan(array, lo, hi, stats, sorted) {
  for (let i = lo + 1; i < hi; i += 1) {
    const key = array[i];
    let j = i - 1;
    while (j >= lo) {
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
    yield frame(array, [j + 1], "write", stats, sorted);
  }
}

function* naturalRunEnd(array, start, stats, sorted) {
  const n = array.length;
  if (start >= n - 1) return Math.min(n, start + 1);
  let end = start + 1;
  stats.comparisons += 1;
  yield frame(array, [start, end], "compare", stats, sorted);
  if (array[end] < array[start]) {
    while (end < n - 1) {
      stats.comparisons += 1;
      yield frame(array, [end, end + 1], "compare", stats, sorted);
      if (array[end + 1] < array[end]) end += 1;
      else break;
    }
    let left = start;
    let right = end;
    while (left < right) {
      swap(array, left, right, stats);
      yield frame(array, [left, right], "swap", stats, sorted);
      left += 1;
      right -= 1;
    }
    return end + 1;
  }
  while (end < n - 1) {
    stats.comparisons += 1;
    yield frame(array, [end, end + 1], "compare", stats, sorted);
    if (array[end] <= array[end + 1]) end += 1;
    else break;
  }
  return end + 1;
}

function* mergeStackAt(array, stack, index, stats, sorted) {
  const left = stack[index];
  const right = stack[index + 1];
  const lo = left.start;
  const mid = right.start;
  const hi = right.start + right.length;
  yield* mergeHalves(array, lo, mid, hi, stats, sorted);
  stack.splice(index, 2, { start: lo, length: hi - lo });
}

function* collapse(array, stack, stats, sorted, force) {
  while (stack.length > 1) {
    const count = stack.length;
    const top = stack[count - 1].length;
    const middle = stack[count - 2].length;
    const below = count > 2 ? stack[count - 3].length : Infinity;
    let at = -1;
    if (below <= top + middle) at = below < top ? count - 3 : count - 2;
    else if (middle <= top) at = count - 2;
    else if (force) at = count - 2;
    else break;
    yield* mergeStackAt(array, stack, at, stats, sorted);
  }
}

function* tim(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const n = array.length;
  if (n < 2) {
    yield* markAll(array, stats, sorted);
    return;
  }
  const minimum = minRunLength(n);
  const stack = [];
  let start = 0;
  while (start < n) {
    let end = yield* naturalRunEnd(array, start, stats, sorted);
    if (end <= start) end = Math.min(n, start + 1);
    const limit = Math.min(n, start + minimum);
    if (end < limit) {
      yield* insertSpan(array, start, limit, stats, sorted);
      end = limit;
    }
    stack.push({ start, length: end - start });
    start = end;
    yield* collapse(array, stack, stats, sorted, false);
  }
  yield* collapse(array, stack, stats, sorted, true);
  yield* markAll(array, stats, sorted);
}

function* partition(array, lo, hi, stats, sorted) {
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
  return store;
}

function* siftSpan(array, base, start, heapSize, stats, sorted) {
  let i = start;
  while (true) {
    let largest = i;
    const left = 2 * i + 1;
    const right = left + 1;
    if (left < heapSize) {
      stats.comparisons += 1;
      yield frame(array, [base + left, base + largest], "compare", stats, sorted);
      if (array[base + left] > array[base + largest]) largest = left;
    }
    if (right < heapSize) {
      stats.comparisons += 1;
      yield frame(array, [base + right, base + largest], "compare", stats, sorted);
      if (array[base + right] > array[base + largest]) largest = right;
    }
    if (largest === i) return;
    swap(array, base + i, base + largest, stats);
    yield frame(array, [base + i, base + largest], "swap", stats, sorted);
    i = largest;
  }
}

function* heapSpan(array, lo, hi, stats, sorted) {
  const n = hi - lo + 1;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i -= 1) {
    yield* siftSpan(array, lo, i, n, stats, sorted);
  }
  for (let end = n - 1; end > 0; end -= 1) {
    swap(array, lo, lo + end, stats);
    sorted.add(lo + end);
    yield frame(array, [lo, lo + end], "swap", stats, sorted);
    yield* siftSpan(array, lo, 0, end, stats, sorted);
  }
  if (n > 0) {
    sorted.add(lo);
    yield frame(array, [lo], "sorted", stats, sorted);
  }
}

function* introRange(array, lo, hi, depth, stats, sorted) {
  while (lo <= hi) {
    if (hi - lo + 1 <= 16) {
      yield* insertSpan(array, lo, hi + 1, stats, sorted);
      for (let i = lo; i <= hi; i += 1) sorted.add(i);
      yield frame(array, [lo], "sorted", stats, sorted);
      return;
    }
    if (depth <= 0) {
      yield* heapSpan(array, lo, hi, stats, sorted);
      return;
    }
    const pivot = yield* partition(array, lo, hi, stats, sorted);
    depth -= 1;
    yield* introRange(array, pivot + 1, hi, depth, stats, sorted);
    hi = pivot - 1;
  }
}

function* intro(source) {
  const array = source;
  const stats = freshStats();
  const sorted = new Set();
  const depth = 2 * Math.floor(Math.log2(Math.max(1, array.length)));
  yield* introRange(array, 0, array.length - 1, depth, stats, sorted);
  yield* markAll(array, stats, sorted);
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
  comb,
  gnome,
  tim,
  intro,
  counting,
  radix,
  bogo,
};

export const PROGRAMS = [
  {
    id: "bubble",
    name: "Bubble sort",
    comparison: true,
    complexity: "O(n^2)",
    latex: "O(n^{2})",
    caseLabel: "",
    blurb: "Swaps neighbours that are out of order until each pass locks the next maximum.",
  },
  {
    id: "selection",
    name: "Selection sort",
    comparison: true,
    complexity: "O(n^2)",
    latex: "O(n^{2})",
    caseLabel: "",
    blurb: "Places the next minimum at the front of the unsorted range.",
  },
  {
    id: "insertion",
    name: "Insertion sort",
    comparison: true,
    complexity: "O(n^2)",
    latex: "O(n^{2})",
    caseLabel: "",
    blurb: "Slides each value left into the sorted prefix.",
  },
  {
    id: "shell",
    name: "Shell sort",
    comparison: true,
    complexity: "O(n^{3/2}) typical",
    latex: "O(n^{3/2})",
    caseLabel: "typical",
    blurb: "Insertion sort over shrinking gaps, finishing with a full insertion pass.",
  },
  {
    id: "merge",
    name: "Merge sort",
    comparison: true,
    complexity: "O(n log n)",
    latex: "O(n\\log n)",
    caseLabel: "",
    blurb: "Sorts each half, then writes the two runs back together.",
  },
  {
    id: "quick",
    name: "Quick sort",
    comparison: true,
    complexity: "O(n log n) average",
    latex: "O(n\\log n)",
    caseLabel: "average",
    blurb: "Partitions around a pivot, then sorts both sides.",
  },
  {
    id: "heap",
    name: "Heap sort",
    comparison: true,
    complexity: "O(n log n)",
    latex: "O(n\\log n)",
    caseLabel: "",
    blurb: "Builds a max-heap, then moves the largest value to the end.",
  },
  {
    id: "cocktail",
    name: "Cocktail sort",
    comparison: true,
    complexity: "O(n^2)",
    latex: "O(n^{2})",
    caseLabel: "",
    blurb: "Bubble sort that alternates left-to-right and right-to-left.",
  },
  {
    id: "counting",
    name: "Counting sort",
    comparison: false,
    complexity: "O(n + k)",
    latex: "O(n+k)",
    caseLabel: "",
    blurb: "Tallies each value, then writes the 1…n progression back in order.",
  },
  {
    id: "radix",
    name: "Radix sort",
    comparison: false,
    complexity: "O(d n)",
    latex: "O(dn)",
    caseLabel: "",
    blurb: "Sorts by decimal digit, from the ones place through the thousands.",
  },
  {
    id: "comb",
    name: "Comb sort",
    comparison: true,
    complexity: "O(n^2)",
    latex: "O(n^{2})",
    caseLabel: "",
    blurb: "Bubble sort whose gap shrinks by 1.3 until it is comparing neighbours.",
  },
  {
    id: "gnome",
    name: "Gnome sort",
    comparison: true,
    complexity: "O(n^2)",
    latex: "O(n^{2})",
    caseLabel: "",
    blurb: "Steps forward through order and backtracks one place after every swap.",
  },
  {
    id: "tim",
    name: "Timsort",
    comparison: true,
    complexity: "O(n log n)",
    latex: "O(n\\log n)",
    caseLabel: "",
    blurb: "Finds natural runs, extends the short ones, then merges them.",
  },
  {
    id: "intro",
    name: "Introsort",
    comparison: true,
    complexity: "O(n log n)",
    latex: "O(n\\log n)",
    caseLabel: "",
    blurb: "Quicksort that switches to heapsort when the recursion gets deep, and insertion sort on small ranges.",
  },
  {
    id: "bogo",
    name: "Bogo sort",
    comparison: true,
    bounded: false,
    complexity: "O(n·n!)",
    latex: "O(n \\cdot n!)",
    caseLabel: "expected",
    blurb: "Shuffles the whole list until it happens to be sorted. Long lists may never finish.",
  },
];

export function createRun(id, values, rng = Math.random) {
  const build = BUILDERS[id];
  if (!build) throw new Error(`Unknown program: ${id}`);
  return build(copyValidated(values), rng);
}

export function execute(id, values, rng) {
  const run = createRun(id, values, rng);
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
