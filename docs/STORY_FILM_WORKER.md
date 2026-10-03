# Story film worker

The primary film path uses the storyteller's own recorded microphone audio and camera video. After written drafts are saved and processing consent is recorded, a durable job transcribes the actual source recordings with ElevenLabs Scribe v2. It matches saved user answers to word timestamps, assembles all four themes, levels an audio copy with ffmpeg, adds source-timed captions and the branded title and closer, and attaches the four films together. It never clones a personal voice, modifies an original, or uses transcript arrival times as cuts.

Each finished film still needs the owner's final approval of its exact output hash before sharing. Successful attachment queues one owner review-ready notification. The protected delivery job sends it. It does not send family links before approval.

AI interviewer narration remains an explicit alternative. That mode contains the complete saved written chapter, an AI disclosure, the configured interviewer's synthesized voice, progressive narration captions, and the four-second HyperFrames closer. Scripts and the AI voice must be approved before enqueueing that mode. A written-only path remains available.

## Start the worker

Run from the source project with Node 24, installed npm dependencies, `ffmpeg`, and `ffprobe` on PATH. Remotion also needs its supported Chromium binary. The first render may download Chromium if it is not cached.

```sh
npm run video:worker
```

The worker loads `.env.local`, polls every three seconds, renews active leases, and writes a heartbeat every twenty seconds. A heartbeat older than 90 seconds is reported as offline. Keep its machine awake. This terminal command is not a managed production service. Hosted operation needs a supervised long-running worker sharing the web server's metadata and media storage. No API route launches rendering subprocesses.

For one already queued job:

```sh
npm run video:films -- --job=film_HASH
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Server-only Scribe transcription and optional AI narration access. Manual reviewed original cuts do not need it. |
| `ELEVENLABS_AGENT_ID` | Required only for optional interviewer narration. Its current voice is verified and snapshotted. |
| `COLLECTION_DATA_DIR` | Local store. Web server and worker must use the same absolute directory. Defaults to `.data/collections`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared hosted metadata and durable job storage. |
| `BLOB_READ_WRITE_TOKEN` | Private media storage, required with shared KV or Vercel. |
| `STORY_FILM_TTS_MODEL` | Optional narration REST model, default `eleven_multilingual_v2`. Also accepts `eleven_turbo_v2_5` and `eleven_flash_v2_5`. |
| `STORY_FILM_DAILY_LIMIT` | New versions per collection over 24 hours, default 3, configurable 1 to 10. Duplicate requests reuse the version. |
| `STORY_FILM_CLOSER_FILE` | Optional verified four-second MP4. Default `public/brand/film-closer-v2.mp4`. |
| `COLLECTION_STORAGE_LIMIT_BYTES` | Shared collection storage allowance, default 2 GiB. Each uploaded output is limited to 512 MiB. |

The renderer uses `public/brand/fonts/quicksand-latin.woff2`. A temporary localhost server exposes only that job's verified assets through unguessable paths, not a private directory.

## Automatic editing and its limits

The live recorder captures the selected microphone and optional camera. It does not digitally mix the interviewer audio. Acoustic speaker bleed is possible despite echo cancellation. Approximately four-minute recording files roll independently of themes, with a small overlap to preserve speech. Saved live transcript turns are explicitly unaligned.

The automatic path obtains word timestamps from the actual microphone track. Theme attribution comes from the saved user answers, not a newly invented story classification. It matches each accepted user answer separately, in chronological order, so excluded turns and pauses between answers do not enter a combined cut. Short replies require bounded neighboring speaker evidence. Rollover duplicates are removed only when matching words occupy the actual overlapping capture interval; later repeated memories are preserved. Cuts preserve full words with short bounded padding; captions use the source timestamps without overlapping cards. Dedicated accepted question recordings retain the whole take and natural pauses. Audio-only originals use branded artwork. Optional video-to-audio presentation keeps the original audio, with no new narration.

This is conservative automatic assembly, not a semantic highlight editor. A match requires at least 90 percent token agreement, verified beginning and ending words, a unique source passage, and no conflicting diarized speaker within it. Ambiguous matches, missing recordings, unexpected multiple speakers, impossible timing, or a theme with no usable original stop for attention. The worker never fabricates alignment or silently substitutes AI narration. Edited written stories can differ from the actual spoken film and must not be described as exact transcripts.

The normal portal does not require clip selection. The owner-authenticated original-plan API remains available for controlled recovery: save a draft with its base revision hash, review in/out cuts, then explicitly approve an original render. This recovery mode has no inferred captions. The older CLI collection exporter still deliberately stops on unaligned live material; the new worker has a separate verified source-plan adapter supporting several answers in one source file and answers spanning files.

## Jobs, version fences and recovery

`GET /api/collection/:id/films?key=OWNER_KEY` returns job progress, mode, preparation method and availability. Automatic jobs have `mode: original` and `preparation: automatic`, with stages `queued`, `transcribing`, `matching`, `preparing`, `rendering`, `ready`, `failed` or `stale`. `POST` action `prepare_automatic` requires `processingApproved: true`. `retry_automatic` requires the same consent and `jobId`. Collection draft generation can enqueue directly after saving, so closing the browser does not abandon preparation.

All film modes share a latest-version fence. Versions cover current chapter content, source selections, original metadata, presentation settings and template version, plus voice settings for AI narration. A newer job or changed source prevents an older worker from attaching. All four outputs attach atomically and reset each exact-output review.

Leases renew every twenty seconds and expire after two minutes. Original transcription network errors, HTTP 408/429/5xx and recoverable connection failures receive a persisted `nextAttemptAt`, with at most three total job attempts. Original jobs interrupted by a lease crash resume after a delay, also within that bound. Alignment and media validation failures require attention. Completed transcripts, audio derivatives and renders are reused only after their source/output hashes match. An interrupted Scribe request can have been processed without its response being saved; a bounded retry may repeat that request. Optional AI voice jobs retain explicit owner retries because an unfinished paid narration call may have completed.

Private work lives in `COLLECTION_DATA_DIR/film-work/JOB_ID`, including preserved original copies, measured durations, cut plans and provenance. Source-word transcripts are cached privately under `COLLECTION_DATA_DIR/film-transcripts/COLLECTION_ID`, keyed by the actual source hash, so identical recordings can reuse transcription across upload IDs and jobs. Final local videos are in `COLLECTION_DATA_DIR/media`; hosted paths are `collections/COLLECTION_ID/MEDIA_ID.mp4` in private Blob storage. Do not commit these files. Originals remain untouched and separately available.

Each film is limited to one hour including its title and closer. A source file is limited to two hours. Narration scripts have a 32,000-character limit. Quota, missing configuration, source mismatch, incomplete media or failed verification cannot produce a ready film.

## QA

Unit tests use fictional examples and no providers. `scripts/verify-original-films.ts --real-asr` creates a clearly synthetic fixture using macOS speech synthesis, calls real Scribe on that fixture, and renders four original-audio films. It writes its private evidence report under `.data/original-automatic-qa/verified.json`. `--retry` reuses that fixture and cached work. The test requires the explicit flag for the real transcription call, and never reads a family collection. It verifies audio/video streams, original preservation, output hashes, four-film attachment and the remaining owner review gate.
