import test from "node:test";
import assert from "node:assert/strict";
import {
  createInterviewPlayback,
  restoreInterviewAudio,
} from "../src/lib/collection/interview-playback";

function audio(hidden = true) {
  return {
    style: { display: hidden ? "none" : "block" } as CSSStyleDeclaration,
    srcObject: {} as MediaStream,
    muted: true,
    volume: 0,
    calls: 0,
    async play() {
      this.calls += 1;
    },
  };
}

test("reconnected output is audible independently of an explicitly muted microphone", () => {
  let output = 0;
  let inputMuted = true;
  const conversation = {
    setVolume: ({ volume }: { volume: number }) => {
      output = volume;
    },
    setMicMuted: (muted: boolean) => {
      inputMuted = muted;
    },
  };
  restoreInterviewAudio(conversation, false);
  assert.equal(output, 1);
  assert.equal(inputMuted, false);
  output = 0;
  restoreInterviewAudio(conversation, true);
  assert.equal(output, 1);
  assert.equal(inputMuted, true);
});

test("playback recovery targets only the new connection and starts during the user gesture", async () => {
  const prior = audio();
  const originalPlayer = audio(false);
  const elements = [prior];
  const states: boolean[] = [];
  const playback = createInterviewPlayback({
    audioElements: () => elements,
    onBlocked: (value) => states.push(value),
  });
  const current = audio();
  elements.push(current, originalPlayer);
  const restored = playback.play();
  assert.equal(current.calls, 1);
  assert.equal(current.muted, false);
  assert.equal(current.volume, 1);
  assert.equal(prior.calls, 0);
  assert.equal(originalPlayer.calls, 0);
  assert.equal(prior.volume, 0);
  await restored;
  assert.deepEqual(states, [false]);
});

test("autoplay rejection becomes recoverable and a second click clears it", async () => {
  const elements: ReturnType<typeof audio>[] = [];
  const states: boolean[] = [];
  const playback = createInterviewPlayback({
    audioElements: () => elements,
    onBlocked: (value) => states.push(value),
  });
  const current = audio();
  let allowed = false;
  current.play = async () => {
    if (!allowed) throw new DOMException("Gesture needed", "NotAllowedError");
  };
  elements.push(current);
  await playback.play();
  assert.deepEqual(states, [true]);
  allowed = true;
  await playback.play();
  assert.deepEqual(states, [true, false]);
});

test("pausing invalidates late playback results and prevents a stopped connection from restarting", async () => {
  const elements: ReturnType<typeof audio>[] = [];
  const states: boolean[] = [];
  const playback = createInterviewPlayback({
    audioElements: () => elements,
    onBlocked: (value) => states.push(value),
  });
  const current = audio();
  let reject!: (reason: unknown) => void;
  current.play = () => {
    current.calls += 1;
    return new Promise<void>((_, fail) => {
      reject = fail;
    });
  };
  elements.push(current);
  const starting = playback.play();
  playback.dispose();
  reject(new Error("Connection closed"));
  await starting;
  await playback.play();
  assert.equal(current.calls, 1);
  assert.deepEqual(states, []);
});
