/**
 * Non-destructive local collection migration. Stop all writers to the source first.
 * node --import tsx scripts/migrate-local-data.ts --from /old/store --to .data/live-preview --source-quiescent
 */
import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
type Entry = { relative: string; bytes: number; sha256: string };
export type MigrationOptions = {
  source: string;
  destination: string;
  sourceQuiescent: boolean;
  repository?: string;
};

function isWithin(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function futureRealPath(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(await futureRealPath(parent), path.basename(file));
  }
}
async function inventory(root: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      if (name === ".storage-migration.json") continue;
      if (name === ".migration-incomplete")
        throw new Error(
          "The source is an incomplete migration and cannot be used.",
        );
      if (name.endsWith(".lock") || name.endsWith(".tmp"))
        throw new Error(
          "The source has a lock or unfinished write. Stop every writer before retrying.",
        );
      const file = path.join(directory, name);
      const info = await lstat(file);
      if (info.isSymbolicLink())
        throw new Error(
          "The source contains a symbolic link. Resolve it before migrating private data.",
        );
      if (info.isDirectory()) await visit(file);
      else if (info.isFile())
        entries.push({
          relative: path.relative(root, file),
          bytes: info.size,
          sha256: await fileHash(file),
        });
      else
        throw new Error(
          "The source contains a file type this migration does not support.",
        );
    }
  }
  await visit(root);
  return entries.sort((a, b) => a.relative.localeCompare(b.relative));
}

