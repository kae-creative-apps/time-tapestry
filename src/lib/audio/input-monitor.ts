export type InputMonitorState = AudioContextState | "unavailable";
export type InputMonitor = {
  attach: (stream: MediaStream) => void;
  resumeFromGesture: () => Promise<void>;
  close: () => void;
};
type Options = {
  onLevel: (level: number) => void;
  onState?: (state: InputMonitorState) => void;
};
function browserContext() {
  const host = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Constructor = host.AudioContext ?? host.webkitAudioContext;
  if (!Constructor) throw new Error("Microphone meter is unavailable.");
  return new Constructor();
}
/** Call directly from the tap handler, before getUserMedia or other awaited work. */
export function createInputMonitor(
  options: Options,
  createContext: () => AudioContext = browserContext,
): InputMonitor {
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let frame: number | null = null;
  let closed = false;
  const state = () => {
    if (!closed) options.onState?.(context?.state ?? "unavailable");
  };
  const resumeFromGesture = (): Promise<void> => {
    if (!context || closed || context.state === "closed")
      return Promise.resolve();
    // Invoke resume synchronously. Awaiting permission or IndexedDB first loses Safari's gesture.
    let pending: Promise<void>;
    try {
      pending =
        context.state === "suspended" ? context.resume() : Promise.resolve();
    } catch {
      state();
      return Promise.resolve();
    }
    state();
    return pending.then(state, state);
  };
  try {
    context = createContext();
    context.addEventListener("statechange", state);
    void resumeFromGesture();
  } catch {
    options.onState?.("unavailable");
  }
  return {
    resumeFromGesture,
    attach(stream) {
      if (!context || closed) return;
      if (frame !== null) cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      // Never connect to destination: a microphone check must not echo through speakers.
      const samples = new Uint8Array(analyser.fftSize);
      let lastUpdate = -Infinity;
      const update = (now: number) => {
        if (closed || !analyser) return;
        if (now - lastUpdate >= 80) {
          analyser.getByteTimeDomainData(samples);
          let peak = 0;
          for (const sample of samples)
            peak = Math.max(peak, Math.abs(sample - 128));
          options.onLevel(
            context?.state === "running"
              ? Math.min(100, Math.round((peak / 64) * 100))
              : 0,
          );
          lastUpdate = now;
        }
        frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    },
    close() {
      if (closed) return;
      closed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      context?.removeEventListener("statechange", state);
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
      options.onLevel(0);
    },
  };
}

/** Best effort only. A mobile OS can terminate before the last fragment reaches IndexedDB. */
export function flushAndStopRecorder(recorder: MediaRecorder | null): void {
  if (!recorder || recorder.state === "inactive") return;
  try {
    recorder.requestData();
  } catch {
    /* stop still asks for the final data event */
  }
  try {
    recorder.stop();
  } catch {
    /* the browser may already have stopped capture */
  }
}
