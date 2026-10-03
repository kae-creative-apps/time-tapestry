# Time Tapestry hackathon QA and handoff

October 2, 2026. Branch: `codex/four-chapter-legacy`.

The four-chapter family journey is implemented and has passed a local browser walkthrough. It is ready for team review and a controlled rehearsal. Live voice, transcription, cloud media, printing and email still need validation before they appear as working features in the final demo. This is not a production-launch certification.

## Live conversation update, October 2

The default `/record/[id]` route now opens one conversational interview. The former question-by-question recorder remains available through `?classic=1`. The four themes are internal during the live conversation and appear as four stories during review.

Implemented: owner-only ElevenLabs WebRTC token exchange, a versioned interview prompt, private theme switching, typed answers, pause/reconnect, durable transcript outbox, independent recording segments, recoverable local originals, review corrections/exclusions, and projection into the existing four-story generation flow. Corrections preserve originals and a previously excluded answer stays excluded after correction. Reconnecting retains all provider conversation identifiers.

The isolated browser walkthrough used `/share` on port 3109 with synthetic contacts, separate data in `/private/tmp/time-tapestry-live-preview`, and delivery disabled. It passed all four guided written answers, pause, refresh, resume, exclusion followed by correction and explicit inclusion, adding missed words, and four-story generation. The corrected wording and added memory appeared in Story 1. No console errors or warnings appeared. At a 390 × 844 viewport the interview document remained 390 pixels wide.

The archive hook also passed a real Chromium MediaRecorder harness with generated canvas video and a synthetic tone. Rollover segments decoded independently. Pause disabled both tracks, interruption retained the final original, retry reused uploaded media, storage failure preserved a downloadable recording, and finish stopped all tracks. These checks did not use a physical camera or microphone and mocked upload responses.

Final checks for this update: **79 automated tests passed**, TypeScript passed, and the isolated production build passed using `.next-live-build`. The normal preview on port 3107 and its recording data were not restarted or replaced. The new local preview remains on port 3109. These changes have not been deployed.

**Connection boundary:** ElevenLabs credentials are absent from this local preview. The real interviewer voice, provider turn-taking, simultaneous device capture and provider microphone use, Safari/mobile devices, and venue Wi-Fi have not passed a live rehearsal. The interface explicitly labels the typed fallback. Four generated stories currently use the labeled source-text fallback when Gloo is absent. A passing build does not establish live AI quality.

**Editing boundary:** continuous originals have estimated or unaligned transcript timing. Export preserves source recordings and ranges, and refuses to pass them off as precisely cut films. Content editing and final video review remain operator steps. An explicit review of captured words, including the last answer, is required before story generation because final provider transcript delivery is not guaranteed by disconnect timing.

Configure and rehearse with [LIVE_INTERVIEW_SETUP.md](LIVE_INTERVIEW_SETUP.md). The earlier validation below describes the preceding question-by-question build and remains historical evidence for those shared features.

## What the app now does

1. **Give or request a story.** Guided setup separates the storyteller, requester and recipient. It collects names and email, optional phone, and a US mailing address now or through a private address link later.
2. **Answer four core questions.** Each section offers video, voice or typing, with up to two optional follow-ups. Questions move from kindness received to Christian faith and lived values, generosity practiced, and hopes for the recipient. Encouragement and supplied Scripture are optional.
3. **Keep and choose takes.** The recorder saves chunks locally, retains original recordings, supports replay/rerecording and uploads a selected take. It suggests 2 to 5 minutes and caps each take at 10 minutes. Browser storage can fail or be cleared, so the interface distinguishes local recovery from a completed server backup.
4. **Prepare four chapters.** Configured Gloo assistance organizes selected answers. Without Gloo, the app shows a labeled source-text draft. Typed answers do not create footage of the storyteller.
5. **Review one chapter at a time.** Storytellers review wording, postcard notes, encouragement and finished films before approving. Source changes invalidate review. Explicit regeneration retains draft history. Unsaved edits and active video uploads block approval.
6. **Open the complete approved collection.** The first postcard is the introduction. All approved chapters and included films are available immediately. A chapter QR link still allows the recipient to open the whole collection.
7. **Return through four postcards.** The schedule starts after approval, then continues at months 3, 6 and 9. Mailing delays shift later cards; the worker does not batch overdue cards. The four-card sequence ends nine months after the first card, not twelve months later.
8. **Continue the conversation.** A recipient can explicitly send a written or recorded response from a chapter. A saved reply queues a storyteller email. A recipient fallback email is eligible 14 days after confirmed mailing, subject to preferences, existing replies and mail status.

## Important fixes

- The active interview no longer relies on unlabelled browser speech or a six-question loop. ElevenLabs is used when configured; device voice is clearly identified as a fallback.
- Progress cannot exceed 100%. Narrative words such as “later” no longer accidentally pause an interview.
- IndexedDB recovery keeps interrupted chunks and alternate takes. Explicit take selection survives rerecording and transcript corrections.
- Address and requester links do not expose draft stories, original takes, owner access links or private delivery payloads.
- Approval cannot silently publish unsaved edits, stale source material or a replacement film still uploading.
- Oversized story and reply text is rejected with an error rather than silently truncated.
- Recipient access begins after approval. Immediate completion emails do not spoil the postcard introduction.
- Delivery submissions are not shown as mailed. Signed tracking evidence starts the fallback-email clock; retries and duplicate events are deduplicated.
- Private media uses authenticated streaming with byte ranges. Local data is durably written; Vercel collection storage fails closed without configured KV.
- Eleven legacy API endpoints now require admin access. Original handlers, pages and records remain available to authenticated admins. The dashboard is labelled as archived prototype records.
- Duplicate source-text summaries are hidden. Only one recipient reply recorder can be open at a time, and another cannot open while recording or saving.
- Next's transitive PostCSS uses the patched version through an override. The dependency audit reports zero known vulnerabilities as of this check.

