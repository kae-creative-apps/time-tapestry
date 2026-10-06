import assert from "node:assert/strict";
import test from "node:test";
import { verifyReplyPlayback } from "./reply-playback";

class FakeMedia extends EventTarget {
  src = "";
  preload = "";
  loads = 0;
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  load() {
    this.loads++;
  }
}

test("reply playback probe requires decodable media and cleans up without playing it", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const media = new FakeMedia();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => media },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const check = verifyReplyPlayback("/api/private-recording");
  assert.equal(media.src, "/api/private-recording");
  media.dispatchEvent(new Event("canplay"));
  await check;
  assert.equal(media.src, "");
  assert.equal(media.loads, 2);
});

test("failed or stalled reply playback rejects so the caller can preserve its draft", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  let media = new FakeMedia();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => media },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const failure = verifyReplyPlayback("/api/unavailable");
  const failed = assert.rejects(failure, /reply is still saved/);
  media.dispatchEvent(new Event("error"));
  await failed;
  assert.equal(media.src, "");
  media = new FakeMedia();
  const stalled = assert.rejects(
    verifyReplyPlayback("/api/stalled", 100),
    /taking too long/,
  );
  t.mock.timers.tick(100);
  await stalled;
  assert.equal(media.src, "");
});
