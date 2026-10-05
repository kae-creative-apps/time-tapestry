import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia, renderStill} from '@remotion/renderer';

const output = resolve('video/output/passing-stitch-v2');
await mkdir(output, {recursive: true});
const serveUrl = await bundle({entryPoint: resolve('video/brand/passing-stitch-v2/entry.tsx')});
const [composition] = await getCompositions(serveUrl, {logLevel: 'error'});
for (const frame of [20, 39, 53, 64, 80, 114, 160]) {
  await renderStill({serveUrl, composition, frame, output: `${output}/frame-${frame}.png`, scale: .75, logLevel: 'error'});
}
await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: `${output}/Time-Tapestry-Passing-Stitch-v2.mp4`, concurrency: 2, crf: 16, overwrite: false, logLevel: 'error'});
await writeFile(`${output}/render.json`, JSON.stringify({composition: composition.id, width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationInFrames, silent: true}, null, 2));
console.log(`Rendered ${output}/Time-Tapestry-Passing-Stitch-v2.mp4`);
