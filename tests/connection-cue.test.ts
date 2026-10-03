import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { startConnectionCue } from "../src/lib/collection/connection-cue";

type AudioOptions = {
  resume?: "allow" | "deny" | "hang" | "suspended" | "throw";
  close?: "resolve" | "hang" | "reject" | "throw";
  legacy?: boolean;
};

class MockParam {
  events: { value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this.setValueAtTime(value, time);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    return this.setValueAtTime(value, time);
  }
}

class MockNode {
  connections: unknown[] = [];
  disconnects = 0;
  connect(destination: unknown) {
    this.connections.push(destination);
    return destination;
  }
  disconnect() {
    this.disconnects += 1;
    this.connections = [];
  }
}

class MockOscillator extends MockNode {
  type = "square";
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  start(time: number) {
    this.starts.push(time);
  }
  stop(time?: number) {
    this.stops.push(time);
  }
  end() {
    this.onended?.();
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}

function installAudio(t: TestContext, options: AudioOptions = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const contexts: MockAudioContext[] = [];
  class MockAudioContext {
    state = "suspended";
    currentTime = 12;
    destination = {};
    onstatechange: (() => void) | null = null;
    oscillators: MockOscillator[] = [];
    gains: MockGain[] = [];
    resumeCalls = 0;
    closeCalls = 0;
    resolveResume: (() => void) | undefined;
    constructor() {
      contexts.push(this);
    }
    resume(): Promise<void> {
      this.resumeCalls += 1;
      if (options.resume === "throw") throw new Error("Audio is unavailable");
      if (options.resume === "deny") {
        return Promise.reject(new Error("Autoplay denied"));
      }
      if (options.resume === "hang") {
        return new Promise((resolve) => {
          this.resolveResume = () => {
            this.state = "running";
            resolve();
          };
        });
      }
      if (options.resume !== "suspended") this.state = "running";
      return Promise.resolve();
    }
    close(): Promise<void> {
      this.closeCalls += 1;
      this.state = "closed";
      if (options.close === "throw") throw new Error("Close failed");
      if (options.close === "reject") {
        return Promise.reject(new Error("Close rejected"));
      }
      if (options.close === "hang") return new Promise(() => {});
      return Promise.resolve();
    }
    createOscillator() {
      const oscillator = new MockOscillator();
      this.oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      const gain = new MockGain();
      this.gains.push(gain);
      return gain;
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: options.legacy
      ? { webkitAudioContext: MockAudioContext }
      : { AudioContext: MockAudioContext },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return contexts;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("creates and resumes in the gesture, then finishes only after both tones are disconnected", async (t) => {
  const contexts = installAudio(t);
  const cue = startConnectionCue();
  assert.equal(contexts.length, 1);
  const context = contexts[0];
  assert.equal(context.resumeCalls, 1);
  let finished = false;
  void cue.finished.then(() => {
    for (const node of [...context.oscillators, ...context.gains]) {
      assert.equal(node.disconnects, 1);
      assert.deepEqual(node.connections, []);
    }
    finished = true;
  });
  await flushMicrotasks();
  assert.equal(context.oscillators.length, 2);
  assert.deepEqual(
    context.oscillators.map((node) => node.type),
    ["sine", "sine"],
  );
  assert.ok(
    context.oscillators[0].frequency.value <
      context.oscillators[1].frequency.value,
  );
  for (const [index, oscillator] of context.oscillators.entries()) {
    assert.equal(oscillator.starts.length, 1);
    const stop = oscillator.stops[0]!;
    assert.ok(stop > oscillator.starts[0]);
    assert.ok(stop - context.currentTime <= 0.55);
    const envelope = context.gains[index].gain.events;
    assert.equal(envelope[0].value, 0);
    assert.equal(envelope.at(-1)?.value, 0);
    assert.ok(envelope.every(({ value }) => value >= 0 && value <= 0.035));
  }
  context.oscillators[0].end();
  await flushMicrotasks();
  assert.equal(finished, false);
  context.oscillators[1].end();
  await cue.finished;
  assert.equal(finished, true);
  assert.equal(context.closeCalls, 1);
  cue.dispose();
  assert.equal(context.closeCalls, 1);
});

test("dispose immediately silences scheduled tones and releases recording even when close hangs", async (t) => {
  const contexts = installAudio(t, { close: "hang" });
  const cue = startConnectionCue();
  await flushMicrotasks();
  const context = contexts[0];
  cue.dispose();
  cue.dispose();
  await cue.finished;
  for (const oscillator of context.oscillators) {
    assert.equal(oscillator.stops.at(-1), undefined);
    assert.equal(oscillator.onended, null);
    assert.equal(oscillator.disconnects, 1);
  }
  assert.ok(context.gains.every((gain) => gain.disconnects === 1));
  assert.equal(context.closeCalls, 1);
});

test("cancellation before resume resolves prevents late playback", async (t) => {
  const contexts = installAudio(t, { resume: "hang", close: "hang" });
  const cue = startConnectionCue();
  cue.dispose();
  await cue.finished;
  const context = contexts[0];
  context.resolveResume?.();
  await flushMicrotasks();
  assert.equal(context.oscillators.length, 0);
  assert.equal(context.closeCalls, 1);
});

for (const resume of ["deny", "throw", "suspended"] as const) {
  test(`${resume} resume stays silent and releases the recording boundary`, async (t) => {
    const contexts = installAudio(t, { resume });
    const cue = startConnectionCue();
    await cue.finished;
    assert.equal(contexts[0].oscillators.length, 0);
    assert.equal(contexts[0].closeCalls, 1);
  });
}

test("a hung resume times out promptly and cannot play when it eventually resolves", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const contexts = installAudio(t, { resume: "hang", close: "hang" });
  const cue = startConnectionCue();
  let finished = false;
  void cue.finished.then(() => {
    finished = true;
  });
  t.mock.timers.tick(79);
  await flushMicrotasks();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  await cue.finished;
  assert.equal(finished, true);
  contexts[0].resolveResume?.();
  await flushMicrotasks();
  assert.equal(contexts[0].oscillators.length, 0);
  assert.equal(contexts[0].closeCalls, 1);
});

test("missing ended events still disconnect all audio within 520 ms", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const contexts = installAudio(t, { close: "hang" });
  const cue = startConnectionCue();
  await flushMicrotasks();
  t.mock.timers.tick(519);
  assert.equal(contexts[0].closeCalls, 0);
  t.mock.timers.tick(1);
  await cue.finished;
  assert.equal(contexts[0].closeCalls, 1);
  assert.ok(contexts[0].oscillators.every((node) => node.disconnects === 1));
  assert.ok(contexts[0].gains.every((node) => node.disconnects === 1));
});

test("suspending an active cue cancels scheduled playback before a later resume", async (t) => {
  const contexts = installAudio(t);
  const cue = startConnectionCue();
  await flushMicrotasks();
  const context = contexts[0];
  context.state = "suspended";
  context.onstatechange?.();
  await cue.finished;
  assert.equal(context.onstatechange, null);
  assert.ok(context.oscillators.every((node) => node.disconnects === 1));
  assert.ok(
    context.oscillators.every((node) => node.stops.at(-1) === undefined),
  );
});

for (const close of ["reject", "throw"] as const) {
  test(`${close} close cannot reject completion`, async (t) => {
    installAudio(t, { close });
    const cue = startConnectionCue();
    await flushMicrotasks();
    cue.dispose();
    await cue.finished;
    await flushMicrotasks();
  });
}

test("supports the prefixed AudioContext constructor", async (t) => {
  const contexts = installAudio(t, { legacy: true });
  const cue = startConnectionCue();
  assert.equal(contexts[0].resumeCalls, 1);
  cue.dispose();
  await cue.finished;
  await flushMicrotasks();
  assert.equal(contexts[0].oscillators.length, 0);
});

test("missing browser audio support resolves silently", async (t) => {
  installAudio(t);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  await startConnectionCue().finished;
  Reflect.deleteProperty(globalThis, "window");
  await startConnectionCue().finished;
});
