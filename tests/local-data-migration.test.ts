import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { migrateLocalData } from "../scripts/migrate-local-data";

const exec = promisify(execFile);
async function fixture() {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "tapestry-migration-test-")),
  );
  const repository = path.join(root, "repo");
  const source = path.join(root, "original");
  await mkdir(repository);
  await mkdir(path.join(source, "media"), { recursive: true });
  await exec("git", ["init", "--quiet", repository]);
  await writeFile(path.join(repository, ".gitignore"), ".data/\n");
  await writeFile(
    path.join(source, "media", "recording"),
    "synthetic recording bytes",
  );
  await writeFile(
    path.join(source, "media-recording.json"),
    JSON.stringify({
      id: "recording",
      bytes: 25,
      localPath: path.join(source, "media", "recording"),
    }),
  );
  await writeFile(
    path.join(source, "story.json"),
    JSON.stringify({
      schemaVersion: 2,
      id: "synthetic-story",
      storyteller: { name: "Example Person", email: "person@example.com" },
      chapters: [],
    }),
  );
  await writeFile(
    path.join(source, "org-example.json"),
    JSON.stringify({
      recordType: "organization-gifting",
      schemaVersion: 1,
      organizationName: "Example Church",
    }),
  );
  return {
    root,
    repository,
    source,
    destination: path.join(repository, ".data", "new-store"),
    sourceQuiescent: true,
  };
}

test("migration preserves originals, rewrites copied media references, and supports another snapshot", async () => {
  const options = await fixture();
  try {
    const originalRecord = await readFile(
      path.join(options.source, "media-recording.json"),
      "utf8",
    );
    const result = await migrateLocalData(options);
    assert.equal(result.files, 4);
    assert.equal(result.rewrittenMediaRecords, 1);
    assert.equal(
      await readFile(path.join(options.source, "media-recording.json"), "utf8"),
      originalRecord,
    );
    const rewritten = JSON.parse(
      await readFile(
        path.join(options.destination, "media-recording.json"),
        "utf8",
      ),
    );
    assert.equal(
      rewritten.localPath,
      path.join(options.destination, "media", "recording"),
    );
    assert.equal(
      await readFile(rewritten.localPath, "utf8"),
      "synthetic recording bytes",
    );
    assert.equal(
      await readFile(path.join(options.source, "story.json"), "utf8"),
      await readFile(path.join(options.destination, "story.json"), "utf8"),
    );
    assert.equal(
      await readFile(path.join(options.source, "org-example.json"), "utf8"),
      await readFile(
        path.join(options.destination, "org-example.json"),
        "utf8",
      ),
    );
    assert.equal((await stat(rewritten.localPath)).mode & 0o777, 0o600);
    await assert.rejects(
      stat(path.join(options.destination, ".migration-incomplete")),
      { code: "ENOENT" },
    );
    const second = await migrateLocalData({
      ...options,
      source: options.destination,
      destination: path.join(options.repository, ".data", "second-store"),
    });
    assert.equal(second.files, 4);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("migration refuses an unpaused source, active locks, and existing destinations", async () => {
  const options = await fixture();
  try {
    await assert.rejects(
      migrateLocalData({ ...options, sourceQuiescent: false }),
      /Stop every writer/,
    );
    await writeFile(path.join(options.source, "active.lock"), "busy");
    await assert.rejects(migrateLocalData(options), /unfinished write/);
    await rm(path.join(options.source, "active.lock"));
    await mkdir(options.destination, { recursive: true });
    await writeFile(path.join(options.destination, "keep.txt"), "unchanged");
    await assert.rejects(
      migrateLocalData(options),
      /destination already exists/,
    );
    assert.equal(
      await readFile(path.join(options.destination, "keep.txt"), "utf8"),
      "unchanged",
    );
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("migration refuses a tracked destination and does not silently omit missing recordings", async () => {
  const options = await fixture();
  try {
    await writeFile(path.join(options.repository, ".gitignore"), "");
    await assert.rejects(migrateLocalData(options), /not ignored by Git/);
    await writeFile(path.join(options.repository, ".gitignore"), ".data/\n");
    await rm(path.join(options.source, "media", "recording"));
    await assert.rejects(migrateLocalData(options), /incomplete/);
    assert.ok(
      await stat(path.join(options.destination, ".migration-incomplete")),
    );
    assert.ok(await stat(path.join(options.source, "media-recording.json")));
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});
