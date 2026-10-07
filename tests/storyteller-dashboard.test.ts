import assert from "node:assert/strict";
import test from "node:test";
import { storytellerTasks } from "../src/lib/collection/storyteller-tasks";

const chapters = ["q1", "q2", "q3", "q4"].map((id) => ({ id }));

test("a missing mailing address is the next step after approval", () => {
  const result = storytellerTasks({
    status: "approved",
    chapters,
    addressConfirmed: false,
    recipientName: "Avery",
    preparation: { ready: true, status: "films_queued" },
  });
  assert.equal(result.current.id, "address");
  assert.equal(
    result.tasks.find((task) => task.id === "ebook")?.state,
    "ready",
  );
  assert.equal(
    result.tasks.find((task) => task.id === "approved")?.state,
    "done",
  );
});

test("a saved address leaves the e-book as the next step", () => {
  const result = storytellerTasks({
    status: "approved",
    chapters,
    addressConfirmed: true,
    recipientName: "Avery",
  });
  assert.equal(result.current.id, "ebook");
  assert.equal(
    result.tasks.find((task) => task.id === "address")?.state,
    "done",
  );
});

test("preparation stays ahead of approval and the address", () => {
  const result = storytellerTasks({
    status: "draft",
    chapters: [],
    addressConfirmed: false,
    recipientName: "Avery",
    preparation: { ready: false, status: "preparing" },
  });
  assert.equal(result.current.id, "prepared");
  assert.equal(
    result.tasks.find((task) => task.id === "address")?.state,
    "upcoming",
  );
  assert.equal(
    result.tasks.find((task) => task.id === "ebook")?.state,
    "upcoming",
  );
});

test("ready stories ask for review before they are approved", () => {
  const result = storytellerTasks({
    status: "draft",
    chapters,
    addressConfirmed: false,
    recipientName: "Avery",
    preparation: { ready: true },
  });
  assert.equal(result.current.id, "approved");
  assert.equal(
    result.tasks.find((task) => task.id === "prepared")?.state,
    "done",
  );
});
