import test from "node:test";
import assert from "node:assert/strict";
import {
  interviewCaptureConstraints,
  interviewDeviceError,
  muteInterviewMicrophone,
  requireInterviewAudioTrack,
  requireActiveCapture,
  listenForCaptureInterruption,
  isInterviewMicrophoneFailure,
} from "../src/lib/collection/interview-devices";

test("selected input devices are required instead of silently switching to another camera or microphone", () => {
  const constraints = interviewCaptureConstraints("video", {
    microphoneId: "selected-microphone",
    cameraId: "selected-camera",
  });
  assert.deepEqual((constraints.audio as MediaTrackConstraints).deviceId, {
    exact: "selected-microphone",
  });
  assert.deepEqual((constraints.video as MediaTrackConstraints).deviceId, {
    exact: "selected-camera",
  });
  assert.equal(
    (constraints.video as MediaTrackConstraints).facingMode,
    undefined,
  );
});

test("late permission grants cannot keep microphone or camera open after navigation", async () => {
  let active = true;
  const stopped: string[] = [];
  const stream = {
    getTracks: () =>
      ["microphone", "camera"].map((id) => ({ stop: () => stopped.push(id) })),
  } as unknown as MediaStream;
  let grant!: (stream: MediaStream) => void;
  const permission = new Promise<MediaStream>((resolve) => {
    grant = resolve;
  });
  const opening = permission.then((stream) =>
    requireActiveCapture(stream, active),
  );
  active = false;
  grant(stream);
  await assert.rejects(opening, /cancelled/);
  assert.deepEqual(stopped, ["microphone", "camera"]);
  stopped.length = 0;
  requireActiveCapture(stream, true);
  assert.deepEqual(stopped, []);
});

test("voice-only interviews never ask for camera access and system defaults stay available", () => {
  const constraints = interviewCaptureConstraints("voice", {
    cameraId: "unused-camera",
  });
  assert.equal(constraints.video, false);
  assert.equal(
    (constraints.audio as MediaTrackConstraints).deviceId,
    undefined,
  );
  assert.equal(
    (interviewCaptureConstraints("video").video as MediaTrackConstraints)
      .facingMode,
    "user",
  );
});

test("both recording modes require a live microphone even when a camera is available", () => {
  for (const audioTracks of [
    [],
    [{ readyState: "ended" }],
    [{ readyState: "live", muted: true }],
  ]) {
    const stream = {
      getAudioTracks: () => audioTracks,
      getVideoTracks: () => [{ readyState: "live" }],
    } as unknown as MediaStream;
    assert.throws(
      () => requireInterviewAudioTrack(stream),
      /microphone did not open/,
    );
  }
  assert.throws(
    () => requireInterviewAudioTrack(null),
    /microphone did not open/,
  );
  for (const enabled of [true, false]) {
    const stream = {
      getAudioTracks: () => [{ readyState: "live", enabled }],
    } as unknown as MediaStream;
    assert.doesNotThrow(() => requireInterviewAudioTrack(stream));
  }
});

test("temporary capture mute pauses once and cannot automatically resume on unmute", () => {
  const microphone = new EventTarget();
  const camera = new EventTarget();
  const stream = {
    getTracks: () => [microphone, camera],
  } as unknown as MediaStream;
  let paused = 0;
  const remove = listenForCaptureInterruption(stream, () => {
    paused += 1;
  });
  microphone.dispatchEvent(new Event("mute"));
  microphone.dispatchEvent(new Event("unmute"));
  camera.dispatchEvent(new Event("ended"));
  assert.equal(paused, 1);
  remove();
  camera.dispatchEvent(new Event("mute"));
  assert.equal(paused, 1);
  const resumed = listenForCaptureInterruption(stream, () => {
    paused += 1;
  });
  microphone.dispatchEvent(new Event("mute"));
  assert.equal(paused, 2, "explicit resume rearms capture monitoring");
  resumed();
});

test("the SDK asynchronous mute failure is treated as loss of microphone synchronization", () => {
  assert.equal(
    isInterviewMicrophoneFailure("Failed to set input muted state"),
    true,
  );
  assert.equal(
    isInterviewMicrophoneFailure("Temporary transcript delay"),
    false,
  );
});

test("microphone mute silences every audio track without disabling or ending video", () => {
  const audio = [{ enabled: true }, { enabled: true }];
  const video = [{ enabled: true }];
  const stream = {
    getAudioTracks: () => audio,
    getVideoTracks: () => video,
  } as unknown as MediaStream;
  muteInterviewMicrophone(stream, true);
  assert.ok(audio.every((track) => !track.enabled));
  assert.equal(video[0].enabled, true);
  muteInterviewMicrophone(stream, false);
  assert.ok(audio.every((track) => track.enabled));
  muteInterviewMicrophone(null, true);
});

test("device failures give a useful next step while preserving unknown error details", () => {
  assert.match(
    interviewDeviceError(new DOMException("denied", "NotAllowedError")),
    /browser/,
  );
  assert.match(
    interviewDeviceError(new DOMException("gone", "OverconstrainedError")),
    /Choose another/,
  );
  assert.match(
    interviewDeviceError(new DOMException("busy", "NotReadableError")),
    /Close other apps/,
  );
  assert.equal(
    interviewDeviceError(new Error("Specific storage failure")),
    "Specific storage failure",
  );
});
