# Local and production storage

The application stores organization contacts and gift status alongside collection records. Collection records contain contact details, written stories and references to recordings. Local audio/video files live in the store's `media/` directory. Browser IndexedDB offers additional recording recovery, but it is not a substitute for the server copy.

## Current local preview

The active port 3109 preview was started with `COLLECTION_DATA_DIR=/private/tmp/time-tapestry-live-preview`. Its data persists across requests, but a temporary directory is not a suitable permanent home for family recordings. Files were changing during the storage audit, so no migration, copy or server restart was performed.

Move this preview to `.data/live-preview` only when its users have finished recording and its server has been stopped. Port 3107 and port 3108 have separate stores and must not be switched or restarted as part of this migration.

From the source repository, after stopping every writer to the port 3109 store:

```sh
node --import tsx scripts/migrate-local-data.ts \
  --from /private/tmp/time-tapestry-live-preview \
  --to .data/live-preview \
  --source-quiescent
```

The script creates a new directory and refuses to merge with or overwrite an existing destination. It copies records and media, rewrites only local media path references, checks file hashes and media sizes, and verifies that the source did not change. It requires a destination under this repository's Git-ignored `.data/` directory. It does not change environment files, restart a server, send data to a provider or delete originals.

`--source-quiescent` is an explicit confirmation that writers have stopped. An absence of lock files at one instant is insufficient. If verification fails, the destination retains `.migration-incomplete` and must not be used. Keep the original store, resolve the cause, and choose a new destination for another attempt.

After successful migration, start only the intended preview with `COLLECTION_DATA_DIR` set to the new absolute directory. Verify that saved stories and videos open before considering any later cleanup. A copy on the same Mac protects against temporary-directory cleanup, but does not protect against loss of the Mac. Arrange a separate encrypted backup of this private directory for longer term use. Never commit private contacts, access links, stories, or recordings to GitHub.

## Production status

The local `.env.local` inspected during this work did not configure `KV_REST_API_URL`, `KV_REST_API_TOKEN` or `BLOB_READ_WRITE_TOKEN`. Deployment environment variables were not inspected, so production configuration remains unverified.

On Vercel, both KV REST variables are required for durable collection and organization records and mutation locks. The storage layer fails closed if either is missing. Recordings require a private Vercel Blob store and `BLOB_READ_WRITE_TOKEN`; local filesystem upload is refused on Vercel. A public Blob store is rejected by the upload completion check.

A GitHub push backs up application code, not these private records or media. Before collecting recordings on a deployed app, verify record persistence across restarts, authorized media playback, access denial with invalid links, and a recovery procedure for both records and media. No cloud storage or backup/recovery test was performed during this local implementation.
