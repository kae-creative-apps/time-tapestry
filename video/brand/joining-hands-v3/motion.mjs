export const DURATION = 7;
export const FPS = 30;
const clamp = (n) => Math.min(1, Math.max(0, n));
export const progress = (time, start, duration) => {
  const p = clamp((time - start) / duration);
  return p * p * (3 - 2 * p);
};
export const lerp = (a, b, p) => a + (b - a) * p;

export function pose(time) {
  const approach = progress(time, .55, 1.05);
  const reach = progress(time, 1.05, .65);
  const join = progress(time, 2.2, 1.05);
  const settle = progress(time, 3.25, .9);
  const scale = lerp(.94, .65, settle);
  return {
    x: 960 - 230 * scale,
    y: lerp(230, 154, settle),
    scale,
    visible: progress(time, .05, .4),
    firstX: lerp(lerp(-90, -50, approach), 0, join),
    firstY: lerp(lerp(-18, -8, approach), 0, join),
    secondX: lerp(lerp(90, 50, approach), 0, join),
    secondY: lerp(lerp(18, 8, approach), 0, join),
    reach: reach * (1 - join),
    seam: progress(time, 1.65, .12) * (1 - progress(time, 3.04, .21)),
    wordmark: progress(time, 3.55, .7),
    tagline: progress(time, 4.2, .55),
  };
}
