# Time Tapestry story editing rules, v2

Current product policy, October 5, 2026. This version supersedes v1 where it described typed interview entry, synthetic narration of written stories, or future mixed typed/recorded films. The prior version remains intact as historical context. This document describes implementation and editorial boundaries, not approval of a particular story or a verified hosted deployment.

## A recorded story remains the person's voice

New answers are video with sound or audio only. New films use those saved originals. ElevenLabs remains the live AI interviewer and provides source transcription where configured; it does not speak the storyteller's written chapter as their new film. There is no voice cloning, synthetic replacement of an unclear word or AI narration fallback when a source recording is missing.

The end-user flow is record, listen, record again if needed, keep the answer and continue. There is no editable transcript, written-story editor, Scripture editor or private-notes editor at the end. A new spoken answer is the way to change the recording. Previously saved corrections and private notes remain preserved as historical data. Read-only generated chapters may remain a companion to the recordings, but no generated sentence becomes replacement audio or a verbatim caption. Only the separate public postcard encouragement is editable in the final story-message flow.

Existing completed AI-narrated films and source records are preserved. Unfinished narration jobs are retired rather than completed under a new policy. New queue, retry and attachment paths reject synthetic story narration. Generated film provenance must not be disguised as an original interview recording.

## Written chapters and personal introductions

The Gloo editor receives selected answers through `src/lib/collection/content.ts`. Its rules and response validation live in `src/lib/collection/story-editorial.ts`.

1. Write in the storyteller's first-person voice, with their vocabulary, supplied names and degree of certainty. Start with a memory or their own words. Do not introduce them through a generic occupation, age or family role, and do not write an outside-narrator opening such as “A college barista reflects.”
2. Preserve distinct details, context, chronology, qualifications, corrections, uncertainty and reflections. Long answers need complete treatment. A brief or unresolved memory may remain brief or unresolved. Do not manufacture an uplifting conclusion.
3. Do not invent events, sensory details, feelings, motives, causal outcomes, names, relationships, theology, Scripture or quotations. Keep firsthand knowledge distinct from hearsay and hope. An unclear detail belongs in review rather than a confident guess.
4. Remove only unambiguous fillers from the reading copy. Keep meaningful uses of “like,” quoted speech, emphasis and hesitation that carries uncertainty. Never remove language just because it sounds less polished.
5. Use only selected, included answers. Questions and chapter titles provide context but are not biographical evidence. Private notes and excluded answers cannot enter a story without the storyteller's explicit selection.
6. Personal introductions also use the storyteller's voice and supported details. An introduction is not automatically public postcard copy. Public printing still requires the separate visible-wording approval and privacy checks.

The existing structural checks remain: every paragraph cites supplied answer IDs, every nonempty selected answer is covered, the introduction is at most 280 characters, and incomplete provider results or unknown references are rejected. Inputs larger than the 24,000-character editorial bound retain their complete selected reading copy instead of being silently truncated. The conservative long-source compression check remains in place. These checks cannot verify meaning or prove that a cited fact is true. Editorial QA is still required; it must not become a required writing exercise for the storyteller.

## Internal transcript handling

`src/lib/collection/transcript-reading.ts` creates a conservative reading copy. It removes simple “um” and “uh” pauses only where safe, and preserves all uses of “like,” quoted words, apparent names and acronyms, meaningful punctuation and hesitation-only answers. It does not perform a semantic rewrite. This does not expose an editable transcript to the storyteller. The person listens to the recording and records another answer when needed. Do not reopen the removed written-edit flow as a requirement for submission.

The same cleanup is used for the source-text chapter fallback when the editor is unavailable or the input exceeds its bound. Saved answer text, original transcript history, recordings and word timing are not overwritten. Automatic film alignment and captions continue to depend on actual recorded words and timing, not this cleaned display copy.

## Recorded editing and what remains unfinished

The automatic worker can transcribe actual source media, match accepted recorded answers to source word times and assemble all four themes. It retains a conservative boundary: ambiguous matches, absent recordings, conflicting speakers or unusable timing stop for attention instead of inventing a cut or using generated speech.

Original video stays original video. Audio-only material uses the established branded orb, supported by actual recorded sound. Approved logo assets, the shared template and the current verified closer remain in use. Music stays off. Do not introduce stock scenes, invented family imagery, synthetic people or replacement logo artwork as someone's memory.

Matching words and producing a playable file are not the same as a finished editorial judgment. These parts still require real-content review or further implementation:

- Whether each cut preserves a complete thought, qualification, correction and meaningful pause.
- Whether the answer needs its original question for context. Automatic reviewed question cards and a semantic edit planner are not established by this change.
- Whether interviewer speech has bled into the microphone recording and should remain for meaning or be handled through a reviewed edit.
- Whether a corrected written fact requires another recording instead of trying to turn a paraphrase into source audio.
- Whether a skipped theme has enough alternate recorded material to support its film. A missing answer must not produce invented testimony.

Keep original files intact. Source hashes, selected answer identities and source time ranges remain part of processing evidence. New plans and outputs create versions rather than overwriting approved films. All four attached outputs still need owner review before sharing. One final approval submits the current film hashes together; the server validates the source and output bindings and records approval atomically. No separate per-story text save is required.

## Interview tone

The interview is Christian and welcoming. The faith section invites a concrete decision made while following Jesus that the person later felt grateful for. Faith questions are optional, uncertainty is acceptable, and the interviewer must not force a positive ending or ask someone to explain a refusal. Existing saved beliefs framing remains supported.

A Scripture question may replace one relevant follow-up when the person is comfortable and the two-follow-up allowance has not been used. It is never an extra required question. The interviewer must not choose a verse, finish an uncertain citation or put a spiritual interpretation into the storyteller's mouth.

## Review before release

Editorial QA should compare generated companion text with selected answers and check names, numbers, relationships, quotes, certainty and omitted context. The storyteller watches or listens to the complete original-voice films, including every cut, caption, opening and ending, without being asked to edit a written version. Confirm readable source attribution and appropriate original-voice playback for both audio-only and video interviews.

Verify the exact approved output, recipient-only access and separately approved public postcard text. A test pass, render, source hash or repository push does not grant editorial approval or enable mail.

See [October 5 QA](../docs/QA_2026-10-05_RECORDING_ONLY.md) for the current verification boundaries, [worker operations](../docs/STORY_FILM_WORKER.md) for processing behavior and [Railway setup](../docs/RAILWAY_WORKER_SETUP.md) for hosted checks. Final combined test and build results remain in the final verification record.
