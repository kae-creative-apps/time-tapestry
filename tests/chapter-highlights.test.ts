import assert from "node:assert/strict";
import test from "node:test";
import {
  chapterMoments,
  filmCaptionCues,
  momentClock,
} from "../src/lib/collection/chapter-highlights";

test("source captions land on the film after the title", () => {
  const cues = filmCaptionCues({
    durationSeconds: 10,
    sourceRanges: [
      {
        inMs: 1000,
        outMs: 4000,
        captions: [
          { text: "I remember the winter coat on the porch.", startMs: 1500, endMs: 3200 },
        ],
      },
    ],
  });
  assert.equal(cues.length, 1);
  assert.equal(cues[0].startMs, 3500);
});

test("three moments are verbatim pieces of the recording", () => {
  const source = [
    "One winter morning she left a coat on the porch.",
    "That was the first time I understood generosity.",
    "You do not have to be rich to be generous.",
  ];
  const moments = chapterMoments({
    content: source.join(" "),
    postcardNote: source.join(" "),
    generatedWith: "source_text",
    film: {
      durationSeconds: 16,
      sourceRanges: [
        {
          inMs: 0,
          outMs: 9000,
          captions: source.map((text, index) => ({
            text,
            startMs: index * 3000,
            endMs: index * 3000 + 2000,
          })),
        },
      ],
    },
  });
  assert.equal(moments.length, 3);
  for (const moment of moments) {
    assert.equal(source.includes(moment.quote), true);
    assert.equal(typeof moment.startMs, "number");
  }
  assert.ok((moments[0].startMs || 0) < (moments[2].startMs || 0));
});

test("um is cleaned without adding words", () => {
  const moments = chapterMoments({
    content: "Um I remember the winter coat on the porch that morning.",
    generatedWith: "source_text",
    film: {
      durationSeconds: 10,
      sourceRanges: [
        {
          inMs: 0,
          outMs: 3000,
          captions: [
            {
              text: "Um I remember the winter coat on the porch that morning.",
              startMs: 200,
              endMs: 2400,
            },
          ],
        },
      ],
    },
  });
  assert.equal(
    moments[0]?.quote,
    "I remember the winter coat on the porch that morning.",
  );
});

test("a shaped postcard line can be a moment when the film has no captions", () => {
  const moments = chapterMoments({
    content:
      "We pulled up another chair at the supper table. Mama said the table was long enough. I still set that place.",
    postcardNote: "Mama said the table was long enough.",
    generatedWith: "gloo",
  });
  assert.equal(
    moments.some((moment) => moment.quote === "Mama said the table was long enough."),
    true,
  );
  assert.equal(moments.length <= 3, true);
});

test("caption fragments become one verbatim sentence", () => {
  const moments = chapterMoments({
    content:
      "Um, oh, when somebody paid for our meal on our honeymoon, um, and it was like $100.",
    generatedWith: "source_text",
    film: {
      durationSeconds: 12,
      sourceRanges: [
        {
          inMs: 0,
          outMs: 5000,
          captions: [
            { text: "What? Snappy.", startMs: 100, endMs: 400 },
            {
              text: "Um, oh, when somebody paid for our meal on our honeymoon,",
              startMs: 800,
              endMs: 2400,
            },
            { text: "um, and it was like $100.", startMs: 2500, endMs: 4000 },
          ],
        },
      ],
    },
  });
  assert.equal(
    moments.some(
      (moment) =>
        moment.quote ===
        "When somebody paid for our meal on our honeymoon, and it was like $100.",
    ),
    true,
  );
  assert.equal(
    moments.some((moment) => /snappy/i.test(moment.quote)),
    false,
  );
  assert.equal(typeof moments[0]?.startMs, "number");
});

test("time chips use minutes and seconds", () => {
  assert.equal(momentClock(12500), "0:13");
  assert.equal(momentClock(65000), "1:05");
});
