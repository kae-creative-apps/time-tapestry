# Joining hands, smoother v4

Review revision, October 5, 2026. Same joining-hands direction and exact approved v39 finishing artwork; refined speed and flow.

## Reference lock

The primary reference is the existing Time Tapestry mark and Tayloe's joining-hands concept. Preserve espresso ink, paper background, original contours, outlined wordmark, and the passing-down gesture. Refero's Luffu reference supports generous negative space and a restrained family-brand presentation; Headspace supports readable, rounded flat shapes. Neither supplies a motion curve. The timing decisions below follow the observed v3 stops and Refero's motion guidance on continuity and easing. No borrowed colors, photos, bounce, new effects, or music.

- [Luffu style reference](https://luffu.com), Refero style f626ba8e-4f98-463e-90ab-04b32fe5c6fb.
- [Headspace style reference](https://headspace.com), Refero style c73224da-e583-4833-bf39-3f414c317474.

## Changes

- Reduce opening travel and overlap the appearance with the approach.
- Remove the half-second frozen contact. The ends slow naturally into contact, then continue into the stitch.
- Lengthen interlacing from 1.05 to 1.85 seconds.
- Begin the final scale and position change during interlacing, rather than after a full stop.
- Use minimum-jerk easing with continuous acceleration at phase boundaries.
- Delay and soften the paper seam until after the hands touch.
- Overlap the wordmark and tagline fades with the settling movement.
- Preview at 60fps. Finish in 6.5 seconds with more than two seconds on the complete identity.

## Preview

```sh
npx remotion studio video/brand/joining-hands-v4/entry.tsx --no-open --port 3226
```

Open `http://localhost:3226/TimeTapestryJoiningHandsSmooth`. The previous v3 is also registered for comparison. This is a review revision, not a replacement for the production film closer. The v3 source and exported review remain intact.

## Verification

TypeScript passed. All 390 frames have finite geometry without reach or seam overshoot. The finished SVG raster is pixel-identical to v3's approved-artwork hold. The peak horizontal interlace speed decreased from 71.4 to 50.7 native units per second; peak scale speed decreased from 0.483 to 0.3125 per second. The seam remains absent at contact. Contact and crossing frames were inspected in Studio with no error overlay.
