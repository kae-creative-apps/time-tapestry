# Time Tapestry recording-only QA, October 5, 2026

This records the current product decisions and implementation on the working branch. It is not evidence of a public deployment, a real microphone test, a completed hosted render or live postal fulfillment. Final test counts and build results belong in the final verification record after the combined changes are checked.

## Current decisions

- New interview answers are recorded as video with sound or audio only. Typed interview entry and new synthetic story narration are retired. The person listens, records again if needed, keeps the answer and moves on. There is no editable transcript or written-story editor at the end.
- New films use the storyteller's saved recorded voice and, when selected, their recorded video. The AI interviewer still asks questions through ElevenLabs. That does not authorize replacing the storyteller's voice in their films.
- Written chapters may still be generated as a read-only companion to the recordings. They are not an end-of-interview writing task or a new voiceover script. Film approval uses the four current original-recording film hashes in one final approval. The only editable story-message field in this flow is the separate public postcard encouragement.
- Existing stories, source recordings and completed AI-narrated films remain preserved. Unfinished narration jobs become stale and cannot be newly queued, retried or attached through the retired path. Generated films cannot be reused as purported original interview uploads to bypass the recording requirement.
- New collections use four postcards spaced every two weeks: the initial send, then days 14, 28 and 42, subject to approval and delivery readiness. Existing collections without the new cadence retain the older quarterly schedule. Existing proofs and scheduled gifts are not silently converted.
- Time Tapestry is clearly Christian and welcoming. Questions about following Jesus and Scripture are optional. Someone can decline without being asked to defend that choice. Older saved beliefs framing remains supported.
- Previously saved private financial and generosity notes are retained, but their editor is removed from the end-of-interview flow. Notes and generated introductions are not automatic permission to print interview details. The owner still reviews the separate public postcard wording and recipient access.
- Approved collections can be shared digitally with additional verified-email recipients without a five-person product limit. The single primary recipient remains the physical postcard recipient. Each recipient receives their own page personalization and reply history, with a real PDF book download containing the four approved written chapters. See [recipient collection operations](RECIPIENT_COLLECTION.md).

## QA notes and resolution

| QA note or decision | Implemented response | Verification still required |
| --- | --- | --- |
| The faith question is too broad. | The core question now asks about a decision made while following Jesus that later changed the person's life for the better. The prompt respects uncertainty, permits skipping and does not force a positive testimony. | Listen to a real exchange and a refusal. Confirm no repeated probing or assumed outcome. |
| Scripture should fit naturally. | One optional Scripture question can replace a follow-up inside the existing two-follow-up limit. It is not a fifth section or a requirement. The interviewer may not finish a citation or invent a personal quotation. | Test a supplied verse, uncertainty about wording and a declined invitation. |
| Story introductions sound like an outside narrator. | The chapter and introduction prompts require the storyteller's first-person voice, supplied names and supported memories. Generic openings such as “A college barista reflects” are prohibited. | Review actual Gloo output for all four themes. Structural source references are not semantic proof. Existing approved text is not automatically rewritten. |
| Transcript review is crowded with spoken pauses. | The user no longer edits a transcript at the end. Conservative cleanup remains in the generated reading-copy path, preserving meaningful “like,” quoted speech, names, uncertainty and emphasis. Original records remain intact. | Check generated text against real source speech during editorial QA. Confirm no end-user transcript-edit controls remain. |
| It is difficult to review and correct an answer. | Playback replaces the written editor. The person can listen, return to recording, keep the preferred answer and continue. The final collection has one approval using the current film hashes. Manual film editing, finished-video uploads, private-introduction and Scripture editors are removed from the end-user review. | Verify keyboard access, phone layout, rerecord selection and the final atomic approval gate. Earlier recordings must remain saved. |
| Pause/resume can affect the voice experience. | The recording UI includes audio restoration and pause/resume handling changes. No automated test substitutes for browser audio behavior. | Test real microphones, permission state and audible playback after several pauses on the target browsers. |
| Stories should use the person's recording. | New typed-answer and narration write paths are blocked; new films require saved owner recording provenance. Existing completed work is preserved. | Try old links and requests, check clear guidance, then create one audio collection and one video collection through all four finished films. |
| Cards should arrive more often for new gifts. | New collections store a biweekly cadence, while legacy collections retain quarterly behavior. Scheduling, proof identity and delayed-send handling respect the saved cadence. | Run the test-mode schedule with simulated time, retries and delayed first mailing. Confirm no duplicate or compressed batch of cards. |
| Recipients need one private place to watch, read and reply. | The existing email-gated collection is extended with additional digital invitations, personal names and private per-recipient replies. Additional invitations do not create physical mail. | Open the collection as two distinct recipients, verify isolation, watch each film to completion, send a message and confirm the storyteller receives it. |
| The family should be able to keep a printed book. | A private authenticated PDF export provides a branded cover and all four approved chapters, with embedded font, complete pagination and the matched recipient's name. It omits contact information, access keys and private source data. | Download from the deployed site, inspect full text and page breaks, and print a sample. Unsupported glyphs must produce a clear error rather than missing text. |
| The hero should show four distinct cards. | Four chapter-specific cards are restored with the approved pattern. | Confirm motion remains readable on a real phone and with reduced motion. |

