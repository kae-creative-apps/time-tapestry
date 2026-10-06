export const DURATION = 6.5;
export const FPS = 60;
const clamp = (n) => Math.min(1, Math.max(0, n));

// Minimum-jerk easing has zero velocity AND acceleration at either end.
// Overlapping channels avoid a stop between the clasp and the final lockup.
export const progress = (time, start, duration) => {
  const p = clamp((time - start) / duration);
  return p * p * p * (10 + p * (-15 + 6 * p));
};
export const lerp = (a, b, p) => a + (b - a) * p;

export function pose(time) {
  const approach = progress(time, .12, 1.45);
  const reach = progress(time, .68, .92);
  const join = progress(time, 1.57, 1.85);
  const settle = progress(time, 2.35, 1.5);
  const scale = lerp(.90, .65, settle);
  return {
    x: 960 - 230 * scale,
    y: lerp(220, 154, settle),
    scale,
    visible: progress(time, .02, .34),
    firstX: lerp(lerp(-74, -50, approach), 0, join),
    firstY: lerp(lerp(-14, -8, approach), 0, join),
    secondX: lerp(lerp(74, 50, approach), 0, join),
    secondY: lerp(lerp(14, 8, approach), 0, join),
    reach: reach * (1 - join),
    // Separate the crossing only once the hands have met and overlap.
    seam: progress(time, 2, .45) * (1 - progress(time, 3.04, .38)),
    wordmark: progress(time, 3.1, .75),
    tagline: progress(time, 3.5, .85),
  };
}
