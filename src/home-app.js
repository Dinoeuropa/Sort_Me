import { FADE_MS, SCENES, filmBudget, filmLayer, filmSrc, sceneAt, showMode } from "./home-show.js";

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
  return films.find((film) => film.dataset.film === id);
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

function linkBudget() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return filmBudget({
    width: window.innerWidth,
    saveData: Boolean(connection && connection.saveData),
    effectiveType: connection ? connection.effectiveType : "",
    downlink: connection ? connection.downlink : 0,
  });
}

function attrPath(film, name) {
  const value = film.getAttribute(name);
  if (!value) return "";
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value;
  }
}

function arm(film) {
  if (!film) return false;
  const scene = SCENES.find((item) => item.id === film.dataset.film);
  const src = filmSrc(scene, linkBudget());
  if (attrPath(film, "poster") !== scene.poster) film.poster = scene.poster;
  film.preload = "auto";
  if (attrPath(film, "src") === src) return false;
  film.src = src;
  return true;
}

function release(film) {
  if (!film.getAttribute("src")) return;
  film.pause();
  film.preload = "none";
  film.removeAttribute("src");
  film.load();
}

function apply(schedule) {
  const scene = SCENES[schedule.index];
  const previousId = SCENES[(schedule.index - 1 + SCENES.length) % SCENES.length].id;
  const nextId = SCENES[(schedule.index + 1) % SCENES.length].id;
  if (elapsed >= FADE_MS) primed = false;
  const fade = shownFade(schedule);
  const keep = new Set([scene.id, nextId]);
  if (fade < 1) keep.add(previousId);
  for (const film of films) {
    if (!keep.has(film.dataset.film)) release(film);
  }
  const incoming = filmFor(scene.id);
  const restarted = arm(incoming);
  arm(filmFor(nextId));
  if (schedule.index !== current || restarted) {
    current = schedule.index;
    if (incoming) playFromStart(incoming);
  }
  for (const film of films) {
    const id = film.dataset.film;
    const layer = filmLayer(id, schedule, fade);
    film.style.zIndex = String(layer);
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
    release(film);
    if (film.dataset.film === SCENES[0].id) {
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
