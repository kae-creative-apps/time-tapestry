import assert from "node:assert/strict";
import { after, test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomaticFilmPanel } from "../src/components/collection/AutomaticFilmPanel";
import type { PortalFilmJob } from "../src/components/collection/film-status";
import { publicView } from "../src/lib/collection/access";
import { syntheticFilmCollection } from "./film-fixture";

// tsx reads Next's preserve JSX setting as the classic runtime in Node tests.
const testGlobals = globalThis as typeof globalThis & { React?: typeof React };
const previousReact = testGlobals.React;
testGlobals.React = React;
after(() => {
  if (previousReact) testGlobals.React = previousReact;
  else Reflect.deleteProperty(testGlobals, "React");
});

function panel(job: PortalFilmJob) {
  return renderToStaticMarkup(
    createElement(AutomaticFilmPanel, {
      collection: publicView(syntheticFilmCollection(), "owner"),
      accessKey: "synthetic-owner-key",
      disabled: false,
      onWorkingChange: () => {},
      job,
      available: true,
      hasSources: true,
      checking: false,
      error: "",
      onError: () => {},
      onRefresh: () => {},
      onJobAccepted: () => {},
    }),
  );
}
const failed: PortalFilmJob = {
  id: "synthetic-film",
  status: "failed",
  mode: "original",
  preparation: "automatic",
  chapters: [],
};
test("a blocked or unknown retry is not presented as an available action", () => {
  for (const job of [
    failed,
    {
      ...failed,
      retryAllowed: false,
      retryBlockedReason: "The saved word timing needs an editor check.",
      attempts: 1,
    },
    {
      ...failed,
      retryAllowed: false,
      retryBlockedReason:
        "This job needs an operator check after three attempts.",
      attempts: 3,
    },
  ]) {
    const html = panel(job);
    assert.doesNotMatch(html, /Try preparing my films again|You can retry/);
    assert.match(html, /check/);
  }
});
test("a server-confirmed recoverable failure keeps the retry action", () => {
  const html = panel({ ...failed, retryAllowed: true, attempts: 1 });
  assert.match(html, /Try preparing my films again/);
  assert.match(html, /You can retry/);
});
