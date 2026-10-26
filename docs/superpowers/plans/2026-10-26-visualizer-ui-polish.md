# Visualizer UI polish implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an enlarged Draw on a blank fractal canvas, replace Home text with a house icon, move Sound to a visualizer icon, and turn cursor reaction off while auto zoom runs.

**Architecture:** The fractal page keeps `#toggle` for Draw, Pause, and Resume. A second button, `#stage-draw`, sits in `.canvas-frame` and calls the same `toggle`. `renderChrome` shows it only from `canvasIsBlank()`. Both tool pages replace the Home anchor with an inline house SVG and move `#sound` into `.canvas-frame`. `isReactive()` adds `!state.autoZoom`, and the reactive badge displays that effective value.

**Tech Stack:** Static HTML, CSS, and ES modules. Tests are `node --test` source assertions. No new dependencies.

## Global Constraints

- Pages stay self-contained: no `http` or `https` URLs, no new remote fonts or icon files. Icons are inline SVG with `currentColor`.
- Content-Security-Policy stays `default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self' data:`.
- `#toggle` remains in the fractal panel and still uses `runControlLabel` with idle `"Draw"`. Do not change Pause, Resume, Step, or keyboard Space behavior.
- `#stage-draw` is fractal-only. Its visible label is the word `Draw`. It calls `toggle`.
- `canvasIsBlank()` is `!state.running && !state.paused && !state.finished`.
- Home stays an anchor with `href="/"` and `aria-label="Home"` on both `sorting.html` and `fractals.html`. Sorting and Fractals nav labels stay text.
- `#sound` starts `aria-pressed="false"`. Clicking still toggles `aria-pressed` and calls `speaker.setEnabled`. Do not assign `soundButton.textContent`.
- Off sound shows the `.sound-off` SVG (speaker plus one diagonal). On sound shows the `.sound-on` SVG (speaker plus two arcs).
- `isReactive()` returns false while `state.autoZoom` is true. Do not write `state.reactive = false` from auto zoom. The badge uses the `isReactive()` result for `aria-pressed` and its label, and `modeBadge.disabled = state.autoZoom`.
- Do not change escape math, auto-zoom paths, palettes, or drawing order.
- Work on branch `cursor/visualizer-ui-polish-1939`. Do not push. Do not open a pull request.

---

### Task 1: Centered Draw

**Files:**
- Modify: `fractals.html`
- Modify: `styles.css`
- Modify: `src/fractal-app.js`
- Test: `test/fractal-page.test.js`

**Interfaces:**
- Consumes: existing `toggle()` and `renderChrome()` in `src/fractal-app.js`
- Produces: `#stage-draw` button; `const stageDraw = document.querySelector("#stage-draw")`; `function canvasIsBlank()` returning `!state.running && !state.paused && !state.finished`; `stageDraw.hidden = !canvasIsBlank()` inside `renderChrome`; `stageDraw.addEventListener("click", toggle)`

- [ ] **Step 1: Write the failing test**

Append this test to `test/fractal-page.test.js`:

```javascript
test("a blank fractal canvas shows an enlarged Draw in the frame", () => {
  const frame = fractals.slice(fractals.indexOf('class="canvas-frame"'), fractals.indexOf('id="viz-dock"'));
  assert.match(frame, /<button type="button" id="stage-draw" class="primary stage-draw">Draw<\/button>/);
  assert.match(fractals, /id="toggle" class="primary">Draw<\/button>/);
  const rule = css.slice(css.indexOf(".stage-draw {"), css.indexOf(".stage-draw {") + 400);
  assert.match(rule, /left:\s*50%/);
  assert.match(rule, /top:\s*50%/);
  assert.match(rule, /transform:\s*translate\(-50%, -50%\)/);
  assert.match(rule, /font-size:\s*1\.85rem/);
  assert.match(rule, /z-index:\s*2/);
  assert.match(fractalApp, /const stageDraw = document\.querySelector\("#stage-draw"\)/);
  assert.match(fractalApp, /function canvasIsBlank\(\) \{\s*return !state\.running && !state\.paused && !state\.finished;\s*\}/);
  assert.match(fractalApp, /stageDraw\.hidden = !canvasIsBlank\(\)/);
  assert.match(fractalApp, /stageDraw\.addEventListener\("click", toggle\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/fractal-page.test.js`

Expected: FAIL because `#stage-draw` is absent.

- [ ] **Step 3: Add the button and the styles**

In `fractals.html`, inside `.canvas-frame`, immediately after the canvas element, add:

```html
          <button type="button" id="stage-draw" class="primary stage-draw">Draw</button>
```

In `styles.css`, immediately after the `canvas.exploring:active` rule, add:

```css
.stage-draw {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.85rem;
  letter-spacing: 0.02em;
  padding: 1.05rem 2.6rem;
  min-width: 10.5rem;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}
```