## Validation evidence

All browser data was synthetic, using Alex Demo, Jamie Demo and example.com addresses. Provider credentials were removed from the local process and `COLLECTION_DELIVERY_ENABLED=false`. No real email, postcard, payment or family recording was sent.

| Check                          | Result and boundary                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automated suite                | **55 passed**: interview state, IndexedDB recovery, collection permissions/approval, delivery scheduling/deduplication, video plans, legacy authentication and text preservation.                                        |
| TypeScript and build           | `npm run typecheck` and `npm run build` passed. Google Fonts required network access at build time.                                                                                                                      |
| Dependency audit               | `npm install --ignore-scripts` reported **0 vulnerabilities** after the PostCSS override. This is an advisory scan, not proof of complete security.                                                                      |
| Browser, written-story journey | Setup, all four answers, chapter generation, chapter edits and explicit approval completed. Unsaved review changes blocked approval.                                                                                     |
| Browser, finished film         | A synthetic MP4 uploaded and played through the private media route, with a measured duration of 9.003 seconds and no video error.                                                                                       |
| Browser, recipient journey     | All four approved chapters were available. A chapter link opened its section; “Read the four chapters” restored all four. Explicit text reply saved and showed its queued email status.                                  |
| Browser, responsive layout     | Recipient page checked at 390 × 844. Document width remained 390 pixels, with all four chapter headings present. This is responsive browser QA, not physical-phone testing.                                              |
| Local video integration        | Four chapter films rendered and attached while remaining unapproved. Original hashes and stale-source checks passed. HyperFrames rendered a closer consumed by Remotion. See [video validation](../video/VALIDATION.md). |

Final visual proof is retained with the local project QA evidence. The synthetic browser collection and media are local, ignored artifacts, not shipped demo content.

The request path also passed: separate requester and storyteller details, a deferred address, final review and invitation creation. Its status correctly said queued and did not expose the unfinished interview.

## What needs to happen before recording the final demo

| Owner                         | Required check or input                                                                                                                   | Evidence to keep                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Kaelyn                        | Configure the actual ElevenLabs voice and audition the four questions. Test Whisper and a real recorded answer.                           | Audible, natural prompt and a correct editable transcript.                                                         |
| Kaelyn and Tayloe             | Test camera/microphone capture, pause/return, rerecord, selected take, denied permission, dropped connection and refresh on a real phone. | Original survives, selected take is correct, playback works and failure copy is accurate.                          |
| Kaelyn                        | Configure private Blob and KV in the deployed environment.                                                                                | Two browsers/devices can resume and play approved media; recipient cannot access original takes.                   |
| Tayloe                        | Supply approved logo assets and a consenting demonstration story.                                                                         | Replace temporary wordmark and synthetic footage.                                                                  |
| Tayloe, with the video editor | Review source trims, caption timing, names, Scripture, audio and final meaning.                                                           | Approve the actual four films and postcard text. AI does not certify its own edit.                                 |
| Kaelyn                        | Configure Lob return address, webhook secret, Resend sender, public HTTPS origin and scheduled delivery worker.                           | Controlled provider tests and real tracking evidence. Keep delivery disabled until approved for the specific test. |
| Both                          | Rehearse and record a maximum 90-second journey using only verified screens.                                                              | A timed video with honest labels for any sample or planned service.                                                |

The build includes video export, rendering and attachment tools, but **automatic professional content editing, automatic caption alignment and a durable production render queue are not built**. Audio cleanup has a conventional FFmpeg path and an optional ElevenLabs isolation integration. Real AI cleanup quality remains unverified. A human operates the current edit/render process.

Before broad public use, also implement and test abuse/rate controls, access-link rotation/revocation, account recovery, user deletion/export and a retention policy. These are public-launch requirements beyond the controlled hackathon rehearsal. The current private link grants access to whoever possesses it.

## A reliable rehearsal

Run `npm ci`, `npm test`, `npm run typecheck` and `npm run build`. Use local development or a controlled preview with delivery disabled. Open `/share`, create clearly marked demo contacts, and complete the four typed answers. Show one saved take only after actual device recording passes.

Review and save every chapter. Include a verified finished film or explicitly approve a written-only chapter. Approve the collection, open its recipient link, show all four chapters, then submit a reply. Show postcard dates as scheduled, never as sent without provider evidence. Use a chapter link to demonstrate the QR destination; a live print test is separate.

For film export and rendering, follow [video/README.md](../video/README.md). Provider setup and delivery behavior are in [DELIVERY_SETUP.md](DELIVERY_SETUP.md). The full meeting decision map, research context and two-speaker pitch draft are in [MEETING_DECISIONS_2026-10-02.md](MEETING_DECISIONS_2026-10-02.md).

Kaelyn handles the hackathon form. This work does not submit an entry, merge the branch or deploy production.
