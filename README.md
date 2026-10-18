# Sort Me

A local sorting visualiser. Pick a sorting program and a visualization program, then watch the run against the comparison lower bound ⌈log₂(n!)⌉.

Every generated array is a permutation of **1, 2, 3, …, n**. Length stops at **250**, so a finished chart always rises by 1 from one position to the next. Compare runs two to four programs on that same array. Changing the length or a preset rebuilds the array and keeps the comparison running.

The page does not call a server, load a font, or send the array anywhere. The included server only binds to `127.0.0.1`.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:4173`.

## What you can select

Sorting programs: bubble, selection, insertion, gnome, shell, merge, timsort, quick, introsort, heap, cocktail, comb, counting, radix, and bogo. Their big-O formulas are set in LaTeX with a copy of KaTeX kept in this repository. Bogo sort shuffles until the list is ordered, so a long list may never finish.

Visualization programs: bars, dots, heat strip, scatter, radial, slope, and color wheel. The heat strip keeps a value color after a cell is placed, so counting sort and radix sort finish as a cyan-to-red gradient instead of a solid bar. The color wheel lays those hues around a circle.

Check two to four programs and press Compare, then press Sort. Compare leaves the button on Sort. Resume appears only after Pause. Each lane keeps its own status, counts, and lower-bound meter. Those bars shrink as more programs are compared, and the type shrinks with them so the labels stay inside the cards. A fifth box stays disabled until you clear one.

Radial and color wheel comparisons split two programs across the canvas and use quarters for three or four. The other views stay in rows. On a narrow screen the settings sit above the chart. Sort and Resume scroll the chart into view and open a small speed and pause rail beside it.

Pressing Sort on a list that is already in order plays a shuffle, then runs the sort. That replaces a separate reset.

Sound is off until you press Sound. Each compare, swap, or write plays a short sine tone whose pitch follows the value, in the manner of the sorting videos on YouTube. Press Sound again to switch it off. A finished run plays a short rising sweep.

Counting sort and radix sort do not compare elements, so the lower-bound meter does not apply to them.

## Checks

```bash
npm test
```
