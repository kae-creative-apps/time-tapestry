# Private collection backup and restore

The backup utility is implemented and tested with synthetic data. It has not copied the active preview's private records. Port 3109 was using /private/tmp/time-tapestry-live-preview when inspected. Confirm the actual process environment before an operation. Do not stop or migrate 3107/3108 or change their data roots.

GitHub contains application code. It does not contain private contacts, collection keys, transcripts, stories, original recordings, generated films, or backup snapshots. The .data directory is ignored by Git. A backup is sensitive because it includes the private keys needed to restore access. Store it on encrypted storage with restricted operator access.

## Local snapshots

Stop every writer to the chosen source, including the web server, film worker, cron/delivery runner and scripts. Prevent new requests. A quiet moment between requests does not establish consistency. The tool requires --source-quiescent as the operator's acknowledgement and independently rejects locks, unfinished writes, source changes during copying and missing originals.

After a planned stop, run from the application repository:

```sh
node --import tsx scripts/backup-collections.ts \
  --from /private/tmp/time-tapestry-live-preview \
  --to .data/backups/2026-10-03-before-migration \
  --source-quiescent
```

Omitting --to creates a new timestamped directory under .data/backups. COLLECTION_BACKUP_DIR can name an external private backup parent. An explicit --to can also point to an encrypted external volume. Existing directories are never overwritten or merged. Destinations inside any Git repository must be ignored. A snapshot on the same laptop is a recovery copy, not protection against losing that laptop.

The utility copies originals using filesystem streaming/copy operations, hashes every file with SHA-256, compares source inventories before and after, verifies the destination, and rewrites copied media references to their new location. Records retain private recovery keys and contact/story content. It does not copy environment files or print private content. Completed snapshots contain .storage-migration.json and .backup-complete.json. An incomplete marker means do not use the copy.

Verify an existing snapshot without starting a server:

```sh
node --import tsx scripts/backup-collections.ts \
  --from .data/backups/2026-10-03-before-migration --verify
```

The manifest detects accidental corruption, missing files, extra files and size changes. It is not an authenticated defense against someone who can rewrite the snapshot and both manifests. Protect the destination and keep a separately controlled copy.

## Restore drill

Use a new destination, leaving both original and snapshot untouched:

```sh
node --import tsx scripts/backup-collections.ts \
  --restore \
  --from .data/backups/2026-10-03-before-migration \
  --to .data/restored-drill-2026-10-03 \
  --source-quiescent
```

The tool first verifies the completed backup, then copies and rewrites recording references. It does not edit environment files or start a server. For an operator drill, point an isolated local server at the restored directory, keep delivery and provider execution disabled, and check a collection's contacts, written stories, transcript, original recording playback and generated films. Do not run delivery automation against a restored duplicate. Switch the intended live server only after the drill succeeds and with all writers stopped.

Automated tests perform this drill using synthetic metadata and a recording larger than 1 MiB, compare original/restored bytes and recovery keys, and reject corruption, incomplete sources, active locks, environment files and tracked destinations. No live private data is used by tests.

## Cloud and scale boundary

Independent cloud backup is not configured. KV durability and private Blob storage are primary storage, not a verified independent backup. The local utility refuses to claim completion when local records reference cloud-only media that it has not copied.

Before production testing: configure primary KV plus private object storage, choose a separately controlled encrypted backup destination, export all collection/organization/job metadata and every referenced original/film object, record per-object size and SHA-256, and test restoration into isolated storage. Cloud export must coordinate a database snapshot or pause writers so metadata and object references agree. A future scheduled export needs its own alerting for failures and missing objects. No scheduler or off-device backup was created by this implementation.

For a dozens-of-families pilot, an operator should take and verify a snapshot after each planned testing window, retain earlier verified copies, and complete a restore drill before collecting irreplaceable recordings. For eventual terabytes, use object-store versioning and lifecycle policies plus an indexed metadata database, incremental independent backups, monitored queues and a documented recovery-time target. Retention, restoration cost and provider capacity need explicit operational decisions before that scale.
