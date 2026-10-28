# Sort Me

A visualiser with a home page and two tools, published like any other site. Sorting watches a program run against the comparison lower bound ⌈log₂(n!)⌉. Fractals watches an escape-time set, a curve, a gasket, or an iterated function system resolve under a coloring you pick.

Every generated array is a permutation of **1, 2, 3, …, n**. Length stops at **250**, so a finished chart always rises by 1 from one position to the next. Compare runs two to four programs on that same array. Changing the length or a preset rebuilds the array and keeps the comparison running.

No page calls an API, loads a remote font, or sends the picture anywhere. KaTeX stays in this repository. The public addresses are `/` for home, `/sorting` for sorting, and `/fractals` for fractals. A visit to `/home.html`, `/sorting.html`, `/index.html`, or `/fractals.html` redirects to those paths, so the address bar does not end in `.html`. The sorting document is `sorting.html`. A file named `index.html` would be served for `/` before the home rewrite, so that name is not used.

## Run

```bash
npm start
```

The server listens on every interface and prints its address. Home is `/`. Sorting is `/sorting`. Fractals are `/fractals`. The links at the top of a tool page switch between home, sorting, and fractals.

## Home

`/` opens on a full-frame screensaver and a short panel: Sorting and Fractals. The picture is pre-recorded 4K film, played back to back. Nothing on the home page draws a frame. Three sorting films come first: quicksort as bars, mergesort as a slope, and heapsort as a radial chart, in the same ink as the sorting page. Then three fractal zooms, each on screen for half as long: Mandelbrot settles on the crown of the top bulb, the Julia film on a junction of the rabbit, and the burning ship on the fire along its rim. Mandelbrot and Julia use the classic brass coloring. The ship uses heat. An eased crossfade joins every film to the next, sort to sort and fractal to fractal, and the last zoom back to quicksort. The blend starts while the previous film is still on its last frames, so one picture moves into the next without a hold. The panel uses the same ink as the rest of the site, so the title stays readable over every frame. When the system asks for reduced motion, the page holds the opening quicksort frame instead of playing. `scripts/record-zooms.mjs` and `scripts/record-sorts.mjs` are the offline recorders that write `media/`.

`vercel.json` hosts the same files. Clean URLs drop the `.html` suffix, and the response headers match the page policy.

## Sorting

Sorting programs: bubble, selection, insertion, gnome, shell, merge, timsort, quick, introsort, std::sort, std::stable_sort, heap, bitonic, cocktail, comb, counting, radix LSD, radix MSD, and bogo. std::sort and std::stable_sort follow the GCC routines: introsort with a final insertion pass, and a stable merge of chunks of 7. Their big-O formulas are set in LaTeX with a copy of KaTeX kept in this repository. Bogo sort shuffles until the list is ordered, so a long list may never finish.

Visualization programs: bars, dots, heat strip, scatter, radial, slope, and color wheel. The heat strip keeps a value color after a cell is placed, so counting sort and the radix sorts finish as a cyan-to-red gradient instead of a solid bar. The color wheel lays those hues around a circle.

Press Compare beside Sort on the chart, or the Compare button in the side panel. Choose two to four programs in that panel, then press Sort Me to run them. Back returns to the chart. The side panel keeps a Compare button, so a later comparison can be opened from there. After the first run, Compare also stays at the corner of the chart. Resume appears only after Pause. Each lane keeps its own status, counts, and lower-bound meter. Each status card shrinks as more programs are compared: the card, the type, and the meter get smaller together so the chart keeps the room. A fifth box stays disabled until you clear one.

Radial and color wheel comparisons split two programs across the canvas and use quarters for three or four. The other views stay in rows. On a narrow screen the settings sit above the chart. Sort and Resume scroll the chart into view and open a small speed and pause rail beside it.

Pressing Sort on a list that is already in order plays a shuffle, then runs the sort. That replaces a separate reset.

Sound is off until you press Sound. Each compare, swap, or write plays a short sine tone whose pitch follows the value, in the manner of the sorting videos on YouTube. Press Sound again to switch it off. A finished run plays a short rising sweep.

Counting sort, radix LSD, and radix MSD do not compare elements, so the lower-bound meter does not apply to them.

## Fractals

