# Sort Me

A visualiser with two pages, published like any other site. Sorting watches a program run against the comparison lower bound ⌈log₂(n!)⌉. Fractals watches an escape-time set, a curve, a gasket, or an iterated function system resolve under a coloring you pick.

Every generated array is a permutation of **1, 2, 3, …, n**. Length stops at **250**, so a finished chart always rises by 1 from one position to the next. Compare runs two to four programs on that same array. Changing the length or a preset rebuilds the array and keeps the comparison running.

Neither page calls an API, loads a remote font, or sends the picture anywhere. KaTeX stays in this repository. The public addresses are `/` for sorting and `/fractals` for fractals. A visit to `/index.html` or `/fractals.html` redirects to those paths, so the address bar does not end in `.html`.

## Run

```bash
npm start
```

The server listens on every interface and prints its address. Sorting is `/`. Fractals are `/fractals`. The brass links at the top of either page switch between them.

`vercel.json` hosts the same files. Clean URLs drop the `.html` suffix, and the response headers match the page policy.

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

Each fractal has three presets. Iterations, depth, or point count is the depth slider, and it stops at a cap small enough to draw in the page. Choosing a fractal, a preset, or a depth waits until you press Draw. Press Draw and the picture is produced in the order of its definition. An escape-time set appears by iteration: early escapes first, the interior last. Koch and Sierpinski run generation by generation, each one replacing the last. A dragon, Hilbert, or Moore curve is drawn along its path. The fern is the chaos game, one random map after another. Even full speed takes more than one frame. Draw on a finished picture plays it again. Resume appears only after Pause. Step advances a short piece of that drawing. Sound is off until you press Sound. The pitch follows the part being drawn, and a finished picture plays a short rising sweep. After the picture is drawn, drag with a mouse or a finger to move it and pinch to zoom. Scrolling eases the view, and the next level fades in as the magnification crosses that fractal's scale factor. A finished Mandelbrot, Julia, burning ship, or Newton picture follows the cursor, shows a reactive badge at the top right, and stays on a 4K sample so the picture remains sharp while the pointer moves. Auto zoom on those four about doubles each second and follows a pattern you choose. Mandelbrot can head for a seahorse spiral, a mini Mandelbrot, or elephant valley. Julia can head for the nearest, right, upper, or left spiral. The burning ship can head for the hull, the wreck, or the mast, and Newton can head for a basin edge, the triple point, or the pinch. Auto zoom keeps moving at that pace and recenters on the spiral. Well past a hundred million times magnification the iteration count keeps rising, and the frame is sampled from the current picture so the window stays on the pattern. Zooming out draws a wider picture at once, so the window fills while the view is still opening. The view stays inside the current picture, and a blank border does not open. On a narrow screen the settings sit above the chart, and Draw scrolls the chart into view beside a speed and pause rail.

## Checks

```bash
npm test
```
