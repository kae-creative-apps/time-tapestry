export type InterviewDevices = {
  microphoneId?: string;
  cameraId?: string;
};

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

export function interviewDeviceError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Allow microphone and camera access in your browser, then check your devices again. You can also write your answers.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "The selected microphone or camera is unavailable. Choose another device, or use voice only if you do not have a camera.";
  if (name === "NotReadableError" || name === "AbortError")
    return "Your microphone or camera could not open. Close other apps using it, then try again.";
  return error instanceof Error
    ? error.message
    : "Your devices could not open. Check your browser permissions and try again.";
}
