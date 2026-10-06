type InterviewAudioControls = {
  setVolume: (options: { volume: number }) => void;
  setMicMuted: (muted: boolean) => void;
};

/** A delayed SDK startup must close itself after its attempt was cancelled. */
export function acceptInterviewConnection(
  conversation: { endSession: () => Promise<void> },
  current: boolean,
): boolean {
  if (current) return true;
  void conversation.endSession().catch(() => {});
  return false;
}

/** A new SDK conversation must restore output separately from microphone mute. */
export function restoreInterviewAudio(
  conversation: InterviewAudioControls,
  microphoneMuted: boolean,
) {
  conversation.setVolume({ volume: 1 });
  conversation.setMicMuted(microphoneMuted);
}

type PlaybackElement = Pick<
  HTMLAudioElement,
  "style" | "srcObject" | "muted" | "volume" | "play"
>;

export type InterviewPlayback = {
  play: () => Promise<void>;
  dispose: () => void;
};

/**
 * ElevenLabs appends hidden media-stream audio elements for both transports.
 * Its WebRTC adapter does not expose autoplay rejection through onError.
 * Scope playback to elements added by this connection, preserving original
 * recording players already on the page and ignoring other visible players.
 */
export function createInterviewPlayback({
  audioElements = () => Array.from(document.querySelectorAll("audio")),
  onBlocked,
}: {
  audioElements?: () => PlaybackElement[];
  onBlocked: (blocked: boolean) => void;
}): InterviewPlayback {
  const previous = new Set(audioElements());
  let active = true;
  let generation = 0;
  return {
    async play() {
      if (!active) return;
      const attempt = ++generation;
      const outputs = audioElements().filter(
        (element) =>
          !previous.has(element) &&
          element.style.display === "none" &&
          Boolean(element.srcObject),
      );
      if (!outputs.length) return;
      // Call play before any await so the recovery button keeps user activation.
      const results = await Promise.allSettled(
        outputs.map((element) => {
          element.muted = false;
          element.volume = 1;
          try {
            return element.play();
          } catch (cause) {
            return Promise.reject(cause);
          }
        }),
      );
      if (active && attempt === generation)
        onBlocked(results.some((result) => result.status === "rejected"));
    },
    dispose() {
      active = false;
      generation += 1;
    },
  };
}
