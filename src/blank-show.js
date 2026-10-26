import { FADE_MS, ZOOM_SCENES, filmBudget, filmLayer, filmSrc, sceneAt, showMode } from "./home-show.js";

/**
 * The home screensaver, limited to the fractal zooms, played behind Draw while the canvas is blank.
 * Sorting films stay on the home page. Reduced motion holds the opening Mandelbrot frame.
 */
export function createBlankShow(root) {
  const films = [...root.querySelectorAll(".blank-film")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let elapsed = 0;
  let lastNow = 0;
  let running = false;
  let current = -1;
  let primed = true;
  let showing = false;

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
    const park = () => {
      film.currentTime = 0;
    };
    if (film.readyState >= 1) park();
    else film.addEventListener("loadeddata", park, { once: true });
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
    const scene = ZOOM_SCENES.find((item) => item.id === film.dataset.film);
    if (!scene) return false;
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
    const scene = ZOOM_SCENES[schedule.index];
    const previousId = ZOOM_SCENES[(schedule.index - 1 + ZOOM_SCENES.length) % ZOOM_SCENES.length].id;
    const nextId = ZOOM_SCENES[(schedule.index + 1) % ZOOM_SCENES.length].id;
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
      const layer = filmLayer(id, schedule, fade, ZOOM_SCENES);
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
      if (film.dataset.film === ZOOM_SCENES[0].id) {
        arm(film);
        film.style.opacity = "1";
        film.style.zIndex = "2";
        hold(film);
      } else {
        release(film);
        film.style.opacity = "0";
      }
    }
  }

  function tick(now) {
    if (!running) return;
    if (!lastNow) lastNow = now;
    elapsed += Math.min(80, now - lastNow);
    lastNow = now;
    apply(sceneAt(elapsed, ZOOM_SCENES));
    requestAnimationFrame(tick);
  }

  function sync() {
    running = false;
    lastNow = 0;
    if (!showing) return;
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

  function setVisible(visible) {
    if (visible === showing) return;
    showing = visible;
    root.hidden = !visible;
    if (!visible) {
      running = false;
      lastNow = 0;
      for (const film of films) {
        if (!film.paused) film.pause();
      }
      return;
    }
    sync();
  }

  for (const film of films) {
    film.muted = true;
    film.playsInline = true;
  }
  reducedMotion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);

  return { setVisible };
}
