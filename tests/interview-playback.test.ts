import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptInterviewConnection,
  createInterviewPlayback,
  restoreInterviewAudio,
} from "../src/lib/collection/interview-playback";

test("a delayed connection resolving after pause closes without restoring audio or activating the interview", async () => {
  let generation = 1;
  let stopped = false;
  const attempt = generation;
  let ended = 0;
  let activated = false;
  let audioRestored = false;
  const conversation = {
    async endSession() {
      ended += 1;
    },
    setVolume() {
      audioRestored = true;
    },
    setMicMuted() {},
  };
  let resolve!: (value: typeof conversation) => void;
  const starting = new Promise<typeof conversation>((done) => {
    resolve = done;
  });
  const continuation = starting.then((connected) => {
    if (
      !acceptInterviewConnection(connected, generation === attempt && !stopped)
    )
      return;
    restoreInterviewAudio(connected, false);
    activated = true;
  });

  // A mute failure cancels startup before the SDK returns its client.
  generation += 1;
  stopped = true;
  resolve(conversation);
  await continuation;
  assert.equal(ended, 1);
  assert.equal(audioRestored, false);
  assert.equal(activated, false);
});

test("a late created client is rejected after a new connection replaces the cancelled attempt", async () => {
  let ended = 0;
  const oldClient = {
    async endSession() {
      ended += 1;
      throw new Error("Connection already closed");
    },
  };
  const cancelledAttempt = 1;
  const connectionAttempt = { current: 3 };
  // A new connection clears intentionalStop, but never revives the old attempt.
  const stopped = false;
  assert.equal(
    acceptInterviewConnection(
      oldClient,
      connectionAttempt.current === cancelledAttempt && !stopped,
    ),
    false,
  );
  await Promise.resolve();
  assert.equal(ended, 1);
});

test("the current connection remains open and an intentional pause closes it even before replacement", () => {
  let ended = 0;
  const conversation = {
    async endSession() {
      ended += 1;
    },
  };
  assert.equal(acceptInterviewConnection(conversation, true), true);
  assert.equal(ended, 0);
  assert.equal(acceptInterviewConnection(conversation, false), false);
  assert.equal(ended, 1);
});

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
