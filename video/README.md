# Chapter video worker

This is a runnable production scaffold, not a claim that the application already performs professional editorial review. It exports accepted recordings from a collection, renders operator-approved edit plans, stores the results privately and attaches them for final owner review. It does not yet choose the best clips, align a transcript automatically, or operate a durable queue.

## Implemented

- A reusable Remotion template: chapter title, source video or audio, timed captions, text-only fallback, four-second motion closer.
- Input validation: accepted take, source answer attribution, source hash, trim bounds, ordered captions, archive declaration and a final duration of at most 3,600 seconds including titles.
- A separate worker that verifies media, makes a content-addressed local original archive, renders H.264 MP4, checks its duration and emits an output hash plus a review checklist.
- Optional local FFmpeg noise/loudness processing and an explicit ElevenLabs audio-isolation adapter. Both create new derivatives and preserve the original.
- A HyperFrames reusable closer project. Its output is an asset handed to Remotion, not a native conversion between the two project formats.
- A collection CLI adapter: export four accepted-take plans, verify the source snapshot, render, save to private Blob or local media, then attach all four outputs atomically with `editorialReviewed: false`.

## Dependencies

Keep all Remotion packages on the same version:

```sh
npm install --save-exact remotion@4.0.532 @remotion/cli@4.0.532 @remotion/bundler@4.0.532 @remotion/renderer@4.0.532 @remotion/media@4.0.532 @remotion/captions@4.0.532
npm install --save-dev tsx
```

The worker needs Node.js 22+, FFmpeg/ffprobe and a supported Chrome renderer. It belongs on a worker machine, container or appropriately configured render service. Do not run it synchronously inside a Next.js route. No external credentials are required for local rendering.

## Preview and render

Run from the repository root. The supplied JSON contains fictional text, no family content:

```sh
npx remotion studio video/remotion/index.ts --no-open
node --import tsx scripts/render-chapter.ts --plan video/examples/text-preview.json --media-root video/media --archive-root video/archive --output video/output/text-preview-v1.mp4 --draft
node --import tsx --test scripts/render-chapter.test.ts
```

Drafts carry a review watermark. Final rendering requires a populated `approval` object. That object represents the accepted edit plan, not approval of the finished video. Every rendered artifact returns `releaseEligible: false` and `humanReview.status: pending`. The application's authenticated review flow must separately approve the output hash before it can be released.

Output files are never intentionally overwritten. Use a new filename and increment `revision` for every changed edit. If a job fails, a reserved or partial output may remain; inspect it and use a new output filename for the retry. Do not mistake a partial MP4 for a successful job. A successful worker writes the adjacent `.result.json` file.

## Complete collection workflow

This is a trusted operator command with storage credentials. Do not expose arbitrary invocation to a browser. Run from the repository root:

```sh
node --import tsx scripts/export-collection-video.ts export --collection COLLECTION_ID --work-dir video/workspaces/COLLECTION_ID-v1
```

The new private workspace contains accepted source media, `manifest.json` and four plans. The export copies the whole accepted recording without pretending it is an editorial cut. The current app stores untimed transcripts, so the exporter cannot honestly infer caption timing. Recorded clips are marked `needs-alignment`. Edit each plan to select complete thoughts and add source-timed captions, then run:

```sh
node --import tsx scripts/export-collection-video.ts render --manifest video/workspaces/COLLECTION_ID-v1/manifest.json --approve-edit-plan --editor 'Actual editor name'
```

`--approve-edit-plan` records that the named operator reviewed the JSON edits. The CLI rejects recorded clips with empty captions. `--allow-no-captions` is an explicit exception for an uncaptained review cut, not a claim that captions were completed. The same flag must not be silently added to a production job.

All four renders must complete before the collection is changed. The adapter verifies that selected takes, source answer text, chapter text and notes still match the exported snapshot, both before rendering and inside the final atomic save. If they changed, the output files remain available but are not attached. It refuses an already-approved collection. Private Blob storage is used when configured; local media storage is used for local development. It never mails a postcard, sends an email, approves a collection or makes a recipient release available.

In the existing schema, `videoStatus: ready` means the file is ready to watch in the owner review screen. The adapter always sets `editorialReviewed: false`. The owner must watch the completed cut and approve it through the review page. Final source archives and render receipts remain in the workspace. If a render fails or the final snapshot check fails, already-created private media records may need later operator cleanup. Originals are not deleted.

## Input contract

`src/lib/video-plan.ts` is the authoritative typed contract and runtime validator. See `examples/text-preview.json` for the smallest working plan.

For a recorded answer, add a source record and point clips to it:

```json
{
  "assetId": "asset-unique-id",
  "sourceAnswerId": "answer-id",
  "takeId": "take-accepted-id",
  "acceptedTakeId": "take-accepted-id",
  "kind": "video",
  "relativePath": "answer-1/take-2.mp4",
  "sha256": "REPLACE_WITH_REAL_64_CHARACTER_SHA256",
  "durationMs": 42100,
  "archiveRef": "private-storage-original-object-reference",
  "originalPreserved": true
}
```

The worker only reads relative files inside `--media-root`. It does not fetch arbitrary URLs. The queue adapter must download authorized source assets to that private directory before invoking it. The worker checks hashes and measured durations, rejects escaping symlinks and retains a verified archive copy. The declared durable `archiveRef` is not remotely checked by this local worker. The application must confirm that durable original storage exists and is accessible before submitting a job.

