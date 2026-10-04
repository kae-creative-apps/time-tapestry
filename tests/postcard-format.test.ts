import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferPostcardFormat,
  postcardArtworkFormat,
} from "../src/lib/collection/postcard-format";

test("historical unmarked proofs retain 4 x 6 canvas and trim dimensions", () => {
  const html =
    "<!doctype html><html><head><style>body{width:6.25in;height:4.25in}</style></head><body><p>Saved proof</p></body></html>";
  const format = inferPostcardFormat(html);
  assert.deepEqual(format, { size: "4x6", width: 600, height: 408, bleed: 12 });
  assert.equal(format.width - 2 * format.bleed, 6 * 96);
  assert.equal(format.height - 2 * format.bleed, 4 * 96);
  assert.equal(postcardArtworkFormat({ front: html, back: html }).size, "4x6");
});

test("new 6 x 9 proofs use their marked size with the same physical bleed", () => {
  const front = '<html><body data-postcard-size="6x9">Front</body></html>';
  const back = "<html><body data-postcard-size='6x9'>Back</body></html>";
  const format = postcardArtworkFormat({ front, back });
  assert.deepEqual(format, { size: "6x9", width: 888, height: 600, bleed: 12 });
  assert.equal(format.width - 2 * format.bleed, 9 * 96);
  assert.equal(format.height - 2 * format.bleed, 6 * 96);
});

test("explicit 4 x 6 is compatible with historical unmarked artwork", () => {
  const front = '<body data-postcard-size="4x6">Front</body>';
  const back = "<body>Historical back</body>";
  assert.equal(postcardArtworkFormat({ front, back }).size, "4x6");
});

test("size inference uses the body marker instead of postcard text", () => {
  const html =
    '<body><p>data-postcard-size="6x9"</p><div data-postcard-size="6x9"></div></body>';
  assert.equal(inferPostcardFormat(html).size, "4x6");
  assert.equal(
    inferPostcardFormat("<body title='data-postcard-size=6x9'>").size,
    "4x6",
  );
  assert.equal(
    inferPostcardFormat('<body title="Print > preview" data-postcard-size=6x9>')
      .size,
    "6x9",
  );
});

test("delivery format rejects unsupported and mixed front/back sizes", () => {
  for (const unsupported of ["5x7", "6x11", "", "6X9"])
    assert.throws(
      () =>
        postcardArtworkFormat({
          front: `<body data-postcard-size="${unsupported}">`,
          back: '<body data-postcard-size="6x9">',
        }),
      /unsupported print size/,
    );
  for (const back of ["<body>", '<body data-postcard-size="4x6">'])
    assert.throws(
      () =>
        postcardArtworkFormat({
          front: '<body data-postcard-size="6x9">',
          back,
        }),
      /different print sizes/,
    );
});

test("ambiguous or malformed size markers cannot become historical defaults", () => {
  for (const html of [
    '<body data-postcard-size="4x6" data-postcard-size="6x9">',
    "<body data-postcard-size>",
  ])
    assert.throws(() => inferPostcardFormat(html), /invalid print size marker/);
});