- [ ] **Step 4: Wire the button**

In `src/fractal-app.js`, next to `const toggleButton`, add:

```javascript
const stageDraw = document.querySelector("#stage-draw");
```

Inside `renderChrome`, after `dock.hidden = !state.dock;`, add:

```javascript
  stageDraw.hidden = !canvasIsBlank();
```

Add this function immediately before `function canExplore()`:

```javascript
function canvasIsBlank() {
  return !state.running && !state.paused && !state.finished;
}
```

Next to `toggleButton.addEventListener("click", toggle);`, add:

```javascript
stageDraw.addEventListener("click", toggle);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/fractal-page.test.js`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add fractals.html styles.css src/fractal-app.js test/fractal-page.test.js
git commit -m "Show an enlarged Draw on a blank fractal canvas."
```

### Task 2: Home icon

**Files:**
- Modify: `sorting.html`
- Modify: `fractals.html`
- Modify: `styles.css`
- Test: `test/home-page.test.js`

**Interfaces:**
- Consumes: existing `.site-nav` on both tool pages
- Produces: `a.home-link` with `href="/"`, `aria-label="Home"`, and an inline house SVG. No element text `Home`.

- [ ] **Step 1: Write the failing test**

In `test/home-page.test.js`, replace the two `href="/">Home</a>` assertions in "the tool pages link back to home and mark themselves" with:

```javascript
  for (const page of [sorting, fractals]) {
    assert.match(page, /<a href="\/" class="home-link" aria-label="Home">/);
    assert.match(page, /class="home-icon"/);
    assert.doesNotMatch(page, />Home</);
  }
  assert.match(css, /\.site-nav a\.home-link\s*\{[^}]*flex:\s*0 0 auto/);
```

Keep the existing `aria-current="page"` assertions in that test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/home-page.test.js`

Expected: FAIL because the Home anchors are still text.

- [ ] **Step 3: Replace both Home links**

In `sorting.html` and `fractals.html`, replace:

```html
          <a href="/">Home</a>
```

with:

```html
          <a href="/" class="home-link" aria-label="Home">
            <svg class="home-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z"/>
            </svg>
          </a>
```

In `styles.css`, immediately after `.site-nav a[aria-current="page"]` block, add:

```css
.site-nav a.home-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  padding: 0.45rem;
}

.home-icon {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/home-page.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sorting.html fractals.html styles.css test/home-page.test.js
git commit -m "Turn the tool-page Home links into a house icon."
```

### Task 3: Sound icon

**Files:**
- Modify: `sorting.html`
- Modify: `fractals.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Modify: `src/fractal-app.js`
- Test: `test/fractal-page.test.js`
- Test: `test/page.test.js`

**Interfaces:**
- Consumes: `#sound` and `speaker.setEnabled` on both pages
- Produces: `#sound.sound-toggle` as the first control inside each `.canvas-frame`, removed from each `.controls` row. Click handler sets `aria-pressed` and `speaker.setEnabled` only.

- [ ] **Step 1: Write the failing tests**

Append to `test/fractal-page.test.js`:

```javascript
test("sound is an icon at the top left of the fractal frame", () => {
  const controls = fractals.slice(fractals.indexOf('class="controls"'), fractals.indexOf('id="error"'));
  assert.doesNotMatch(controls, /id="sound"/);
  const frame = fractals.slice(fractals.indexOf('class="canvas-frame"'), fractals.indexOf('id="viz-dock"'));
  assert.match(frame, /id="sound" class="sound-toggle" aria-pressed="false" aria-label="Sound"/);
  assert.match(frame, /class="sound-icon sound-on"/);
  assert.match(frame, /class="sound-icon sound-off"/);
  assert.match(frame, /d="M20 7 8 17"/);
  const rule = css.slice(css.indexOf(".sound-toggle {"), css.indexOf(".sound-toggle {") + 700);
  assert.match(rule, /top:\s*0\.7rem/);
  assert.match(rule, /left:\s*0\.8rem/);
  assert.match(rule, /\.sound-toggle\[aria-pressed="false"\] \.sound-off/);
  assert.doesNotMatch(fractalApp, /soundButton\.textContent/);
});
```

Append to `test/page.test.js`:

```javascript
test("sound is an icon at the top left of the sorting frame", () => {
  const controls = page.slice(page.indexOf('class="controls"'), page.indexOf('class="compare"'));
  assert.doesNotMatch(controls, /id="sound"/);
  const frame = page.slice(page.indexOf('class="canvas-frame"'), page.indexOf('id="viz-dock"'));
  assert.match(frame, /id="sound" class="sound-toggle" aria-pressed="false" aria-label="Sound"/);
  assert.match(frame, /class="sound-icon sound-off"/);
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /soundButton\.textContent/);
  assert.match(app, /speaker\.setEnabled\(on\)/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/fractal-page.test.js test/page.test.js`

