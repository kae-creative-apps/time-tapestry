// Reveals move through the approved silhouette. The geometry never changes.
export const DURATION = 6.5;
export const FPS = 30;
const clamp = (n) => Math.min(1, Math.max(0, n));
export const progress = (time, start, duration) => {
  const p = clamp((time - start) / duration);
  return p * p * (3 - 2 * p);
};
export const lerp = (a, b, p) => a + (b - a) * p;

export function pose(time) {
  const settle = progress(time, 2.7, 1.0);
  const scale = lerp(.96, .65, settle);
  return {
    scale,
    x: 960 - 230 * scale,
    y: lerp(232, 154, settle),
    firstStem: progress(time, .18, .85),
    firstLeft: progress(time, .45, .48),
    firstGive: progress(time, .8, 1.03),
    receive: progress(time, 1.48, .77),
    secondTop: progress(time, 1.86, .47),
    secondFoot: progress(time, 2.06, .64),
    wordmark: progress(time, 3.02, .72),
    tagline: progress(time, 3.7, .6),
  };
}
