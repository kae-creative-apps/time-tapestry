/** One level per fixed-duration audio window, starting at source time zero.
 * sampleRate is envelope windows per second, not the PCM sample rate. */
export type AudioEnvelope = {
  sampleRate: number;
  levels: number[];
};

/** Read on the audio's source timeline. Missing audio and times outside the
 * measured range are silent; do not extend the last sound into the closer. */
export function audioEnvelopeLevel(
  envelope: AudioEnvelope | undefined,
  timeMs: number,
): number {
  if (
    !envelope ||
    !Number.isFinite(timeMs) ||
    timeMs < 0 ||
    !Number.isFinite(envelope.sampleRate) ||
    envelope.sampleRate <= 0
  )
    return 0;
  const index = Math.floor((timeMs * envelope.sampleRate) / 1000);
  const level = envelope.levels[index];
  return Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}
