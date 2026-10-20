# Sort Me

A local visualiser with two pages. Sorting watches a program run against the comparison lower bound ⌈log₂(n!)⌉. Fractals watches an escape-time set, a curve, a gasket, or an iterated function system resolve under a coloring you pick.

Every generated array is a permutation of **1, 2, 3, …, n**. Length stops at **250**, so a finished chart always rises by 1 from one position to the next. Compare runs two to four programs on that same array. Changing the length or a preset rebuilds the array and keeps the comparison running.

Neither page calls a server, loads a font, or sends the picture anywhere. The included server only binds to `127.0.0.1`.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:4173` for sorting. Fractals are at `http://127.0.0.1:4173/fractals.html`. The brass links at the top of either page switch between them.

## Sorting

Sorting programs: bubble, selection, insertion, gnome, shell, merge, timsort, quick, introsort, std::sort, std::stable_sort, heap, bitonic, cocktail, comb, counting, radix LSD, radix MSD, and bogo. std::sort and std::stable_sort follow the GCC routines: introsort with a final insertion pass, and a stable merge of chunks of 7. Their big-O formulas are set in LaTeX with a copy of KaTeX kept in this repository. Bogo sort shuffles until the list is ordered, so a long list may never finish.

Visualization programs: bars, dots, heat strip, scatter, radial, slope, and color wheel. The heat strip keeps a value color after a cell is placed, so counting sort and the radix sorts finish as a cyan-to-red gradient instead of a solid bar. The color wheel lays those hues around a circle.

Check two to four programs and press Compare, then press Sort. Compare leaves the button on Sort. Resume appears only after Pause. Each lane keeps its own status, counts, and lower-bound meter. Each status card shrinks as more programs are compared: the card, the type, and the meter get smaller together so the chart keeps the room. A fifth box stays disabled until you clear one.

Radial and color wheel comparisons split two programs across the canvas and use quarters for three or four. The other views stay in rows. On a narrow screen the settings sit above the chart. Sort and Resume scroll the chart into view and open a small speed and pause rail beside it.

Pressing Sort on a list that is already in order plays a shuffle, then runs the sort. That replaces a separate reset.

Sound is off until you press Sound. Each compare, swap, or write plays a short sine tone whose pitch follows the value, in the manner of the sorting videos on YouTube. Press Sound again to switch it off. A finished run plays a short rising sweep.

Counting sort, radix LSD, and radix MSD do not compare elements, so the lower-bound meter does not apply to them.

## Fractals

Fractals: Mandelbrot, Julia, burning ship, Newton, Koch snowflake, dragon curve, Sierpinski gasket, Hilbert curve, and Barnsley fern. Their formulas are set in LaTeX with the same local KaTeX copy.

Colorings: classic, heat, ocean, ink, and color wheel. Heat uses the cyan-to-red ramp from the sorting heat strip.

Each fractal has three presets. Iterations, depth, or point count is the depth slider, and it stops at a cap small enough to draw in the page. Press Draw and the picture is produced in the order of its definition. An escape-time set appears by iteration: early escapes first, the interior last. Koch and Sierpinski run generation by generation, each one replacing the last. A dragon, Hilbert, or Moore curve is drawn along its path. The fern is the chaos game, one random map after another. Even full speed takes more than one frame. Draw on a finished picture plays it again. Resume appears only after Pause. Step advances a short piece of that drawing. Sound is off until you press Sound. The pitch follows the part being drawn, and a finished picture plays a short rising sweep. On a narrow screen the settings sit above the chart, and Draw scrolls the chart into view beside a speed and pause rail.

## Checks

```bash
npm test
```
