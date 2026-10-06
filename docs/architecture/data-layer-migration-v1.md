# Data layer and pipeline diagnostics

The new `src/lib/db` adapter is a typed compatibility layer over the existing collection store. It is not a physical SQL migration. The same Redis lease and ownership-checked Lua commit, or local exclusive file lock, remains the write authority. No production data or credentials have been changed.

## Using the adapter

Authorize the caller through the existing account, owner, recipient or organization services before calling the adapter. The adapter does not accept bearer links or grant access. Its returned rows are persistence models, not public API responses. Continue using role-specific views when returning information to a browser. Provider side effects, consent checks and invitation workflows remain in their existing services.

`createCollectionDatabaseAdapter()` exposes typed stories, chapters, takes, recipients and printOrders repositories, `getStoriesByOrg`, `getPostcardStatus` and `atomicUpdate`. Reads use the saved aggregate. Writes change only their owned fields inside `mutateCollection`. The optimistic revision is a SHA-256 of the complete aggregate, so changes through existing routes also invalidate stale revisions. An expected revision conflict fails before changing storage. Keep provider and network operations outside atomic callbacks.

Chapter and print order IDs are scoped by story. The same `q1` ID belongs to many stories. A selected take is unique per question, including followups such as `q1-f1`, not per chapter. Source media stays immutable and private. URL projections are existing authenticated media routes; they do not reveal storage credentials or private Blob URLs. Chapter transcript projections contain current chapter text and source take IDs. Verified word timestamps remain in the existing source transcription cache and are not fabricated from chapter text.

The primary recipient owns physical delivery. Additional recipients have digital access only. Removing an additional recipient revokes access and suppresses pending notifications while retaining reply attribution. Changing a recipient email requires the existing recipient service. Submitted print orders and their dispatch evidence cannot be deleted or rescheduled through this adapter. Print status reports the latest stored event; historical event timestamps and expected delivery are unavailable unless a provider saved them. They are returned as absent, not guessed.

Story deletion is a limited soft archive of an unused aggregate. Existing collection services do not yet interpret database tombstones, so an active story cannot be deleted here. A full retention workflow must stop jobs, suppress deliveries, apply policy to originals and update every legacy reader before active-story archival is introduced.

## Physical relational migration

1. Provision the chosen relational database and encrypted production connection using the deployment secret manager. A database provider is not selected or silently provisioned by this compatibility implementation.
2. Add a relational adapter implementing the same interface. Use foreign keys and indexes for story membership, organization, chapter, recipient and provider job identifiers. Give stories a revision for optimistic writes and perform chapter, take and selection changes in one transaction with a story row lock or conditional revision update.
3. Create the requested five entity tables plus the necessary supporting records: organizations and grants, verified account memberships, original media, interview sessions/turns/segments, per-question selections, proof versions and print consent, film and preparation jobs, notifications/outbox, delivery attempts and webhook deduplication. Preserve other aggregate fields in a versioned JSON column until explicitly migrated. The five-table example alone cannot preserve this application.
4. Preserve identity. Chapter IDs need a composite story key or a surrogate with a unique `(story_id, legacy_chapter_id)` constraint. Selected takes need a unique `(story_id, question_id)` selection, not one selected take per chapter. Backfill organization binding from existing gift claims. Do not infer verified user ownership from unverified contact email.
5. Stop all web, scheduled and worker writers before the first cutover. Take a verified private backup. Existing local backup scripts require explicit source quiescence and refuse cloud-only originals, so a cloud migration also needs a private Blob backup and a Redis snapshot/export.
6. Import in transactions with a migration manifest containing IDs, counts, source hashes and checkpoints. Keep original media locations and hashes unchanged. Copy dispatch bodies, provider IDs, lease state, idempotency keys, retry deadlines, consent/proof history and webhook deduplication records exactly. Never resend a job during migration to discover its state.
7. Verify row counts and hashes, every media reference, selections, account/recipient privacy, organization binding, pending dispatch recovery and restored worker leases. Run the complete regression suite against the new adapter. Switch web and worker configuration together. Retain the original snapshot for rollback, and keep it read-only.
8. Do not dual-write opportunistically. An online migration requires a transactional outbox/change log and reconciliation before switching reads. A failed second write must not be reported as a successful replicated write.

The current organization lookup still scans collections. The adapter creates a clean seam but does not claim relational query performance while KV remains the physical store. Legacy `src/lib/session.ts` is a separate store with an unsafe read/update/write cycle and in-memory fallback; it must be migrated or retired independently.

## Pipeline diagnostics

The logger uses a stable, namespaced hash of the story ID as the trace ID, so a queue or restarted worker can reconstruct the same trace without reading a secret. Events include stage, outcome, provider, timing and safe identifiers. They never include request bodies, transcripts, notes, addresses, email content, cookies, private media URLs or access keys. Server error diagnostics retain the exception type and full redacted stack frames, including a cause, while dropping free-form messages that can contain private provider payloads. Client error responses contain a friendly message and the trace ID.

`withPipelineStage` does not retry or change provider behavior. Delivery leases, idempotency keys, suppression rules and retry windows remain authoritative. Deployment log retention and a centralized log destination are operational configuration, not created by this code. Never use unbounded transcript or provider response logging to add diagnostic detail.

## Validation

The new tests cover concurrent take writes, optimistic conflicts with legacy writers, rollback, foreign media rejection, per-question selections, legacy organization binding, private dispatch projection, recipient revocation, stable traces, redaction and lifecycle outcomes. Existing collection, delivery, account and recording regression tests remain required before deployment. Production database and provider connectivity are not verified by local tests.
