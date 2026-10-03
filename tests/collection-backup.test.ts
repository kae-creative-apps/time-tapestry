import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import {
  backupCollections,
  restoreCollectionsBackup,
  verifyCollectionBackup,
} from "../scripts/backup-collections";
const exec = promisify(execFile);
async function fixture() {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "tapestry-backup-")),
  );
  const repository = path.join(root, "repo"),
    source = path.join(root, "source");
  await mkdir(repository);
  await mkdir(path.join(source, "media"), { recursive: true });
  await exec("git", ["init", "--quiet", repository]);
  await writeFile(path.join(repository, ".gitignore"), ".data/\n");
  const bytes = Buffer.alloc(1024 * 1024 + 3, 17);
  await writeFile(path.join(source, "media", "recording"), bytes);
  await writeFile(
    path.join(source, "media-recording.json"),
    JSON.stringify({
      id: "recording",
      collectionId: "collection-fixture",
      bytes: bytes.length,
      localPath: path.join(source, "media", "recording"),
    }),
  );
  await writeFile(
    path.join(source, "collection-fixture.json"),
    JSON.stringify({
      schemaVersion: 2,
      ownerKey: "private-recovery-key",
      storyteller: { name: "Fixture", email: "fixture@example.test" },
      chapters: [{ title: "Faith", content: "A synthetic story" }],
    }),
  );
  return {
    root,
    repository,
    source,
    destination: path.join(root, "external-snapshot"),
    sourceQuiescent: true,
    bytes,
  };
}
test("offline backup and restore drill preserves original bytes, metadata and private recovery keys", async () => {
  const options = await fixture();
  try {
    await backupCollections(options);
    assert.equal((await verifyCollectionBackup(options.destination)).files, 3);
    const restored = path.join(options.repository, ".data", "restored");
    await restoreCollectionsBackup({
      ...options,
      source: options.destination,
      destination: restored,
    });
    const media = JSON.parse(
      await readFile(path.join(restored, "media-recording.json"), "utf8"),
    );
    assert.equal(media.localPath, path.join(restored, "media", "recording"));
    assert.deepEqual(await readFile(media.localPath), options.bytes);
    assert.deepEqual(
      await readFile(path.join(options.source, "media", "recording")),
      options.bytes,
    );
    const original = await readFile(
      path.join(options.source, "collection-fixture.json"),
      "utf8",
    );
    assert.equal(
      await readFile(path.join(restored, "collection-fixture.json"), "utf8"),
      original,
    );
    assert.equal((await stat(media.localPath)).mode & 0o777, 0o600);
    await assert.rejects(backupCollections(options), /already exists/);
    await writeFile(
      path.join(options.destination, "media", "recording"),
      "corrupted",
    );
    await assert.rejects(
      verifyCollectionBackup(options.destination),
      /SHA-256|size check/,
    );
    await assert.rejects(
      restoreCollectionsBackup({
        ...options,
        source: options.destination,
        destination: path.join(options.repository, ".data", "bad-restore"),
      }),
      /SHA-256|size check/,
    );
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});
test("backups refuse active writers, environment files and unbacked cloud media", async () => {
  const options = await fixture();
  try {
    await assert.rejects(
      backupCollections({ ...options, sourceQuiescent: false }),
      /Stop every/,
    );
    await writeFile(path.join(options.source, "active.lock"), "busy");
    await assert.rejects(backupCollections(options), /unfinished write/);
    await rm(path.join(options.source, "active.lock"));
    await writeFile(
      path.join(options.source, ".env.local"),
      "FIXTURE_SECRET=private",
    );
    await assert.rejects(backupCollections(options), /environment-secret/);
    await rm(path.join(options.source, ".env.local"));
    await writeFile(
      path.join(options.source, "media-cloud.json"),
      JSON.stringify({
        url: "https://fixture.private.blob.vercel-storage.com/original",
        bytes: 10,
      }),
    );
    await assert.rejects(backupCollections(options), /cloud recordings/);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});
test("backup manifest detects unverified added files and refuses tracked external paths", async () => {
  const options = await fixture();
  try {
    await assert.rejects(
      backupCollections({
        ...options,
        destination: path.join(options.repository, "tracked-output"),
      }),
      /not ignored/,
    );
    await backupCollections(options);
    await writeFile(path.join(options.destination, "extra.json"), "{}");
    await assert.rejects(
      verifyCollectionBackup(options.destination),
      /extra file/,
    );
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});
