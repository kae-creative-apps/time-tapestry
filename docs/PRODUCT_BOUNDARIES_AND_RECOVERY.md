# Time Tapestry pilot rules and recovery

Updated October 3, 2026. These describe the current implementation, not a promise of permanent hosting.

## A simple family journey

1. The homepage offers three cached samples of the configured interviewer's voice. They do not request microphone access, save a recording, or create a paid live session.
2. A person starts or requests a free story. Contact information is saved, and the storyteller receives a private return link. A private link is an access credential, not an account login.
3. The storyteller can speak, record video, or type. Pause, finish, microphone and camera controls remain labeled. The app saves smaller recording segments and queues transcript updates. The original files are preserved separately from corrected words.
4. After finishing, the storyteller checks the transcript, saves corrections, and prepares four written stories. New answers make existing drafts out of date. Corrections that have not been saved block the next step.
5. Original audio and video are the preferred source for the family gift. The owner can review the recordings beside each written story. Live interview files are complete recording segments, not automatically verified chapter cuts. A reviewed finished original video can be attached through the existing edit workflow. Four automatically cut original films are not ready in this version.
6. AI narration is an optional alternative. They review the complete written stories before asking for four narrated films. Each generated film uses the configured AI interviewer's voice, approved story text, readable captions, brand motion and the HyperFrames closing animation. The films identify AI narration. They do not impersonate the storyteller or claim to be an automatic, verified edit of their original footage.
7. They review the finished films, then approve the collection. AI film approval is tied to the exact output hash. Changing the written script invalidates the old AI film link, while preserving the file for recovery.
8. Digital sharing does not require a postal address. A clearly chosen written-only path is available. Postcards are a separate choice after address confirmation. Four mailings are scheduled for months 0, 3, 6 and 9. A scheduled record is not proof a card was mailed.
9. All four approved stories are available together on the recipient page. The QR code opens that private collection. The recipient can send a written or recorded reply. Delivery and email require their providers and job processing to be configured.

## Returning, time and capacity

- Unapproved drafts have no automatic expiration in this pilot. People can return using their private link while the service and storage remain available. Do not promise 'forever'.
- A live connection lasts up to 45 minutes. This is a session boundary, not a lifetime story limit. The person can pause and return. A later visit starts a fresh timeline when needed and keeps earlier answers.
- A collection permits 100 conversation records by default, configurable by the operator. A conversation also has safety limits on transcript size and segments. These prevent malformed or automated requests from growing records without bound.
- Contact details, transcripts, story text and other collection metadata have a combined 8 MiB limit by default, configurable through `COLLECTION_METADATA_LIMIT_BYTES`. An over-limit update is rejected before replacing saved work. Existing records remain readable.
- The default total media allowance is 2 GiB per collection, configurable through `COLLECTION_STORAGE_LIMIT_BYTES`. An individual upload is limited to 512 MiB. The app warns at 80% and reserves space atomically before uploading, so concurrent uploads cannot overfill the same allowance.
- Individual guided retakes are limited to 10 minutes. Longer live interviews are stored in smaller segments. Finished narrated films must be no longer than one hour each. A script that exceeds the rendering allowance is rejected for explicit editing; it is not silently truncated.
- Three new film versions per collection per day is the default. Identical source and voice settings reuse the existing job. Retries preserve completed work where possible. Provider calls have additional per-collection, per-client and shared daily request budgets.
- Approved collections are frozen in this pilot. This keeps the recipient's stories, QR destination and postcard notes consistent. Continued recording after publication needs a future versioning feature. Do not imply that editing a published collection is available now.

## What is saved where

| Content | Device recovery | Primary application storage | Independent backup |
| --- | --- | --- | --- |
| Recording chunks and pending uploads | Browser IndexedDB on the recording device | Private Vercel Blob when configured; otherwise files under `COLLECTION_DATA_DIR/media` | Operator-created, hash-verified snapshots for local storage. Cloud backup still needs provisioning. |
| Contact details, selected takes, transcript revisions, chapters and delivery state | Draft edits and pending interview commands where supported | Cloud KV when configured; otherwise protected JSON records under `COLLECTION_DATA_DIR` | Included in local snapshots. A cloud database export schedule is not configured by this code alone. |
| Film scripts, voice settings, processing state, source and output hashes | Not dependent on the browser | Durable film job records in the same metadata store; worker workspace holds completed intermediate audio and render files | Snapshot/export the worker workspace as well if intermediate render recovery is required. |
| Final films | Playable/downloadable through authorized endpoints | Private media storage, separate from original recordings | Same backup policy as original recordings. |
| Admin access audit | None | Identifier-only local audit log or bounded cloud audit list | Export audit logs separately if long retention is needed. |

Browser storage is useful recovery, not a guaranteed backup. Clearing site data, private browsing, storage pressure or a lost device can remove it. 'Saved on this device' and 'Uploaded' must not be treated as the same state.

The current local preview uses a temporary folder. It must be migrated during a stopped-server window before a group pilot. Do not copy an active recording directory and call it a complete backup. See `STORAGE_READINESS.md` and `BACKUP_RUNBOOK.md`.

## Team troubleshooting

Open `/admin/collections` and sign in with the private admin credential. The read-only workspace lists current collections, usage, original files, missing uploads, film processing, contacts, email and postcard failures. It supports playback, individual file downloads and a JSON recovery manifest. The manifest does not contain private access keys and is not a substitute for downloading media.

Admin sessions are signed, expire, and use HTTP-only cookies. Query-string admin secrets are rejected. Private reads and downloads are logged. Operators cannot repair a device-only upload from the server; ask the storyteller to return using the same browser and finish the upload or download the device copy.

## Public pilot readiness

Before inviting dozens of families, connect and verify private Blob storage, durable metadata storage, public-site human verification, HTTPS, a private admin credential, an always-running film worker and a separate backup destination. Public writes fail closed when security configuration is missing. Existing authorized reads remain available where storage works.

For planning, 50 collections at the default allowance reserve up to 100 GiB of primary media capacity before any separate backup. Actual usage depends on recording bitrate and film length. Test concurrent uploads and restore a synthetic collection before onboarding the group.

Terabyte-scale media is a storage architecture target, not a verified capacity claim. Before that scale, replace scan-based metadata listing with indexed database queries, use a durable distributed job queue, add object lifecycle and separate backup retention, stream exports, set account-level storage and spend alerts, and test restoration and concurrent processing under load.
