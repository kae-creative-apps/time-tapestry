"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  interviewCaptureConstraints,
  interviewDeviceError,
  type InterviewDevices,
} from "@/lib/collection/interview-devices";

export function InterviewDeviceSetup({
  kind,
  devices,
  onChange,
}: {
  kind: "voice" | "video";
  devices: InterviewDevices;
  onChange: (devices: InterviewDevices) => void;
}) {
  const [available, setAvailable] = useState<MediaDeviceInfo[]>([]);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const media = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);

  const stopPreview = useCallback(() => {
    generation.current += 1;
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    setPreview(null);
    setChecking(false);
  }, []);

  useEffect(() => {
    let current = true;
    const refresh = () => {
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((items) => {
          if (current) setAvailable(items);
        })
        .catch(() => {});
    };
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => {
      current = false;
      generation.current += 1;
      media.current?.getTracks().forEach((track) => track.stop());
      media.current = null;
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
    };
  }, []);

  useEffect(() => {
    stopPreview();
  }, [kind, stopPreview]);

  useEffect(() => {
    if (video.current) video.current.srcObject = preview;
    if (!preview) {
      setLevel(0);
      return;
    }
    let context: AudioContext | undefined;
    let frame = 0;
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(preview);
      source.connect(analyser);
      // The analyser is never connected to speakers, so this check cannot echo.
      const samples = new Uint8Array(analyser.fftSize);
      const update = () => {
        analyser.getByteTimeDomainData(samples);
        const peak = Math.max(...samples.map((value) => Math.abs(value - 128)));
        setLevel(Math.min(100, Math.round((peak / 64) * 100)));
        frame = requestAnimationFrame(update);
      };
      update();
      void context.resume().catch(() => {});
    } catch {
      // Preview and device selection still work without an audio meter.
    }
    return () => {
      cancelAnimationFrame(frame);
      void context?.close().catch(() => {});
    };
  }, [preview]);

  async function checkDevices() {
    stopPreview();
    const attempt = generation.current;
    setChecking(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "This browser cannot open your devices. Open your interview link in an updated browser to record your answers.",
        );
      const stream = await navigator.mediaDevices.getUserMedia(
        interviewCaptureConstraints(kind, devices),
      );
      if (generation.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      media.current = stream;
      setPreview(stream);
      const items = await navigator.mediaDevices.enumerateDevices();
      if (generation.current === attempt) setAvailable(items);
    } catch (cause) {
      if (generation.current === attempt) setError(interviewDeviceError(cause));
    } finally {
      if (generation.current === attempt) setChecking(false);
    }
  }

  return (
    <div className="my-5 space-y-4 rounded-xl border border-warmgray-200 bg-paper-100 p-4">
      <p className="text-base font-medium">Your microphone and camera</p>
      <p className="text-sm leading-6 text-ink-500">
        Check your devices before you begin. This preview is not recorded or
        sent anywhere. To change devices during an interview, pause first.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          ["audioinput", ...(kind === "video" ? ["videoinput"] : [])] as const
        ).map((deviceKind) => {
          const microphone = deviceKind === "audioinput";
          const key = microphone ? "microphoneId" : "cameraId";
          const label = microphone ? "Microphone" : "Camera";
          return (
            <label className="block text-base" key={deviceKind}>
              {label}
              <select
                className="mt-2 min-h-12 w-full min-w-0 rounded-md border border-warmgray-300 bg-white px-3 text-base"
                value={devices[key] || ""}
                disabled={checking}
                onChange={(event) => {
                  stopPreview();
                  onChange({ ...devices, [key]: event.target.value });
                }}
              >
                <option value="">System default</option>
                {available
                  .filter((item) => item.kind === deviceKind && item.deviceId)
                  .map((item, index) => (
                    <option key={item.deviceId} value={item.deviceId}>
                      {item.label || `${label} ${index + 1}`}
                    </option>
                  ))}
              </select>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        className="min-h-11 text-base text-oxblood underline underline-offset-4 disabled:opacity-50"
        disabled={checking}
        onClick={() => (preview ? stopPreview() : void checkDevices())}
      >
        {checking
          ? "Opening your devices..."
          : preview
            ? "Stop device check"
            : "Check my devices"}
      </button>
      {preview && (
        <div className="space-y-3">
          {kind === "video" && (
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full rounded-lg bg-ink-800 object-cover"
              aria-label="Camera setup preview"
            />
          )}
          <p className="text-sm text-ink-500">
            Speak to check your microphone.
          </p>
          <meter
            min={0}
            max={100}
            value={level}
            className="h-3 w-full"
            aria-label="Microphone input level"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-base leading-7 text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}
