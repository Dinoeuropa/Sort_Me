# Visualizer UI polish

## Goal

Make the fractal canvas invite a draw when it is empty, turn the tool-page Home links into a home icon, move Sound onto the visualizer as a muted/unmuted icon, and keep cursor reactivity off for the whole auto zoom.

## Current behavior

`fractals.html` keeps Draw, Step, and Sound in the left panel. Draw, Pause, and Resume share `#toggle`. Choosing a fractal, a preset, or a depth calls `arm()`, which clears the canvas to `#100e0c` and waits. The picture appears only after Draw or Step. Sorting uses the same Home link and the same Sound button beside its own run control.

Cursor reaction applies to a finished Mandelbrot, Julia, burning ship, or Newton picture when `state.reactive` is true. Auto zoom already ignores new pointer samples in `onReactivePointer`, but `isReactive()` stays true, so the canvas keeps the crosshair and the badge still reads "reactive on". Pointer events still enter the reactive branch.

## Decisions

1. Keep the panel Draw button. Add a second, larger Draw centered on the fractal canvas. It is a copy: same action as `#toggle`, shown only while the canvas is the blank idle paper.
2. Replace the text Home link on the sorting page and the fractals page with a house icon. The address stays `/`. Sorting and Fractals stay text links.
3. Remove Sound from both left panels. Place one sound button at the top left of each page's visualizer. Off shows a speaker with a diagonal slash. On shows a speaker with sound marks. The control still starts off and still calls `speaker.setEnabled`.
4. While `state.autoZoom` is true, reaction is off even if the user had left it on. The stored preference is not flipped. When the dive stops, the previous preference returns. The badge shows the effective state and cannot be toggled during the dive.

## Blank canvas

The centered Draw is visible only when the fractal page is idle before a picture exists:

- not running
- not paused
- not finished

That covers the first paint after entering `/fractals`, a newly selected fractal, a preset change, a depth change, and any other `arm()` that clears the paper. It hides as soon as Draw or Step starts, including Pause and Resume, and it stays hidden once a picture is finished. Auto zoom never shows it, because a dive requires a finished picture.

## Layout

The centered Draw uses the existing primary brass pill, at `1.85rem`, anchored to the middle of `.canvas-frame`. The sound control sits on the same frame, top left, in the dark chip already used by the reactive badge. The home icon is a compact link at the start of `.site-nav`. Icons are inline SVG using `currentColor`. No remote asset, font, or URL.

## Reactivity

`isReactive()` is false when `state.autoZoom` is true. The canvas therefore loses the reactive crosshair, and pointer handlers leave the reactive branch. `startAutoZoom` already clears the live cursor parameter; that freeze of a parameter chosen before the dive stays, so a dive that began on a hovered Julia constant still uses it. The badge's `aria-pressed` and label follow `isReactive()`, and the badge is `disabled` during the dive.

## Out of scope

Fractal math, palettes, zoom paths, drawing order, the panel Pause/Resume labels, the sorting Sort button, and the reactive switch's meaning after a dive ends.

## Tests

Existing page tests assert source text. Update the Home-link assertion. Add source assertions for the centered Draw, the home icon, the sound icon placement and slash, and `!state.autoZoom` inside `isReactive()`. `npm test` is the check.
