# Woven Time Tapestry logo, HyperFrames v1

A native paused GSAP composition at 1920 by 1080, 30 fps, ten seconds. Silent, with the approved icon and wordmark. This motion study does not replace the deployed film closer.

The shared `../scene.mjs`, `../motion.mjs`, and `../artwork.mjs` are the source of truth for both this version and Remotion. `build.mjs` writes a final-state SVG into the HTML, initializes each attribute once, and creates the synchronous timeline `window.__timelines['time-tapestry-woven-logo']`. It preserves explicit tween calls so HyperFrames can inspect every keyframe.

The local GSAP and Quicksand assets are copied from `video/hyperframes/assets`. No remote script, font, or media request is needed during playback or render. No package install is needed to rebuild the HTML.

## Rebuild and check

Run from this directory:

```sh
npm run build
npm run check
npx --yes hyperframes@0.8.65 keyframes --json
```

The generated HTML should never be edited by hand. Rebuild after a shared scene or motion change.

## Preview and export

```sh
npx --yes hyperframes@0.8.65 preview --background --port 3230
npx --yes hyperframes@0.8.65 preview --status
npx --yes hyperframes@0.8.65 render --fps 30 --quality high --workers 1 --output renders/time-tapestry-woven-logo-v1.mp4
```

The Studio uses the actual preview address printed by the CLI and the `#project/hyperframes` route. Keep rendering at one worker on this machine.

## Validation performed

The strict combined check uses `check --json --at 0,0.2,1,2.5,4.5,5.7,6.9,8.5,9.9 --strict`. This checks lint, runtime loading, layout, and contrast in one browser session. The loose threads intentionally enter from beyond the canvas, so `mark-camera` carries `data-layout-allow-overflow`; logo geometry and text stay within the composition.

`check-seeks.mjs` compares every animated attribute with the Remotion `motionValue` function at 16 forward and reverse seeks, including repeated returns to zero. All 224 attribute comparisons pass. This catches repeated-opacity initialization errors that a normal forward-only export could hide.

```sh
node check-seeks.mjs /absolute/path/to/puppeteer-core/lib/puppeteer/puppeteer-core.js /absolute/path/to/chrome-headless-shell
```

Supply the installed tool paths on the current machine. This uses an existing browser, never downloads a second one. Reports are saved under ignored `.hyperframes/`.

The CLI's `keyframes` report identifies all 15 animation cues. The legacy skill's separate `animation-map.mjs` could not load its unpublished `@hyperframes/producer` dependency, so the native CLI map and deterministic browser seek report are used instead. The final 7.55 to 10 second hold is intentional.

The native HyperFrames version was also exported at high quality with one worker: 10 seconds, 1920x1080, 30fps, silent H.264. The final frame was visually compared with the Remotion export. Both hashes are saved in the parent preview receipt.
