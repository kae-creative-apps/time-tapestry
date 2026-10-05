import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia, renderStill} from '@remotion/renderer';

const output = resolve('video/output/joining-hands-v3');
await mkdir(output, {recursive: true});
const serveUrl = await bundle({entryPoint: resolve('video/brand/joining-hands-v3/entry.tsx')});
const [composition] = await getCompositions(serveUrl, {logLevel: 'error'});
for (const frame of [15, 35, 51, 62, 80, 95, 155]) {
  await renderStill({serveUrl, composition, frame, output: `${output}/frame-${frame}.png`, scale: .75, logLevel: 'error'});
}
if (!process.argv.includes('--stills')) {
  await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: `${output}/Time-Tapestry-Joining-Hands-v3.mp4`, concurrency: 2, crf: 16, overwrite: false, logLevel: 'error'});
}
console.log(`Rendered ${output}`);
