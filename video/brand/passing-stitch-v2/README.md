# Passing the stitch, v2

A silent 6.5-second logo study made with Remotion. The first t forms, passes the movement through the approved central stitch into the second, and settles into the original wordmark and “Stories woven together.”

[Watch the review copy in Drive](https://drive.google.com/file/d/1InRlP28spgHQXrQWWN3EbMkq8vYtZKk0/view).

Read `DESIGN.md` for the brand reasoning and Refero reference boundaries. This is a new review version and does not change the website, existing story-film closer, ElevenLabs settings, or other provider connections.

## Preview

Run from the repository root:

```sh
npx remotion studio video/brand/passing-stitch-v2/entry.tsx --no-open --port 3226
```

Open `http://localhost:3226/TimeTapestryPassingStitch`. Press Play to review the complete gesture.

## Render

```sh
node video/brand/passing-stitch-v2/render.mjs
```

The render script exports seven inspection frames and a 1920x1080, 30fps H.264 MP4 into ignored `video/output/passing-stitch-v2/`. It refuses to overwrite an existing MP4. Keep earlier approved exports and create a new version for changes.

## Verification

- All four mark paths match the approved v39 SVG paths exactly. Wordmark outlines are unchanged.
- Completed paths bypass their reveal masks, preserving the original edges.
- Seven intermediate and final frames were visually reviewed. A small receiving-stem mask leak found in the first render was corrected before the review export.
- The Remotion Studio preview loads and plays without an error overlay.
- ffprobe confirms 1920x1080, 30fps, 6.5 seconds, H.264, with no audio track.
- The source and export hashes are recorded in `preview-receipt.json`.

Production integration and a shorter film-closing cut should follow selection of the motion direction. This study is not represented as a deployed change.
