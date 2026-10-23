import { FADE_MS, SCENES, sceneAt, showMode } from "./home-show.js";

const films = [...document.querySelectorAll(".home-film")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let elapsed = 0;
let lastNow = 0;
let running = false;
let current = -1;
let primed = true;

function shownFade(schedule) {
  if (primed && elapsed < FADE_MS) return 1;
  return schedule.fade;
}

function filmFor(id) {
  return films.find((film) => film.dataset.zoom === id);
}

function playFromStart(film) {
  film.pause();
  const start = () => {
    film.currentTime = 0;
    const pending = film.play();
    if (pending) pending.catch(() => {});
  };
  if (film.readyState >= 1) start();
  else film.addEventListener("loadeddata", start, { once: true });
}

function hold(film) {
  film.pause();
  if (film.readyState >= 1) film.currentTime = 0;
}

function resume(film) {
  if (!film || film.ended || !film.paused) return;
  const pending = film.play();
  if (pending) pending.catch(() => {});
}

function apply(schedule) {
  const scene = SCENES[schedule.index];
  const previousId = SCENES[(schedule.index - 1 + SCENES.length) % SCENES.length].id;
  if (schedule.index !== 0) primed = false;
  const fade = shownFade(schedule);
  if (schedule.index !== current) {
    current = schedule.index;
    const incoming = filmFor(scene.id);
    if (incoming) playFromStart(incoming);
  }
  for (const film of films) {
    const id = film.dataset.zoom;
    if (id === scene.id) {
      film.style.opacity = String(fade);
      if (showMode(reducedMotion.matches) === "play") resume(film);
    } else if (id === previousId && fade < 1) {
      film.style.opacity = "1";
      if (showMode(reducedMotion.matches) === "play") resume(film);
    } else {
      film.style.opacity = "0";
      if (!film.paused) film.pause();
    }
  }
}

function paintStill() {
  running = false;
  current = 0;
  for (const film of films) {
    if (film.dataset.zoom === SCENES[0].id) {
      film.style.opacity = "1";
      hold(film);
    } else {
      film.style.opacity = "0";
      film.pause();
    }
  }
}

function tick(now) {
  if (!running) return;
  if (!lastNow) lastNow = now;
  elapsed += Math.min(80, now - lastNow);
  lastNow = now;
  apply(sceneAt(elapsed));
  requestAnimationFrame(tick);
}

function sync() {
  running = false;
  lastNow = 0;
  if (showMode(reducedMotion.matches) === "still") {
    paintStill();
    return;
  }
  if (document.hidden) {
    for (const film of films) film.pause();
    return;
  }
  running = true;
  requestAnimationFrame(tick);
}

for (const film of films) {
  film.muted = true;
  film.playsInline = true;
}

reducedMotion.addEventListener("change", sync);
document.addEventListener("visibilitychange", sync);
sync();