Fractals: Mandelbrot, Julia, burning ship, Newton, Koch snowflake, dragon curve, Sierpinski gasket, Hilbert curve, Barnsley fern, Gosper curve, Lévy C curve, and fractal tree. Their formulas are set in LaTeX with the same local KaTeX copy.

Colorings: classic, heat, ocean, ink, and color wheel. Heat uses the cyan-to-red ramp from the sorting heat strip.

Each fractal has at least three presets. Koch also carries the Cesàro sweep, the Cesàro island, the Minkowski coastline, and the square Koch curve. The dragon carries the terdragon, the gasket the arrowhead, and the Hilbert curve the Peano curve. The fractal tree splits as a binary tree, a ternary tree, a windswept tree, or an H-tree. Iterations, depth, or point count is the depth slider, and it stops at a cap small enough to draw in the page. Choosing a fractal, a preset, or a depth waits until you press Draw. Press Draw and the picture is produced in the order of its definition. An escape-time set appears by iteration: early escapes first, the interior last. Koch and Sierpinski run generation by generation, each one replacing the last. A dragon, Hilbert, Moore, Gosper, Lévy, or tree is drawn along its path. The fern is the chaos game, one random map after another. Even full speed takes more than one frame. Draw on a finished picture plays it again. Resume appears only after Pause. Step advances a short piece of that drawing. Sound is off until you press Sound. The pitch follows the part being drawn, and a finished picture plays a short rising sweep. After the picture is drawn, drag with a mouse or a finger to move it and pinch to zoom. Scrolling eases the view, and the next level fades in as the magnification crosses that fractal's scale factor. A finished Mandelbrot, Julia, burning ship, or Newton picture follows the cursor and shows a reactive badge at the top right. While the view still fits in 32-bit precision, a zoom recalculates each visible pixel on the GPU instead of stretching a saved picture. Deeper views keep the double-double camera. Deep zoom on those four glides along one fixed path, and the zoom factor grows by eight each frame from the first frame, in a straight line, so the dive starts at once and does not speed up. It slides the chosen edge point from where it sits on screen to the middle of the frame over the first six doublings, then dives straight in with no steering, so the view never jerks or recenters. Julia, Newton, and the burning ship are exact to a pair of doubles: a Julia set dives into its repelling fixed point, Newton into the pole where its three basins meet, and the burning ship into a spiral beside its small ship. Those three run past ordinary double precision, down to about 10^28 times, around ninety-four doublings. Mandelbrot dives into the same seahorse spiral, but the center is refined far past a pair of doubles and each pixel is an offset from that orbit, so the picture stays sharp for about a thousand doublings, down to about 10^290 times, which is as far as the page's own scale can go. A moving frame, including that dive, is drawn at 4K so the picture does not pixelate as it zooms, and the seahorse skips runs of iterations so the frame is not a single step per iteration. A double-double view does the same with a bivariate Taylor series, so a deep plate stays sharp without iterating every pixel one step at a time. The iteration count rises with depth. The camera center is kept as a pair of doubles, and past the digits that pair can hold the Mandelbrot orbit continues from the refined center. For a Julia set and the burning ship, one orbit at the middle of each picture is followed at double-double precision and every other pixel is iterated as a small offset from it, the Julia offset in z rather than c and the ship's fold taken exactly on the offset; a pixel whose own orbit passes near the origin moves onto the critical orbit, so no glitches appear. Newton pixels start from a pair of doubles and step that way only while a plain double could not tell neighbors apart, which near the pole is a single step. Deep pictures all escape within a few iterations of one another, so the palette is fitted to the iterations a picture holds, coming in over the first two decades of a dive. A burning ship with c chosen by the cursor has no prepared point and turns back at a few thousand times. At the bottom the picture dissolves over a second and a half into the one you started from while both keep moving, and the dive goes on from there. Finer pictures are drawn by workers and composed off the page's thread, each one blends in over the last, and their size adapts to the machine, so a slow computer gets smaller pictures rather than a pause. The camera never waits for a picture, and the frame is always sampled from pictures that cover it, so a blank border does not open. The readout under the frame keeps its height while deep zoom runs, so the frame itself does not move. A Julia disk is a plain circle, so its deep zoom shows a straight edge; the Rabbit and Siegel presets show the self-similar spirals. On a narrow screen the settings sit above the chart. Sort and Resume scroll the chart into view and open a small speed and pause rail beside it.

## Checks

```bash
npm test
```
