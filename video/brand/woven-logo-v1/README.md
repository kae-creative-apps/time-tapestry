# Woven Time Tapestry logo, v1

A silent 10-second 1920x1080 motion study. Fine yarn follows the approved icon contours, interlaces, then the camera settles into the complete logo and tagline.

This preview does not replace the deployed four-second film closer. Its timing is deliberately longer so the material can be reviewed.

## Source

- `artwork.mjs`: unchanged outline geometry copied from the approved v39 icon and stacked wordmark.
- `scene.mjs`: shared SVG textile material and scene layout.
- `motion.mjs`: deterministic timing, shared by both engines.
- `WovenLogo.tsx` and `entry.tsx`: Remotion composition.
- `hyperframes/`: native GSAP composition and regeneration/check scripts.

The archived v39 assets under `docs/handoff/brand/kit-v39` are the source. The animation does not use the simplified app icon. Wordmark letters are artwork, not a substitute font. Only the tagline uses the bundled Quicksand font.

## Remotion preview

From the repository root:

```sh
npx remotion studio video/brand/woven-logo-v1/entry.tsx --no-open --port 3226
```

Open `http://localhost:3226/TimeTapestryWovenLogo`.

## Export

```sh
npx remotion render video/brand/woven-logo-v1/entry.tsx TimeTapestryWovenLogo video/output/woven-logo-v1/Time-Tapestry-Woven-Logo-v1.mp4 --codec h264 --crf 16 --concurrency 2
```

The generated MP4 lives in ignored `video/output/`. Review export: 1920x1080, 30fps, H.264, 10 seconds, no audio. Keep CPU concurrency low on the shared laptop.

## Brand decision

Espresso and walnut threads on warm paper, with small peach highlights. The animation uses no new decorative pattern and avoids a pink-and-green treatment. The four approved native icon shapes constrain every visible strand. The final silhouette remains intact.

## Review copy

[Watch the exported animation in Google Drive](https://drive.google.com/file/d/1Hyu9q6tjTdDruA-DSoB_aw4Uagr-XWul/view). This is a private review copy. The file hash is recorded in `preview-receipt.json`.
