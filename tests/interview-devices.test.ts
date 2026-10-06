import test from "node:test";
import assert from "node:assert/strict";
import {
  interviewCaptureConstraints,
  interviewDeviceError,
  muteInterviewMicrophone,
  requireInterviewAudioTrack,
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
  for (const audioTracks of [[], [{ readyState: "ended" }]]) {
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
