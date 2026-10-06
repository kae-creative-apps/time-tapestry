# Interview submission repair, 2026-10-05

Finishing a saved live interview no longer requires a browser transcript in every story area. The app saves original media and pending words, accepts a durable preparation job, and opens an owner-only completion page. Final story and postcard approval remains separate.

## Failure verified

A completed provider conversation included questions and answers for all four areas, but its theme-tracking tool only updated the first. Provider tool results can also arrive on the following transcript row. This produced incorrect area attribution. A customer screenshot separately showed a saved video and a disabled submission action reporting all four areas missing. The precise production persistence or recording-join state was not inspected locally.

## Recovery and completion

- Recovery verifies the configured agent, collection, saved session, conversation ID, and plausible call start before joining provider words to the saved recording.
- Confirmed tool results and narrow planned opening questions establish story areas. Biographical answer keywords never decide an area.
- Existing raw words, recording boundaries, exclusions, IDs and source media remain intact. Provider arrival times are explicitly unaligned; later source transcription determines video cuts.
- A brief answer remains an answer. No missing-part recording fallback is shown after a completed live interview. A genuinely missing area is named and continues through the conversation.
- Durable jobs use source snapshots, leases, idempotent submission, recovery checkpoints, cached drafts and retry handling. Accepted submission does not claim rendering has finished.
- The ready notification is queued when all four original films attach. Delivery rechecks the current job, four matching outputs, written stories and private storage. No preparation step approves sharing or releases printing.
- Conversation instructions omit self-introduction and spoken performance labels, use first-name address, and require theme updates. Original storyteller transcripts are not scrubbed. The existing hosted voice and access settings are preserved.

## Validation

- 433 automated checks passed, including source recovery, saved-media acceptance, missing-area handling, duplicate submissions, interrupted workers, retries, source changes and notification readiness.
- TypeScript and optimized Next.js build passed.
- Browser rehearsal used a fictional saved-video collection with no client turns, no provider connection and email/printing disabled. Reopening the recording page exposed Finish interview without a new call. Finish opened the completion page and confirmed a persisted queued job.
- Completion and four-area progress layouts were checked at the normal desktop viewport and 390 x 844. No horizontal overflow or clipped story-area labels were observed.
- Production submission, final rendered clips and actual email delivery still require release verification.

## Release requirements

Both the website and Railway worker must run this repair. Hosted worker preflight now requires its existing shared ELEVENLABS_AGENT_ID in addition to its current account key. Gloo drafting is optional; without it the existing source-text drafting path remains available. Keep mail and printing credentials on the website.

The committed delivery scheduler runs daily at 09:00 UTC. Readiness queues the email automatically, but this repository alone does not establish a faster external scheduler. Do not claim instant email delivery without verifying the production scheduler.
