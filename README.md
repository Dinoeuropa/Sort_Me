# Sort Me

A local sorting visualiser. Pick a sorting program and a visualization program, then watch the run against the comparison lower bound ⌈log₂(n!)⌉.

Array length and array values both go up to **1000**. The page does not call a server, load a font, or send the array anywhere. The included server only binds to `127.0.0.1` so you can open the page on this machine.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:4173`.

## What you can select

Sorting programs: bubble, selection, insertion, shell, merge, quick, heap, cocktail, counting, and radix.

Visualization programs: bars, dots, heat strip, scatter, radial, and slope.

Counting sort and radix sort are included because values are capped at 1000, which is small enough for those programs. They do not compare elements, so the lower-bound meter does not apply to them.

## Checks

```bash
npm test
```
