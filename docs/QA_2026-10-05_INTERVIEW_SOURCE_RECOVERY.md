# Completed interview source recovery

A completed conversation could remain blocked after the old per-part recording fallback was used. Those later recordings replaced the selected sources and excluded the earlier conversation answers. Correcting chapter labels alone did not restore those inclusion choices.

The completion page now offers an explicit owner choice to use the full saved interview. Restoration requires a completed ElevenLabs session, saved words in all four areas, verified original recordings, an unchanged collection version, and processing consent. Sessions with superseded user answers require a separate source review. Unrelated selected recordings are not silently discarded.

Before restoring the chosen session's inclusion choices, the server saves an immutable private audit of the prior choices and original-media metadata. Every raw turn, original recording, later take, and other session remains saved. The audit is stored separately from collection views and cannot appear in family or public views. Preparation is queued after another locked owner and version check. Final gift approval remains required before sharing or mailing.

Live message handling also rejects missing or invalid provider identifiers as a basis for deduplication or answer replacement. Real identifiers retain resend handling and correction behavior, including event ID zero. Separate callbacks without identifiers remain separate answers.

## Verification

- 455 automated checks pass, including recovery source preservation, immutable backups, owner and stale-version rejection, original-media validation, all-four-area validation, genuine selection conflicts, and runtime message identifier cases.
- The optimized production build passes.
- An independent review found no blocking authorization or public-view privacy issue.
- Browser QA uses a fictional local recording and four excluded fictional answers. It does not call external providers, send email, or order postcards.
- The browser recovery choice reaches “Your interview is saved” and queues preparation. A storage check confirms that all four later takes remain saved and the previous exclusions are preserved in the separate private audit.
- Production release and actual owner source selection must be verified separately. A queued interview is not proof that four finished films or a review email have been delivered.

Readiness queues the review notification only after four current original-recording films are attached. The existing hosted delivery schedule runs daily, so email delivery is not instantaneous.
