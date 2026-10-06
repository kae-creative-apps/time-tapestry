import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {MOTION, motionValue} from '../motion.mjs';

// Supply existing tools without adding a second browser installation to the app.
const modulePath = process.argv[2];
const executablePath = process.argv[3];
if (!modulePath || !executablePath) {
  throw new Error('Usage: node check-seeks.mjs /path/to/puppeteer-core/lib/puppeteer/puppeteer-core.js /path/to/chrome');
}
const {default: puppeteer} = await import(pathToFileURL(modulePath).href);
const browser = await puppeteer.launch({executablePath, headless: true});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1920, height: 1080, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('./index.html', import.meta.url).href);
  await page.evaluate(() => document.fonts.ready);
  const tracks = [...new Map(MOTION.map(cue => [cue.id + ':' + cue.attr, cue])).values()];
  const times = [0, 0.2, 1, 2.5, 4.5, 5.7, 6.9, 8.5, 9.9, 5.1, 0, 7.2, 0.25, 4.9, 10, 0];
  const numeric = value => String(value).match(/-?\d*\.?\d+/g).map(Number);
  const samples = [];
  for (const time of times) {
    const actual = await page.evaluate(({time, tracks}) => {
      const timeline = window.__timelines['time-tapestry-woven-logo'];
      timeline.seek(time);
      return tracks.map(cue => ({
        id: cue.id, attr: cue.attr,
        value: document.getElementById(cue.id).getAttribute(cue.attr),
      }));
    }, {time, tracks});
    for (const state of actual) {
      const expected = numeric(motionValue(state.id, state.attr, time));
      const observed = numeric(state.value);
      assert.equal(observed.length, expected.length, `${state.id}:${state.attr} shape at ${time}s`);
      expected.forEach((value, index) => assert.ok(Math.abs(value - observed[index]) < 0.002,
        `${state.id}:${state.attr} at ${time}s: expected ${value}, observed ${observed[index]}`));
    }
    samples.push({time, attributesChecked: actual.length});
  }
  assert.deepEqual(errors, []);
  const report = {ok: true, samples, attributeAssertions: samples.length * tracks.length,
    cueCount: MOTION.length,
    choreography: MOTION.map(({id, attr, start, duration, ease}) => ({id, attr, start, end: start + duration, ease})),
    intentionalHold: {start: Math.max(...MOTION.map(cue => cue.start + cue.duration)), end: 10},
    note: 'Forward and reverse seeks match the shared Remotion motionValue function.'};
  await mkdir(new URL('./.hyperframes/', import.meta.url), {recursive: true});
  await writeFile(new URL('./.hyperframes/seek-check.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
