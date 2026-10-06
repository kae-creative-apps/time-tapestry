export type InterviewDevices = {
  microphoneId?: string;
  cameraId?: string;
};

/** Permission dialogs may finish after the recording page has been closed. */
export function requireActiveCapture(
  stream: MediaStream,
  active: boolean,
): void {
  if (active) return;
  stream.getTracks().forEach((track) => track.stop());
  throw new Error("Recording was cancelled.");
}

export function interviewCaptureConstraints(
  kind: "voice" | "video",
  devices: InterviewDevices = {},
): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      ...(devices.microphoneId
        ? { deviceId: { exact: devices.microphoneId } }
        : {}),
    },
    video:
      kind === "video"
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...(devices.cameraId
              ? { deviceId: { exact: devices.cameraId } }
              : { facingMode: "user" }),
          }
        : false,
  };
}

export function muteInterviewMicrophone(
  stream: MediaStream | null,
  muted: boolean,
) {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
}

export function requireInterviewAudioTrack(stream: MediaStream | null): void {
  if (
    !stream
      ?.getAudioTracks()
      .some((track) => track.readyState === "live" && !track.muted)
  )
    throw new Error(
      "Your microphone did not open, so recording could not start. Choose a working microphone and try again. Both recording options need your voice.",
    );
}

/** A device can go silent while still live. Never resume it without the user. */
export function listenForCaptureInterruption(
  stream: MediaStream,
  onInterrupted: () => void,
): () => void {
  let notified = false;
  const interrupted = () => {
    if (notified) return;
    notified = true;
    onInterrupted();
  };
  const tracks = stream.getTracks();
  for (const track of tracks) {
    track.addEventListener("ended", interrupted);
    track.addEventListener("mute", interrupted);
  }
  return () => {
    for (const track of tracks) {
      track.removeEventListener("ended", interrupted);
      track.removeEventListener("mute", interrupted);
    }
  };
}

/** The installed SDK reports asynchronous input mute failures through onError. */
export function isInterviewMicrophoneFailure(message: string): boolean {
  return message === "Failed to set input muted state";
}

export function interviewDeviceError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Allow microphone access in your browser, then check your devices again. Video also needs camera access. You can choose audio only if you prefer.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "The selected microphone or camera is unavailable. Choose another device, or use audio only if you do not have a camera.";
  if (name === "NotReadableError" || name === "AbortError")
    return "Your microphone or camera could not open. Close other apps using it, then try again.";
  return error instanceof Error
    ? error.message
    : "Your devices could not open. Check your browser permissions and try again.";
}