## Required end-to-end verification

1. Record with real microphone hardware in the browsers people will use. Check camera and microphone selection, audio-only mode, permissions denied and retried, mute, pause/resume, ending while the interviewer speaks and returning after a connection interruption. Listen to both the live experience and the saved original.
2. Record one consented audio interview and one consented video interview with usable material for all four themes. Listen to each saved answer, record again when needed, keep the chosen version, submit the recordings, then listen to every cut and caption in the four finished films. Approve the exact outputs once and open them through intended-recipient access. Private examples and access links do not belong in the repository.
3. Test declining faith and Scripture questions. Four-film preparation still needs usable recorded material in each theme. Verify that the app offers an appropriate non-faith memory or clearly explains where more recording is needed; do not infer that a skipped theme can produce a complete film.
4. Build the current worker Docker image and run the provider-free container smoke test. Then verify the deployed Railway service configuration, shared Redis and private Blob access, persistent scratch volume, current heartbeat and actual hosted four-film completion with no local worker running. An earlier image or local render does not verify this commit in Railway.
5. Confirm the hosted website and worker use the intended shared storage, public origin, account and secrets. Verify sign-in email, owner/recipient separation, guarded provider usage and original-media recovery without exposing credentials.
6. Keep Lob in test mode and physical delivery disabled for this verification. Exercise the correct new and legacy timelines, authenticated recurring job, signed webhooks, retries, correct QR destination and recipient-only access. This code change does not enable live mail.
7. Check the four hero cards, recording playback and rerecord controls, story collection navigation and postcard preview on desktop and a real phone. Verify contrast, readable controls and the absence of nested scroll traps.
8. Test additional digital invitations, account-library membership, revoked access, personal page names, per-recipient reply privacy and PDF downloads. Confirm the physical mailing address and four-card schedule remain attached only to the primary recipient. Check an actual received email and hosted book download before calling either end-to-end verified.

## Verification record

The combined local suite, including conservative recorded-speech cleanup, passed 394 tests with no failures or skips. TypeScript passed. The recording/sharing production build passed; the final cleanup build and container renders are checked by GitHub CI. The PDF deployment trace includes the approved logo and embedded Quicksand font. Local browser verification with fictional data covered review navigation and playback, normal email-account verification, added-recipient personalization, isolated replies, reply-box reveal after playback, and a downloaded PDF. The 390-pixel layout had no horizontal overflow. No provider email or physical mail was sent in these checks.

Speech-cleanup checks include waveform silence detection versus audible sound, preservation of meaningful and quoted words, source-time cut/caption conservation, 40,000 frame-grid intervals, PCM sample preservation, bounded fade endpoints and repeated-cut duration. Local rendering stopped because this isolated checkout has no Remotion Chrome; the worker container installs and verifies its own browser. Human listening remains required to assess natural pacing. See [speech cleanup](AUTOMATIC_SPEECH_CLEANUP.md).

GitHub container checks and deployed Railway startup still require verification for the merge commit. A real microphone session, actual hosted four-film completion, received email and printed book remain separate end-to-end checks. Local fixtures are ignored and are not included in Git.

Relevant checks include `tests/recording-provenance.test.ts`, `tests/transcript-reading.test.ts`, `tests/story-editorial.test.ts`, `tests/interview-state.test.ts`, `tests/conversation-agent.test.ts`, `tests/film-jobs.test.ts` and `tests/postcard-cadence.test.ts`.

## Current references

- [Story editing rules v2](../video/STORY_EDITING_RULES_v2.md)
- [Film worker operations](STORY_FILM_WORKER.md)
- [Railway setup and recovery](RAILWAY_WORKER_SETUP.md)
- [Team handoff](handoff/README.md)
- [Archived video design previews](handoff/video-previews/README.md)
- [Private recipient collection and book](RECIPIENT_COLLECTION.md)

Older written-story narration demonstrations and editing rules are historical design material. They do not describe the current production film path.
