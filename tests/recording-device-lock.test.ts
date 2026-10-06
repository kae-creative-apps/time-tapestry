import test from "node:test";
import assert from "node:assert/strict";
import { claimRecordingDeviceLock } from "../src/lib/collection/recording-device-lock";

test("device recovery cannot take an archive owned by another live recording tab", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const held = new Set<string>();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: async (
          name: string,
          _options: unknown,
          callback: (lock: unknown) => Promise<void>,
        ) => {
          if (held.has(name)) return callback(null);
          held.add(name);
          try {
            await callback({ name });
          } finally {
            held.delete(name);
          }
        },
      },
    },
  });
  try {
    const release = await claimRecordingDeviceLock("first-private-collection");
    await assert.rejects(
      claimRecordingDeviceLock("first-private-collection"),
      /another recording tab/,
    );
    const other = await claimRecordingDeviceLock("second-private-collection");
    other();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterClose = await claimRecordingDeviceLock(
      "first-private-collection",
    );
    afterClose();
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("browsers without Web Locks keep recording support without claiming cross-tab ownership", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  try {
    const release = await claimRecordingDeviceLock("older-browser");
    release();
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
