import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/for-organizations/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/about/page.tsx",
  "src/components/marketing/PostcardCollection.tsx",
  "src/components/marketing/InterviewPreview.tsx",
  "src/components/marketing/FrontDoorNav.tsx",
  "src/components/Footer.tsx",
];

const source = files
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

test("public marketing speaks to organizations and donor legacy", () => {
  assert.match(source, /Bring Time Tapestry to your donors/);
  assert.match(source, /Start a pilot/);
  assert.match(source, /What made you become so generous/);
  assert.match(source, /Roots of generosity/);
  assert.match(source, /Lives I’ve seen flourish/);
  assert.match(source, /For Sammie, her granddaughter/);
  assert.match(source, /openGraph/);
  assert.doesNotMatch(source, /Share my story/);
  assert.doesNotMatch(source, /Give them the stories/);
  assert.doesNotMatch(source, /group gifting/i);
  assert.doesNotMatch(source, /\$\d|\bdollar\b|\bmoney\b|\bamount\b/i);
});
