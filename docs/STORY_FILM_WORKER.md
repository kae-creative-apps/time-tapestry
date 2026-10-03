# Story film worker

Time Tapestry can create four private films from the four reviewed written chapters. Each film contains the complete saved chapter text, a short disclosure, narration by the configured ElevenLabs interviewer's voice, progressive text captions, a restrained brand pattern, and the four-second HyperFrames closer. The renderer does not clone the storyteller's voice or assemble their original camera recordings. Original recordings remain separate and available.

The storyteller approves the scripts and AI narration before a job is queued. All four outputs must finish before they are attached to the collection. The storyteller then watches and approves each exact output before publication. Editing a story invalidates its film review. A written-only publication path remains available.

## Start the worker

Run from the source project directory with Node 24, the installed npm dependencies, `ffmpeg`, and `ffprobe` on PATH. Remotion also needs its supported Chromium binary. The first render may download Chromium if it is not already cached.

```sh
npm run video:worker
```

The worker loads `.env.local` using Next's environment loader. It polls every three seconds, renews active job leases, and publishes a heartbeat every twenty seconds. Keep the worker running on a machine that remains awake. Closing the process, putting the machine to sleep, or disconnecting its storage can interrupt a render. A terminal command is not a managed production service. A hosted deployment needs a supervised long-running worker with the same storage configuration as its web server.

For a single queued job:

```sh
npm run video:films -- --job=film_HASH
```

This command accepts an already approved job. It does not create approval or bypass the private review page.

## Configuration

| Variable | Purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Server-only ElevenLabs access. |
| `ELEVENLABS_AGENT_ID` | Interviewer whose current voice is verified and saved with the job. |
| `COLLECTION_DATA_DIR` | Local collection store. The web server and worker must use the same absolute directory. Defaults to `.data/collections`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared metadata and job storage for a hosted deployment. |
| `BLOB_READ_WRITE_TOKEN` | Private generated-media storage. Required when using shared KV or Vercel. |
| `STORY_FILM_TTS_MODEL` | Optional REST narration model. Defaults to `eleven_multilingual_v2`; also accepts `eleven_turbo_v2_5` and `eleven_flash_v2_5`. The agent's conversational model is not assumed to support REST narration. |
| `STORY_FILM_DAILY_LIMIT` | Maximum new generation versions per collection in a rolling 24 hours. Defaults to 3; configurable from 1 to 10. Reading an existing version does not consume another version. |
| `STORY_FILM_CLOSER_FILE` | Optional absolute path to a verified four-second MP4. Defaults to `public/brand/film-closer-v2.mp4`. |
| `COLLECTION_STORAGE_LIMIT_BYTES` | Collection storage allowance, shared with original recordings. Defaults to 2 GiB; each output has a 512 MiB limit. |

The bundled font is `public/brand/fonts/quicksand-latin.woff2`. The renderer serves only its specific audio, font, and closer assets on a temporary localhost server. It does not publish a private media directory.

## Jobs and recovery

`GET /api/collection/:id/films?key=OWNER_KEY` returns private job progress and worker availability. A heartbeat older than 90 seconds is reported as offline. The generation endpoint requires owner access, script approval, the request protection checks, and a healthy worker. It never launches a subprocess from an API request.

A version is identified by the reviewed chapter text, selected source IDs and text, narrator voice settings, REST model, and template version. Duplicate requests reuse that version. A newer version prevents an older job from attaching its outputs.

Each job holds a renewable two-minute lease. A stopped or expired worker cannot attach output. Recovery marks an interrupted job failed and requires an explicit owner retry, with at most three total attempts. Completed narration chunks and rendered files are reused only after their hashes match. An unfinished provider request can have been processed without its response being saved, so a retry can repeat that unfinished part. The free pilot does not charge participants.

Local intermediate files are in `COLLECTION_DATA_DIR/film-work/JOB_ID/CHAPTER_ID`. Final local videos are in `COLLECTION_DATA_DIR/media`; hosted outputs use private Blob paths `collections/COLLECTION_ID/MEDIA_ID.mp4`. Request receipts, source and script hashes, audio hashes, output hashes, source IDs, voice/model IDs, and render receipts preserve provenance. These private files must not be committed to Git.

A film may contain up to one hour, including its intro and closer. A complete script may contain up to 32,000 characters. Oversized stories fail clearly rather than being silently shortened. Missing narration configuration, invalid timing, mismatched sources, missing media, quota failures, and render errors cannot produce a ready film.

## QA

Automated film tests use fictional examples and no live providers. The end-to-end render check uses four explicitly synthetic chapters with `example.test` contacts. Do not use private family stories for operator QA without reviewing the actual scripts and obtaining the requested narration approval.

The film's large progressive captions are a visual narration treatment. They are not a replacement for source recordings or evidence of an original speaker's exact delivery. The original clip-edit pipeline remains a separate, manually reviewed workflow.

## Original recordings are the preferred direction

The preferred experience is the storyteller's own video when it exists, or their own recorded voice. AI narration is an optional alternative. The original recordings can be reviewed beside the written stories now; this does not mean four original-recording films are ready.

The live recorder captures the selected microphone and optional camera through `getUserMedia`. It does not digitally mix the interviewer's output into that recording. Echo cancellation is requested, but a speaker can still be picked up acoustically. Recordings roll into roughly four-minute files independently of story themes, with a small recorded overlap to avoid losing speech.

Live transcript turns have a theme and arrival time, but are explicitly marked `unaligned`. Their arrival times are not verified speech boundaries. An unaligned answer can reference every recording segment in its session. Never use those references to repeat a full recording for each answer or to infer automatic cuts. The existing source exporter deliberately stops and produces an editorial source guide for these live recordings.

Four source films require verified in/out ranges, source-timed captions where included, and review of each complete edit. The existing `ChapterFilm` composition and source renderer support original video and original audio with titles and a closer, but the current export/import mapping must be extended for live answers spanning multiple segments or sharing one segment. Question-by-question accepted recordings already have a more direct source mapping. Original footage must stay intact, and an edited written story must not be presented as an exact transcript of a differently worded recording.