Each clip includes its source asset/answer, `inMs`, `outMs`, `editorialReason` and `captions`. Captions use source time, not edited chapter time. Every caption must fall within that clip. Build sentence-level caption segments of at most 220 characters, ideally one or two readable lines. A caption cannot be synthesized from a paraphrase and represented as the speaker's actual words. Preserve word-level transcripts separately if using forced alignment.

Each clip is deliberately driven by the plan, not separately authored JSX. Edit timing and captions in the accepted plan and increment its version. This is not a full consumer video editor.

The output video has a three-second title and four-second closer. The remaining clips are consecutive, without an automatic crossfade or silence removal. An operator or a future AI planning step can propose cuts, but someone must check that each cut keeps the complete thought and does not distort the person's meaning. Never shorten a long story silently to fit the one-hour limit. Ask for a revised edit plan.

## HyperFrames handoff

The current closer uses a temporary text wordmark because no approved final logo asset is configured. `DESIGN.md` traces its palette to the current app. Replace it with the approved logo and review the result before real delivery. The vendored GSAP runtime retains its upstream license header.

```sh
cd video/hyperframes
npm run check
npm run render -- --output ../media/brand-closer-v1.mp4 --fps 30
```

Check the actual four-second output with ffprobe and hash it. Add this optional field to a plan:

```json
{
  "brandCloser": {
    "relativePath": "brand-closer-v1.mp4",
    "sha256": "REPLACE_WITH_REAL_64_CHARACTER_SHA256",
    "durationMs": 4000
  }
}
```

The worker verifies that asset and Remotion appends it once. Without the asset, Remotion uses the explicitly temporary text-wordmark animation built into the template. HyperFrames does not process the family's footage a second time. The titles and footage remain controlled by the Remotion plan.

## Audio improvement

Always retain the original recording. First compare whether processing improves intelligibility. It can make breath sounds, soft voices and emotional pauses worse.

Conventional FFmpeg processing, not AI:

```sh
node --import tsx scripts/render-chapter-audio.ts --input video/media/answer-1/take-2.mp4 --output video/media/answer-1/take-2-clean-v1.wav --method ffmpeg-cleanup
```

Optional ElevenLabs AI isolation:

```sh
node --import tsx scripts/render-chapter-audio.ts --input video/media/answer-1/take-2.mp4 --output video/media/answer-1/take-2-isolated-v1.wav --method elevenlabs-isolation --allow-external-processing
```

The external option requires `ELEVENLABS_API_KEY` in the worker environment and recorded consent to send the recording to ElevenLabs. The key must never be sent to the browser or placed in a plan. The flag is a command guard, not proof that the application collected consent. The job submitter must verify that consent. It calls the documented `POST /v1/audio-isolation` endpoint and can incur provider charges. No real provider call is part of the local tests.

The script extracts a full-length audio copy, processes it without deleting pauses, checks duration agreement and emits a hash. After listening and accepting it, set the source's `audioDerivative` to its private relative path, SHA-256, method and duration. The template mutes the original video sound only when that verified derivative is provided. A text answer is not turned into a synthetic performance of the person. Voice cloning is not part of this pipeline.

## Worker result and application adapter

Successful stdout and the adjacent `.result.json` contain:

```json
{
  "status": "rendered-awaiting-review",
  "planId": "plan-id",
  "sessionId": "session-id",
  "chapterId": "chapter-id",
  "revision": 1,
  "draft": false,
  "planSha256": "plan-hash",
  "outputSha256": "video-hash",
  "localOutput": "private-local-path.mp4",
  "videoUrl": null,
  "storageAccess": "local-private",
  "durationSeconds": 180,
  "humanReview": { "status": "pending", "checklist": [] },
  "releaseEligible": false
}
```

The standalone worker's `videoUrl` is deliberately null. The collection CLI adapter consumes that local file, stores it privately and attaches the stored media ID. It does not publish a URL in its output. Do not replace it with a public Blob URL. The app uses its authorized media route to check who may view the chapter.

Required application work before production:

1. Durable queue with deduplication by chapter ID, revision and plan hash; controlled concurrency, retries and failure states.
2. Verify durable original backup and recovery beyond the local worker archive.
3. Automatic transcript alignment and, optionally, AI cut proposals using actual source timestamps. Operator edit plans already work.
4. Add an authenticated queue result callback if moving beyond the operator CLI. Private output upload is implemented in the collection adapter.
5. Ensure the owner review screen shows the edited cut, original excerpts, captions and changes. Re-edit creates a new immutable revision.
6. Final approval bound to `outputSha256`, then release scheduling. A render-complete callback must not send postcards or release a chapter automatically.
7. Durable object storage with retention, recovery and tested access controls. The local archive is a worker safeguard, not a guarantee of permanent cloud backup.

## Human quality review

The worker checks hashes, timing and basic media structure. It cannot certify editorial judgment, theological accuracy, emotional integrity, audio improvement or a professional finished product. `VIDEO_REVIEW_CHECKLIST` supplies the explicit review checklist. It is returned as pending on every new render, even if the input edit plan was approved.

Official integration references: [Remotion Node rendering](https://www.remotion.dev/docs/ssr-node), [Remotion Vercel Sandbox](https://www.remotion.dev/docs/vercel-sandbox), [HyperFrames developer overview](https://hyperframes.heygen.com/developers/overview), [ElevenLabs audio isolation](https://elevenlabs.io/docs/api-reference/audio-isolation/convert).
