/** Offline private backup/restore. Does not run against active writers or contact cloud providers. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  readFile,
  writeFile,
  stat,
  realpath,
  readdir,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { migrateLocalData, type MigrationOptions } from "./migrate-local-data";

type Manifest = {
  files: Array<{ relative: string; bytes: number; sha256: string }>;
  cloudMediaReferences: number;
};
async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function refuseRemoteOnlyMedia(source: string) {
  for (const name of await readdir(source)) {
    if (!/^media-[\w-]+\.json$/.test(name)) continue;
    const record = JSON.parse(await readFile(path.join(source, name), "utf8"));
    if (record.url && !record.localPath)
      throw new Error(
        "This store references cloud recordings. A complete cloud export is required; this local utility will not report those files as backed up.",
      );
  }
}
export async function verifyCollectionBackup(source: string) {
  const root = await realpath(source);
  for (const marker of [".migration-incomplete", ".backup-incomplete"]) {
    try {
      await stat(path.join(root, marker));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error("This backup is incomplete and cannot be restored.");
  }
  const manifestBytes = await readFile(
    path.join(root, ".storage-migration.json"),
  );
  const marker = JSON.parse(
    await readFile(path.join(root, ".backup-complete.json"), "utf8"),
  );
  if (
    createHash("sha256").update(manifestBytes).digest("hex") !==
    marker.manifestSha256
  )
    throw new Error("The backup manifest changed after verification.");
  const manifest = JSON.parse(manifestBytes.toString()) as Manifest;
  if (manifest.cloudMediaReferences || !Array.isArray(manifest.files))
    throw new Error("This is not a complete local backup.");
  const expected = new Set(manifest.files.map((item) => item.relative));
  async function inspect(directory: string) {
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name),
        info = await lstat(file);
      if (info.isSymbolicLink())
        throw new Error("Backup symlinks are not allowed.");
      if (info.isDirectory()) await inspect(file);
      else if (
        ![".storage-migration.json", ".backup-complete.json"].includes(
          path.relative(root, file),
        ) &&
        !expected.has(path.relative(root, file))
      )
        throw new Error("The backup contains an unverified extra file.");
    }
  }
  await inspect(root);
  for (const entry of manifest.files) {
    const file = path.resolve(root, entry.relative),
      relative = path.relative(root, file);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Invalid backup manifest path.");
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== entry.bytes ||
      (await hashFile(file)) !== entry.sha256
    )
      throw new Error(
        "A backup file failed its SHA-256 or size check. Do not restore it.",
      );
  }
  return {
    files: manifest.files.length,
    bytes: manifest.files.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}
export async function backupCollections(options: MigrationOptions) {
  if (!options.sourceQuiescent)
    throw new Error(
      "Stop every source writer and pass --source-quiescent before backing up.",
    );
  await refuseRemoteOnlyMedia(options.source);
  const result = await migrateLocalData({
    ...options,
    allowExternalDestination: true,
  });
  if (result.cloudMediaReferences) {
    await writeFile(
      path.join(result.destination, ".backup-incomplete"),
      "Cloud media was not included.\n",
      { mode: 0o600, flag: "wx" },
    );
    throw new Error(
      "Cloud media bytes were not backed up. This snapshot is incomplete.",
    );
  }
  const manifest = await readFile(
    path.join(result.destination, ".storage-migration.json"),
  );
  await writeFile(
    path.join(result.destination, ".backup-complete.json"),
    JSON.stringify({
      recordType: "collection-backup",
      schemaVersion: 1,
      completedAt: new Date().toISOString(),
      manifestSha256: createHash("sha256").update(manifest).digest("hex"),
    }),
    { mode: 0o600, flag: "wx" },
  );
  await verifyCollectionBackup(result.destination);
  return result;
}
export async function restoreCollectionsBackup(options: MigrationOptions) {
  if (!options.sourceQuiescent)
    throw new Error(
      "Stop every source writer and pass --source-quiescent before restoring.",
    );
  await verifyCollectionBackup(options.source);
  return migrateLocalData(options);
}
async function main() {
  const args = process.argv.slice(2),
    value = (flag: string) => {
      const index = args.indexOf(flag);
      return index < 0 ? "" : args[index + 1] || "";
    };
  const source = value("--from");
  if (!source)
    throw new Error(
      "Use --from SOURCE --source-quiescent. Add --to NEW-DESTINATION or --restore --to .data/NEW-STORE.",
    );
  if (args.includes("--verify")) {
    const result = await verifyCollectionBackup(source);
    console.log(
      `Verified ${result.files} private files (${result.bytes} bytes). No source was changed.`,
    );
    return;
  }
  const restoring = args.includes("--restore");
  const destination =
    value("--to") ||
    (!restoring
      ? path.join(
          process.env.COLLECTION_BACKUP_DIR ||
            path.join(process.cwd(), ".data", "backups"),
          new Date().toISOString().replace(/[:.]/g, "-"),
        )
      : "");
  if (!destination)
    throw new Error("Restore requires a new --to .data/NEW-STORE destination.");
  const result = await (
    restoring ? restoreCollectionsBackup : backupCollections
  )({
    source,
    destination,
    sourceQuiescent: args.includes("--source-quiescent"),
  });
  console.log(
    `Verified ${result.files} private files (${result.bytes} bytes). Originals are unchanged. No server was started or reconfigured.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error(
      "Backup or restore did not complete. Check the source/destination, quiescence requirement, complete-backup marker and private runbook. No source data was deleted.",
    );
    process.exitCode = 1;
  });
}
