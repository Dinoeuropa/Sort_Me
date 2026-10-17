const LOW_HZ = 180;
const HIGH_HZ = 1400;

export function frequencyFor(value, maxValue) {
  const span = Math.max(1, Number(maxValue) - 1);
  const t = Math.min(1, Math.max(0, (Number(value) - 1) / span));
  return LOW_HZ * (HIGH_HZ / LOW_HZ) ** t;
}

export function notesForFrame(frame, limit = 2) {
  if (!frame || !Array.isArray(frame.array) || !Array.isArray(frame.indices)) return [];
  const maxValue = frame.maxValue || frame.array.reduce((peak, value) => Math.max(peak, value), 1);
  const notes = [];
  for (const index of frame.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= frame.array.length) continue;
    notes.push(frequencyFor(frame.array[index], maxValue));
    if (notes.length >= limit) break;
  }
  return notes;
}

function strike(ctx, frequency, delay = 0) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.06, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.1);
}

export function createSpeaker({ createContext } = {}) {
  let enabled = false;
  let context = null;

  function ensure() {
    if (!context) {
      context = createContext ? createContext() : new AudioContext();
    }
    if (context.state === "suspended" && context.resume) context.resume();
    return context;
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) {
        if (context?.suspend) context.suspend();
        return;
      }
      ensure();
    },
    play(frame, limit = 2) {
      if (!enabled) return [];
      const notes = notesForFrame(frame, limit);
      const ctx = ensure();
      notes.forEach((frequency, index) => strike(ctx, frequency, index * 0.018));
      return notes;
    },
    playSweep(values, maxValue) {
      if (!enabled || !values?.length) return 0;
      const ctx = ensure();
      const step = Math.max(1, Math.ceil(values.length / 24));
      let count = 0;
      for (let i = 0; i < values.length; i += step) {
        strike(ctx, frequencyFor(values[i], maxValue), count * 0.035);
        count += 1;
      }
      return count;
    },
  };
}
