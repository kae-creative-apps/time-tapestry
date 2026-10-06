# Four story-film templates

> October 5, 2026 policy update: this version remains a historical visual specification. Its fictional AI-narrated previews and typed-story narration descriptions are archival design samples, not the current production film path. New films use original recorded voice/video only. Read [editing rules v2](STORY_EDITING_RULES_v2.md) and [current QA](../docs/QA_2026-10-05_RECORDING_ONLY.md). Existing finished artifacts are preserved; older verification results below do not verify the new policy or a deployed worker.

These templates share one visual system for every storyteller. The theme changes, while the type, spacing, captions, orb, pacing and logo finish stay consistent.

| Studio composition | Theme |
| --- | --- |
| `KindnessReceived` | Kindness received |
| `ALifeOfFaith` | A life of faith |
| `WhatYouSowed` | What you sowed |
| `WhatIHopeYouCarry` | What I hope you carry |

## Preview

From the repository root, run `npm run video:templates`, then open the printed localhost URL. The four examples include fictional stories spoken by the configured ElevenLabs interviewer. All examples are explicitly labeled illustrative. Playback requires no credentials or provider calls.

The examples are in `public/brand/story-templates-v1/`. Never place a real interview, recording, private story, address or credential in this public folder. Private production media continues through the existing authorized media and render-worker paths.

`scripts/generate-story-template-previews.ts` is an operator-only fixture generator. It resolves the configured interviewer's voice, calls ElevenLabs, records alignment and content hashes, and refuses to overwrite an existing version. Running it incurs provider usage. It has no application route and accepts no collection identifier. Use a new version for any regenerated sample; update the preview manifest import deliberately.

## Shared edit structure

1. **Three-second opening:** the approved logo, story number, theme/title and storyteller.
2. **Story:** actual accepted footage, or the branded orb when there is no video. Duration follows the selected recording or measured narration. No fixed promotional runtime cuts a story short.
3. **Four-second ending:** the approved animated Time Tapestry logo. The worker uses the committed, verified `film-closer-v2.mp4`. The standalone composition also has an animated vector-logo fallback when no closer is supplied.

All templates are 1920 × 1080 at 30 fps. The approved weave fills the entire paper-colored background at low opacity. Chapter-specific offsets provide slight variation without changing the approved artwork or colors. Quicksand and dark espresso captions retain readable contrast. Captions use bounded phrase lengths and actual source/narration timestamps. AI narration captions disappear before speech, after speech and during long gaps.

There are no photos, stock clips, synthetic family images or generated talking faces. The three-second opening and four-second ending are silent. Music is off throughout this version. A licensed, approved closing cue can be added as a separately reviewed asset later.

## Source behavior

| Accepted source | Picture | Sound |
| --- | --- | --- |
| Recorded video | Original footage, contained without cropping | Original voice, or an explicitly selected verified audio derivative |
| Recorded audio | Branded voice orb | Original voice, or an explicitly selected verified audio derivative |
| Written story in the narration pipeline | Branded voice orb | Configured ElevenLabs interviewer, clearly identified as AI narration |

The orb's shape and size respond to measured audio levels. Source trims use the original source clock, including an audio derivative if it is the selected playback source. Silence and missing envelope data produce a still orb. Envelope extraction streams through FFmpeg with bounded time and memory; it never changes the original recording.

The older standalone manual editor still permits silent text clips, which are explicitly labeled “Written words · No audio.” They are not a substitute for the narrated written-story workflow.

## Integration and release boundaries

- `video/templates/StoryTemplate.tsx` holds shared visuals; `src/lib/story-film-template.ts` holds the four canonical themes and shared constants.
- `video/src/NarratedStoryFilm.tsx` handles the AI narration path; `video/remotion/ChapterFilm.tsx` handles original recordings and legacy manual plans.
- Both server renderers supply real audio envelopes. The worker Docker image includes the shared template source, approved font and animated closer.
- Template version changes create new job identities. Older unfinished jobs must not resume into a mixture of template versions. Existing completed films and source recordings remain intact.
- Existing private storage, source hashes, approved plans and final owner-review checks remain required. Creating a template or completing a render does not publish a story or send a postcard.

These templates do not complete the planned mixed-source workflow that alternates recorded answers and AI narration for typed answers within one chapter. That requires a source-aware planner and job changes before it can be promised to users. They also do not deploy or connect the Railway worker; hosted credentials and an end-to-end production run remain separate launch work.

Before approving a real four-film collection, listen to the full result and verify the person's meaning, original-voice selection, caption timing, every cut, and all four logo endings. Automated checks cannot replace this content review.

## Verification for this version

- All 321 application tests passed, including real-FFmpeg envelope checks, caption boundaries, and stale-template job recovery.
- TypeScript and the Next.js production build passed.
- Twelve still frames rendered for visual review: opening, story and closer for each of the four templates.
- The worker image built successfully. Its provider-free smoke test passed all three production compositions: original video, original audio with orb, and narrated audio with orb. Each produced an eight-second 1920 × 1080 H.264/AAC file, preserved input and brand hashes, and retained the owner-review requirement.
- Container verification ran with `--network none`, no credentials and no personal files mounted. This verifies local container rendering, not a hosted Railway deployment or live collection delivery.
