import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {wovenSvg} from '../scene.mjs';
import {DURATION, FPS, MOTION} from '../motion.mjs';

const here = new URL('./', import.meta.url);
await mkdir(new URL('assets/', here), {recursive: true});
for (const name of ['gsap.min.js', 'quicksand-latin.woff2']) {
  await copyFile(new URL(`../../../hyperframes/assets/${name}`, here), new URL(`assets/${name}`, here));
}

// Loose yarn begins beyond the canvas before the mark pulls into its lockup.
const artwork = wovenSvg(DURATION).replace('id="mark-camera"', 'id="mark-camera" data-layout-allow-overflow');
const tweenCalls = MOTION.map(cue => `timeline.fromTo(${JSON.stringify('#' + cue.id)}, ${JSON.stringify({attr: {[cue.attr]: cue.from}})}, ${JSON.stringify({attr: {[cue.attr]: cue.to}, duration: cue.duration, ease: cue.ease, immediateRender: false, overwrite: 'auto'})}, ${cue.start});`).join('\n');

// Keep the hero frame as the HTML ground truth. Set only the first state for
// each attribute, then let the paused, synchronous GSAP timeline own movement.
const script = `
const motion = ${JSON.stringify(MOTION, null, 2)};
const initialised = new Set();
for (const cue of motion) {
  const key = cue.id + ':' + cue.attr;
  if (!initialised.has(key)) {
    const element = document.getElementById(cue.id);
    if (!element) throw new Error('Missing woven logo target: ' + cue.id);
    element.setAttribute(cue.attr, cue.from);
    initialised.add(key);
  }
}
const timeline = gsap.timeline({paused: true});
${tweenCalls}
window.__timelines = window.__timelines || {};
window.__timelines['time-tapestry-woven-logo'] = timeline;
timeline.seek(0);
`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Time Tapestry | Woven logo study v1</title>
  <style>
    @font-face { font-family: Quicksand; src: url('assets/quicksand-latin.woff2') format('woff2'); font-style: normal; font-weight: 300 700; font-display: block; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #fbfaf8; }
    [data-composition-id="time-tapestry-woven-logo"] { width: 1920px; height: 1080px; overflow: hidden; }
    .scene-content { display: flex; width: 100%; height: 100%; padding: 0; align-items: center; justify-content: center; }
    .scene-content > svg { display: block; flex: 0 0 auto; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="woven-logo" class="clip" data-composition-id="time-tapestry-woven-logo" data-start="0" data-duration="${DURATION}" data-width="1920" data-height="1080" data-fps="${FPS}" data-track-index="0">
    <div class="scene-content">${artwork}</div>
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>${script}</script>
</body>
</html>
`;
await writeFile(new URL('index.html', here), html);
console.log(`Generated ${fileURLToPath(new URL('index.html', here))} from shared artwork and ${MOTION.length} cues.`);