/** Copies only. Does not restart servers, change environment files, or delete originals. */
export async function migrateLocalData(options: MigrationOptions) {
  if (!options.sourceQuiescent)
    throw new Error(
      "Stop every writer to the source, then pass --source-quiescent. A quiet moment between requests is not enough.",
    );
  const repository = await realpath(
    path.resolve(options.repository || process.cwd()),
  );
  const source = await realpath(path.resolve(options.source));
  const destination = await futureRealPath(path.resolve(options.destination));
  const privateRoot = path.join(repository, ".data");
  if (!isWithin(privateRoot, destination))
    throw new Error(
      "Choose a new destination inside this repository's gitignored .data directory.",
    );
  if (
    source === destination ||
    isWithin(source, destination) ||
    isWithin(destination, source)
  )
    throw new Error("Source and destination must be separate directories.");
  try {
    await exec(
      "git",
      [
        "check-ignore",
        "--quiet",
        "--",
        path.join(destination, "private-data-probe"),
      ],
      { cwd: repository },
    );
  } catch {
    throw new Error(
      "The destination is not ignored by Git. Refusing to copy private data.",
    );
  }
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const actualParent = await realpath(path.dirname(destination));
  const actualPrivateRoot = await realpath(privateRoot);
  if (
    actualPrivateRoot !== privateRoot ||
    (actualParent !== privateRoot && !isWithin(privateRoot, actualParent))
  )
    throw new Error(
      "The destination's parent must not redirect outside the private data directory.",
    );
  const before = await inventory(source);
  if (!before.length)
    throw new Error("The source has no saved data to migrate.");
  // Exclusive directory creation is the reservation. Never overwrite or merge an existing store.
  try {
    await mkdir(destination, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "The destination already exists. Choose a new directory; existing data is never overwritten.",
      );
    throw error;
  }
  const incomplete = path.join(destination, ".migration-incomplete");
  await writeFile(
    incomplete,
    "Do not use this directory until migration verification completes.\n",
    { mode: 0o600, flag: "wx" },
  );
  let rewrittenMediaRecords = 0;
  let cloudMediaReferences = 0;
  const outputEntries: Entry[] = [];
  try {
    for (const entry of before) {
      const sourceFile = path.join(source, entry.relative);
      const destinationFile = path.join(destination, entry.relative);
      await mkdir(path.dirname(destinationFile), {
        recursive: true,
        mode: 0o700,
      });
      let replacement: string | undefined;
      if (entry.relative.endsWith(".json")) {
        const original = await readFile(sourceFile, "utf8");
        const record = JSON.parse(original);
        if (
          path.basename(entry.relative).startsWith("media-") &&
          record.localPath
        ) {
          const oldMedia = await realpath(path.resolve(record.localPath));
          if (!isWithin(source, oldMedia))
            throw new Error(
              "A recording points outside the source store. Include it deliberately before migrating.",
            );
          const relativeMedia = path.relative(source, oldMedia);
          const mediaEntry = before.find(
            (item) => item.relative === relativeMedia,
          );
          if (
            !mediaEntry ||
            (typeof record.bytes === "number" &&
              record.bytes !== mediaEntry.bytes)
          )
            throw new Error(
              "A recording reference is missing or its size does not match. The source was not changed.",
            );
          record.localPath = path.join(destination, relativeMedia);
          replacement = JSON.stringify(record);
          rewrittenMediaRecords += 1;
        } else if (
          path.basename(entry.relative).startsWith("media-") &&
          record.url
        )
          cloudMediaReferences += 1;
      }
      if (replacement !== undefined)
        await writeFile(destinationFile, replacement, {
          flag: "wx",
          mode: 0o600,
        });
      else {
        await copyFile(sourceFile, destinationFile, constants.COPYFILE_EXCL);
        await chmod(destinationFile, 0o600);
      }
      const outputHash = await fileHash(destinationFile);
      if (replacement === undefined && outputHash !== entry.sha256)
        throw new Error(
          "A copied file did not match the source snapshot. Keep using the original store.",
        );
      outputEntries.push({
        relative: entry.relative,
        bytes: (await stat(destinationFile)).size,
        sha256: outputHash,
      });
    }
    const after = await inventory(source);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error(
        "The source changed during migration. This copy is incomplete; keep using the original store and retry after stopping all writers.",
      );
    for (const entry of outputEntries) {
      const destinationFile = path.join(destination, entry.relative);
      if ((await fileHash(destinationFile)) !== entry.sha256)
        throw new Error(
          "Destination verification failed. Keep using the original store.",
        );
      if (
        path.basename(entry.relative).startsWith("media-") &&
        entry.relative.endsWith(".json")
      ) {
        const media = JSON.parse(await readFile(destinationFile, "utf8"));
        if (media.localPath) await stat(media.localPath);
      }
    }
    await writeFile(
      path.join(destination, ".storage-migration.json"),
      JSON.stringify(
        {
          recordType: "local-storage-migration",
          schemaVersion: 1,
          completedAt: new Date().toISOString(),
          source,
          destination,
          files: outputEntries,
          rewrittenMediaRecords,
          cloudMediaReferences,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await unlink(incomplete);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : "Migration failed."} The destination retains a .migration-incomplete marker and must not be used. Originals are untouched.`,
    );
  }
  return {
    destination,
    files: outputEntries.length,
    bytes: outputEntries.reduce((sum, item) => sum + item.bytes, 0),
    rewrittenMediaRecords,
    cloudMediaReferences,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index < 0 ? "" : args[index + 1] || "";
  };
  const source = value("--from");
  const destination = value("--to");
  if (!source || !destination)
    throw new Error(
      "Usage: node --import tsx scripts/migrate-local-data.ts --from SOURCE --to .data/NEW-STORE --source-quiescent",
    );
  const result = await migrateLocalData({
    source,
    destination,
    sourceQuiescent: args.includes("--source-quiescent"),
  });
  console.log(
    `Verified ${result.files} files (${result.bytes} bytes), including ${result.rewrittenMediaRecords} local recording references.`,
  );
  console.log(`New private store: ${result.destination}`);
  console.log(
    "Originals are unchanged. Point only the intended server's COLLECTION_DATA_DIR to this directory before starting it again.",
  );
  if (result.cloudMediaReferences)
    console.log(
      "Remote media URLs were preserved, but cloud media bytes were not downloaded or backed up.",
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration failed.");
    process.exitCode = 1;
  });
}
