import assert from "node:assert/strict";
import test from "node:test";
import { createSpeaker, frequencyFor } from "../src/sound.js";

function mockAudio() {
  const strikes = [];
  return {
    state: "running",
    currentTime: 0,
    destination: {},
    strikes,
    resume() {
      this.state = "running";
    },
    suspend() {
      this.state = "suspended";
    },
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: { value: 0 },
        connect() {},
        start() {
          strikes.push(osc.frequency.value);
        },
        stop() {},
      };
      return osc;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    },
  };
}

test("higher values sing a higher note", () => {
  const low = frequencyFor(1, 100);
  const mid = frequencyFor(50, 100);
  const high = frequencyFor(100, 100);
  assert.ok(low < mid && mid < high);
  assert.ok(low >= 170 && low <= 190);
  assert.ok(high >= 1300 && high <= 1500);
});

test("sound stays silent until it is switched on and can be switched off", () => {
  const contexts = [];
  const speaker = createSpeaker({
    createContext() {
      const audio = mockAudio();
      contexts.push(audio);
      return audio;
    },
  });
  const frame = { array: [1, 3], indices: [0, 1], maxValue: 3 };
  assert.equal(speaker.enabled, false);
  assert.deepEqual(speaker.play(frame), []);
  assert.equal(contexts.length, 0);

  speaker.setEnabled(true);
  const notes = speaker.play(frame);
  assert.equal(notes.length, 2);
  assert.ok(notes[1] > notes[0]);
  assert.equal(contexts[0].strikes.length, 2);

  speaker.setEnabled(false);
  assert.deepEqual(speaker.play(frame), []);
  assert.equal(contexts[0].state, "suspended");
  assert.equal(speaker.playSweep([1, 2, 3], 3), 0);
});

test("drawing notes stay silent until sound is on and follow the value", () => {
  let audio;
  const speaker = createSpeaker({
    createContext() {
      audio = mockAudio();
      return audio;
    },
  });
  assert.deepEqual(speaker.playNotes([10, 80], 100), []);
  speaker.setEnabled(true);
  const notes = speaker.playNotes([10, 80], 100, 2);
  assert.equal(notes.length, 2);
  assert.ok(notes[0] < notes[1]);
  assert.equal(audio.strikes.length, 2);
  speaker.setEnabled(false);
  assert.deepEqual(speaker.playNotes([40], 100), []);
});

test("a finished run can play an ascending sweep only while sound is on", () => {
  let audio;
  const speaker = createSpeaker({
    createContext() {
      audio = mockAudio();
      return audio;
    },
  });
  speaker.setEnabled(true);
  const count = speaker.playSweep([1, 2, 3, 4], 4);
  assert.ok(count >= 2);
  assert.equal(audio.strikes.length, count);
  assert.ok(audio.strikes[0] < audio.strikes[audio.strikes.length - 1]);
});
