import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createInputMonitor,
  flushAndStopRecorder,
  type InputMonitorState,
} from "../src/lib/audio/input-monitor";
import { RecoveredRecordingPrompt } from "../src/components/collection/RecoveredRecordingPrompt";
import type { LocalTake } from "../src/lib/collection/local-takes";

test("Safari audio context is resumed synchronously on the initiating tap and can resume again", async () => {
  const events: string[] = [];
  const states: InputMonitorState[] = [];
  const context = {
    state: "suspended",
    resume() {
      events.push("resume");
      this.state = "running";
      return Promise.resolve();
    },
    close() {
      events.push("close");
      this.state = "closed";
      return Promise.resolve();
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const monitor = createInputMonitor(
    {
      onLevel() {},
      onState(state) {
        states.push(state);
      },
    },
    () => {
      events.push("construct");
      return context as unknown as AudioContext;
    },
  );
  events.push("permission request starts");
  assert.deepEqual(events.slice(0, 3), [
    "construct",
    "resume",
    "permission request starts",
  ]);
  context.state = "suspended";
  await monitor.resumeFromGesture();
  assert.equal(events.filter((event) => event === "resume").length, 2);
  assert.ok(states.includes("running"));
  monitor.close();
  monitor.close();
  assert.equal(events.filter((event) => event === "close").length, 1);
});

test("input meter measures microphone samples without connecting to speakers and releases resources", (t) => {
  const oldFrame = Object.getOwnPropertyDescriptor(
    globalThis,
    "requestAnimationFrame",
  );
  const oldCancel = Object.getOwnPropertyDescriptor(
    globalThis,
    "cancelAnimationFrame",
  );
  const frames: FrameRequestCallback[] = [];
  const cancelled: number[] = [];
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value(callback: FrameRequestCallback) {
      frames.push(callback);
      return frames.length;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value(id: number) {
      cancelled.push(id);
    },
  });
  t.after(() => {
    if (oldFrame)
      Object.defineProperty(globalThis, "requestAnimationFrame", oldFrame);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (oldCancel)
      Object.defineProperty(globalThis, "cancelAnimationFrame", oldCancel);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });
  const connected: unknown[] = [];
  const disconnected: string[] = [];
  const levels: number[] = [];
  const analyser = {
    fftSize: 256,
    getByteTimeDomainData(samples: Uint8Array) {
      samples.fill(160);
    },
    disconnect() {
      disconnected.push("analyser");
    },
  };
  const source = {
    connect(target: unknown) {
      connected.push(target);
    },
    disconnect() {
      disconnected.push("source");
    },
  };
  const context = {
    state: "running",
    destination: { forbiddenSpeaker: true },
    resume: async () => {},
    close: async () => {},
    addEventListener() {},
    removeEventListener() {},
    createMediaStreamSource: () => source,
    createAnalyser: () => analyser,
  };
  const monitor = createInputMonitor(
    {
      onLevel(level) {
        levels.push(level);
      },
    },
    () => context as unknown as AudioContext,
  );
  monitor.attach({} as MediaStream);
  frames[0](0);
  assert.equal(levels[0], 50);
  assert.deepEqual(connected, [analyser]);
  context.state = "suspended";
  frames[1](100);
  assert.equal(levels.at(-1), 0);
  monitor.close();
  assert.deepEqual(disconnected, ["source", "analyser"]);
  assert.ok(cancelled.length > 0);
});

test("page suspension requests a final chunk before stopping and still stops after a flush error", () => {
  const events: string[] = [];
  const recorder = {
    state: "recording",
    requestData() {
      events.push("data");
    },
    stop() {
      events.push("stop");
      this.state = "inactive";
    },
  };
  flushAndStopRecorder(recorder as unknown as MediaRecorder);
  assert.deepEqual(events, ["data", "stop"]);
  flushAndStopRecorder(recorder as unknown as MediaRecorder);
  assert.deepEqual(events, ["data", "stop"]);
  recorder.state = "recording";
  recorder.requestData = () => {
    throw new Error("The browser interrupted capture");
  };
  flushAndStopRecorder(recorder as unknown as MediaRecorder);
  assert.equal(events.at(-1), "stop");
  assert.equal(recorder.state, "inactive");
});

test("recovery prompt includes time, explicit choices, preview and device retention guidance", () => {
  const take: LocalTake = {
    id: "recovered-take",
    collectionId: "story-fixture",
    questionId: "q1",
    kind: "voice",
    prompt: "Fixture",
    text: "",
    mimeType: "audio/webm",
    state: "recording",
    createdAt: "2026-10-06T12:00:00Z",
    updatedAt: "2026-10-06T12:01:00Z",
  };
  const html = renderToStaticMarkup(
    createElement(RecoveredRecordingPrompt, {
      take,
      onKeep() {},
      onLater() {},
      children: createElement("audio", {
        controls: true,
        "aria-label": "Recovered preview",
      }),
    }),
  );
  assert.match(html, /We recovered your recording from/);
  assert.match(html, /2026/);
  assert.match(html, /Would you like to keep it\?/);
  assert.match(html, /Keep recording/);
  assert.match(html, />Later</);
  assert.match(html, /keeps the saved recording on this device/);
  assert.match(html, /Recovered preview/);
  assert.match(html, /final few moments may be missing/);
});
