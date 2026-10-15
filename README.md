# Sort Me

A local sorting visualiser. Pick a sorting program and a visualization program, then watch the run against the comparison lower bound ⌈log₂(n!)⌉.

Every generated array is a permutation of **1, 2, 3, …, n**. Length stops at **250**, so a finished chart always rises by 1 from one position to the next. Compare runs two or more programs on that same array.

The page does not call a server, load a font, or send the array anywhere. The included server only binds to `127.0.0.1`.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:4173`.

## What you can select

Sorting programs: bubble, selection, insertion, shell, merge, quick, heap, cocktail, counting, and radix. Their big-O formulas are set in LaTeX with a copy of KaTeX kept in this repository.

Visualization programs: bars, dots, heat strip, scatter, radial, and slope.

Check two or more programs and press Compare to run them in lanes.

Counting sort and radix sort do not compare elements, so the lower-bound meter does not apply to them.

## Checks

```bash
npm test
```
