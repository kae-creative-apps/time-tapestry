export type ConnectionCue = {
  finished: Promise<void>;
  dispose: () => void;
};

const RESUME_DEADLINE_MS = 80;
const LIFETIME_LIMIT_MS = 520;

/** Call directly from Start/Continue so audio is unlocked by the user gesture. */
export function startConnectionCue(): ConnectionCue {
  let context: AudioContext | undefined;
  let disposed = false;
  let resumeDeadline: ReturnType<typeof setTimeout> | undefined;
  let lifetimeLimit: ReturnType<typeof setTimeout> | undefined;
  const oscillators: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(resumeDeadline);
    clearTimeout(lifetimeLimit);

    for (const oscillator of oscillators) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        // A tone may already have ended or may not have started.
      }
      try {
        oscillator.disconnect();
      } catch {
        // Continue cleaning up the rest of the graph.
      }
    }
    for (const gain of gains) {
      try {
        gain.disconnect();
      } catch {
        // Completion must not depend on browser cleanup behavior.
      }
    }
    if (context) {
      context.onstatechange = null;
      try {
        // Closing can remain pending. The graph is already silent/disconnected.
        void Promise.resolve(context.close()).catch(() => undefined);
      } catch {
        // A closed or unsupported context must not hold up recording.
      }
    }
    resolveFinished();
  };

  try {
    const AudioContextClass =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ||
          (
            window as Window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
    if (!AudioContextClass) {
      dispose();
      return { finished, dispose };
    }

    context = new AudioContextClass();
    const cueContext = context;
    resumeDeadline = setTimeout(dispose, RESUME_DEADLINE_MS);
    lifetimeLimit = setTimeout(dispose, LIFETIME_LIMIT_MS);

    // Invoke resume before returning, while the original user gesture is active.
    void Promise.resolve(cueContext.resume())
      .then(() => {
        if (disposed) return;
        clearTimeout(resumeDeadline);
        if (cueContext.state !== "running") {
          dispose();
          return;
        }

        cueContext.onstatechange = () => {
          if (cueContext.state !== "running") dispose();
        };

        let ended = 0;
        const now = cueContext.currentTime;
        const notes = [
          { frequency: 349.23, start: 0.008, end: 0.18 },
          { frequency: 440, start: 0.2, end: 0.42 },
        ];

        for (const note of notes) {
          const oscillator = cueContext.createOscillator();
          oscillators.push(oscillator);
          const gain = cueContext.createGain();
          gains.push(gain);
          oscillator.type = "sine";
          oscillator.frequency.value = note.frequency;
          gain.gain.setValueAtTime(0, now + note.start);
          gain.gain.linearRampToValueAtTime(0.024, now + note.start + 0.035);
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + note.end - 0.015,
          );
          gain.gain.linearRampToValueAtTime(0, now + note.end);
          oscillator.connect(gain);
          gain.connect(cueContext.destination);
          oscillator.onended = () => {
            ended += 1;
            if (ended === notes.length) dispose();
          };
          oscillator.start(now + note.start);
          oscillator.stop(now + note.end);
        }
      })
      .catch(dispose);
  } catch {
    dispose();
  }

  return { finished, dispose };
}
