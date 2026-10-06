# Phase 1 implementation and interview recovery

## Product flow

A full conversation covers the four story areas. A recognized answer is distinct from a button press, an empty transcription, or a saved media file. Finishing first stops capture, waits for private recording backup, and opens a four-part recording review. The owner may listen, record one part again in a scoped conversation, or submit the interview. A replacement does not exclude earlier material until meaningful replacement speech and its verified original exist. Other parts and original recordings are retained.

Submission authorizes server preparation. When the live transcript is incomplete, the worker first reconciles authenticated provider data, then transcribes the verified archived original. Recovery requires source identity, valid word timing and defensible chapter attribution. Silent audio, multiple speakers, conflicting exclusions, or uncertain attribution stop with a preserved-source message. They never become invented answers or automatic proof of four completed stories.

## File map

- Conversation and review: `LiveInterview.tsx`, `InterviewRecordingReview.tsx`, `/record/[id]`, `conversation-agent.ts`, `interview-theme-transition.ts`.
- Coverage, recovery and replacements: `interview-speech.ts`, `interview-source-recovery.ts`, `interview-reconciliation.ts`, `interview.ts`, `interview-preparation.ts` and review/resume projections.
- Immediate web playback: `StoryFilmPlayer.tsx`, `StoryFilmPlayer.module.css`, `story-playback-captions.ts`, `audio/playback-types.ts`, `audio/transcript-cleaner.ts`.
- Private audio preparation and optional video exports: `films/playback-render.ts`, worker/jobstore, `collection/playback.ts`, `/api/collection/[id]/playback`, `/exports`.
- Recording durability and device checks: `hooks/useStoryRecorder.ts`, `audio/input-monitor.ts`, `RecoveredRecordingPrompt.tsx`, `SavedRecorder.tsx`, `InterviewDeviceSetup.tsx`.
- Typed atomic data access: `lib/db/schema.ts`, `adapter.ts`, `collection-adapter.ts`, `index.ts`.
- Organization invitations and four-part progress: organization service/types/progress/join-token, dashboard, gift claim, `/join/[orgToken]`.
- Postcards and address proof: final supplied artwork in `public/brand/postcards/designer-2026-10-06-v2`, canonical renderer and print assets, `PostcardPreview.tsx`, `/api/lob/verify-address`, address verification receipts.
- Diagnostics: `lib/observability/pipeline-logger.ts` with safe trace IDs and redacted server diagnostics across upload, transcription, theme extraction, Lob, email and rendering.
- Marketing: `app/page.tsx`, `FrontDoorNav.tsx`, front-door styles and postcard collection.

## Playback decisions

The browser plays an edited private AAC derivative, rather than receiving excluded raw passages and relying on client-side skipping to hide them. This also avoids inaccurate mobile `timeupdate` cuts. The server uses verified source intervals with short non-speech fades, retimed word captions, exact clip durations and a checked cache receipt. The original voice is retained. Unknown or ambiguous fillers remain intact; meaningful repetition is not treated as a stutter to remove automatically.

The interactive player uses an audio analyser for the orb, synchronized words, a seek control and a readable transcript. It requires a user gesture and has native audio recovery when analysis fails. It does not generate speech. Video download requests queue the existing Remotion worker. Export media inherits the approved source timeline, is private, and triggers an owner notice only after all four outputs verify.

## Compatibility and operational boundaries

- The typed adapter currently uses the existing durable KV authority and atomic mutations. A relational schema and migration plan are supplied; no external SQL service has been provisioned or silently substituted.
- Organization allocation uses the existing pilot model. No payment provider, price or paid transaction has been invented.
- Existing approved postcard schedules and frozen legacy print payloads are retained. New designs use 4 by 6 inch trim and 6.25 by 4.25 inch bleed. Physical mailing remains controlled by the existing mail enablement and Lob mode.
- Recipient media requires the existing verified access checks. Original interview audio is never published by enabling the interactive player.
- The existing ElevenLabs voice and model have not been changed. Session instructions and client handling are updated in application code.
- Browser recording recovery improves saved-chunk handling. An operating system terminating capture before a chunk is emitted cannot be guaranteed recoverable.
- Production microphone behavior, a real customer's archived audio and actual postal delivery require separate live verification. Synthetic browser and source-audio tests do not prove these external outcomes.

## Queued next build

The separate Phase 2 request remains in `phase-2-request-2026-10-06.txt`: compression and leveling, further session hardening, postal tracking, voice replies, accessibility controls and deterministic provider mocks. These are not claimed as completed by this Phase 1 release.

## Release validation

- `npm test`: 657 passed, 0 failed. Bounded concurrency completes locally in 34.8 seconds and avoids resource-starved worker startup checks.
- `npm run typecheck`: passed.
- `NEXT_DIST_DIR=.next-phase1-verification npm run build`: passed, including all 46 static pages.
- Browser fixtures: four-part review, scoped Part 3 question and return, original playback, no typed-answer controls, interactive playback, seeking, analyser failure, and 320/390 pixel layouts. See `docs/design/STORY_PLAYBACK_QA_2026-10-06.md`.