Expected: FAIL because Sound is still a text button in each panel.

- [ ] **Step 3: Move the markup**

Remove this line from the control row in both `sorting.html` and `fractals.html`:

```html
            <button type="button" id="sound" aria-pressed="false">Sound</button>
```

In both pages, make this the first child inside `.canvas-frame`, before the canvas:

```html
          <button type="button" id="sound" class="sound-toggle" aria-pressed="false" aria-label="Sound">
            <svg class="sound-icon sound-on" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" d="M3.5 9.5h3.2L11 6v12l-4.3-3.5H3.5z"/>
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15 9.2a3.2 3.2 0 0 1 0 5.6"/>
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M17.4 7a6.2 6.2 0 0 1 0 10"/>
            </svg>
            <svg class="sound-icon sound-off" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" d="M3.5 9.5h3.2L11 6v12l-4.3-3.5H3.5z"/>
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M20 7 8 17"/>
            </svg>
          </button>
```

In `styles.css`, immediately after the `.stage-draw` rule, add:

```css
.sound-toggle {
  position: absolute;
  z-index: 2;
  top: 0.7rem;
  left: 0.8rem;
  width: 2.55rem;
  height: 2.55rem;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(16, 14, 12, 0.82);
  color: var(--muted);
}

.sound-toggle .sound-icon {
  width: 1.25rem;
  height: 1.25rem;
  display: none;
}

.sound-toggle[aria-pressed="true"] .sound-on { display: block; }

.sound-toggle[aria-pressed="false"] .sound-off { display: block; }
```

- [ ] **Step 4: Stop replacing the icon with text**

In `src/app.js` and `src/fractal-app.js`, replace the sound click handler body so it is exactly:

```javascript
  const on = soundButton.getAttribute("aria-pressed") !== "true";
  soundButton.setAttribute("aria-pressed", String(on));
  speaker.setEnabled(on);
```

Delete the `soundButton.textContent = ...` line in both files.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/fractal-page.test.js test/page.test.js test/home-page.test.js`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add sorting.html fractals.html styles.css src/app.js src/fractal-app.js test/fractal-page.test.js test/page.test.js
git commit -m "Move Sound to a muted icon on the visualizer."
```

### Task 4: No reaction during auto zoom

**Files:**
- Modify: `src/fractal-app.js`
- Test: `test/fractal-page.test.js`

**Interfaces:**
- Consumes: `state.autoZoom`, `state.reactive`, `canAutoZoom()`, `renderChrome()`, `modeBadge`
- Produces: `isReactive()` returns `canAutoZoom(id) && state.reactive && !state.autoZoom`. Badge `aria-pressed` and text use the local `reactive` value from `isReactive()`. `modeBadge.disabled = state.autoZoom`.

- [ ] **Step 1: Write the failing test**

Append to `test/fractal-page.test.js`:

```javascript
test("auto zoom turns cursor reaction off without forgetting the preference", () => {
  const gate = fractalApp.slice(fractalApp.indexOf("function isReactive"), fractalApp.indexOf("function formatMag"));
  assert.match(gate, /canAutoZoom\(id\) && state\.reactive && !state\.autoZoom/);
  const chrome = fractalApp.slice(fractalApp.indexOf("function renderChrome"), fractalApp.indexOf("function paceLabel"));
  assert.match(chrome, /modeBadge\.setAttribute\("aria-pressed", String\(reactive\)\)/);
  assert.match(chrome, /modeBadge\.textContent = reactive \? "reactive on" : "reactive off"/);
  assert.match(chrome, /modeBadge\.disabled = state\.autoZoom/);
  const start = fractalApp.slice(fractalApp.indexOf("function startAutoZoom"), fractalApp.indexOf("const AUTO_FADE_MS"));
  assert.doesNotMatch(start, /state\.reactive = false/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/fractal-page.test.js`

Expected: FAIL because `isReactive` does not mention `state.autoZoom`.

- [ ] **Step 3: Implement the gate**

Replace `isReactive` with:

```javascript
function isReactive(id = state.fractalId) {
  return canAutoZoom(id) && state.reactive && !state.autoZoom;
}
```

In `renderChrome`, replace the two badge lines that read `state.reactive` with:

```javascript
  modeBadge.setAttribute("aria-pressed", String(reactive));
  modeBadge.textContent = reactive ? "reactive on" : "reactive off";
  modeBadge.disabled = state.autoZoom;
```

`const reactive = isReactive();` already exists above those lines. Leave `modeBadge.hidden = !(canAutoZoom() && state.finished && !state.running);` unchanged. Do not assign `state.reactive` inside `startAutoZoom`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`

Expected: PASS, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/fractal-app.js test/fractal-page.test.js
git commit -m "Disable cursor reaction while auto zoom is running."
```
