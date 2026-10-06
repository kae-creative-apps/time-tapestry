# Railway film worker setup

The Next.js website stays on Vercel. One private Railway worker first processes the durable interview-preparation queue, then the original-film queue. It recovers authenticated saved conversation turns, verifies original sources for all four areas, saves four written stories and postcard note drafts, and produces four chapter films for owner review. Missing source areas stop for attention. It does not mail postcards or bypass final sharing approval. Deploying this container is separate from proving a complete hosted interview.

## Deploy the service

1. Open the existing Time Tapestry worker project in the correct Railway workspace. Verify its owner and project identity before changing shared variables. Create a service from this repository and the reviewed commit or branch.
2. Select the repository root and `Dockerfile.worker`. Set `RAILWAY_DOCKERFILE_PATH=Dockerfile.worker` explicitly if the service does not apply `railway.json`. The JSON file is a compatibility configuration; inspect the effective service settings in Railway. Do not rely on legacy Config as Code being applied to a new service.
3. Attach a persistent volume at `/data`, set one replica, and keep the image's start command. No public domain, port, or HTTP healthcheck is needed. The worker writes its authenticated shared heartbeat to KV. `tini` forwards shutdown signals and reaps child processes.
4. Add the required variables below using Railway's private variable UI. Reuse the website's values. Do not paste secrets into an issue, logs, the Dockerfile, build arguments, or this document. Reference existing shared project variables instead of duplicating them where possible.
5. Check the image and preflight before starting the live queue. Start the service, then verify its fresh shared heartbeat from the owner-authenticated film status endpoint or account UI. A running container alone does not prove storage credentials are correct.

The image runs as the default root user because Railway volumes mount as root. Do not expose the worker publicly. The data and scratch directories are private, and there is no inbound application server.

## Variables

| Variable | Value or source |
| --- | --- |
| `KV_REST_API_URL` | The website's existing Redis REST URL |
| `KV_REST_API_TOKEN` | The matching Redis token |
| `BLOB_READ_WRITE_TOKEN` | The same private Vercel Blob store used by the website |
| `ELEVENLABS_API_KEY` | The existing account that owns the Time Tapestry interviewer and has Scribe access |
| `ELEVENLABS_AGENT_ID` | The same existing agent ID as the website, required to verify saved interview transcripts |
| `SECURITY_HASH_SECRET` | Exactly the website's current secret, so shared provider budgets use the same buckets |
| `NEXT_PUBLIC_APP_URL` | The website's canonical public HTTPS origin, with no route, query, or fragment |
| `COLLECTION_DATA_DIR` | `/data`, already set in the image |
| `STORY_FILM_WORKER_HOSTED` | `true`, already set in the image; Railway is also detected automatically |
| `SECURITY_PROVIDER_DAILY_LIMIT` | Match the website's intended budget, default 500 actions per day, not dollars |
| `COLLECTION_STORAGE_LIMIT_BYTES` | Match any website override; default 2 GiB per collection |
| `STORY_FILM_MIN_FREE_BYTES` | Default `1073741824`, a 1 GiB free-space safety floor |

The worker uses ElevenLabs to read and verify already recorded conversation transcripts and to transcribe original media where needed. It creates no new voice sessions and does not change the agent or voice. Synthetic narration jobs are retired. `GLOO_API_KEY` is optional for written-story editing; without it, complete source-text drafts are saved. Film enqueue limits remain durable per collection. Resend, Lob, `ADMIN_SECRET`, `CRON_SECRET`, and OpenAI are not required by this worker and should not be copied to it unnecessarily. Only the successful four-film attachment queues the owner review-ready notification; the separate protected delivery service sends it. Read [current recording-only QA](QA_2026-10-05_RECORDING_ONLY.md) before using older narrated previews as a test reference.

Set restart policy Always on a plan that supports it. Configure a bounded termination grace period, for example 60 seconds, and avoid overlapping replicas. A long render may exceed the grace period. Persisted leases and original-job retries provide recovery, not a promise that every deployment finishes the current render. Unfinished AI narration jobs cannot be retried under the current policy; their retirement preserves completed artifacts.

## Capacity and recovery

Start with enough capacity for the test cohort and measure actual footage. Two vCPUs and 4 GiB RAM are the resource limits used by the container smoke test, not a production throughput guarantee. The renderer uses concurrency two. A 10 GiB volume is a reasonable starting allocation for short test interviews, but multiple long originals and cached intermediates may require substantially more.

Hosted startup always sets `TMPDIR`, `TMP`, and `TEMP` to `COLLECTION_DATA_DIR/tmp`, creates it privately, and rejects symlinked or separately mounted scratch. External temporary-directory settings are ignored so render scratch uses the guarded volume. Data is stored in these places:

| Data | Location |
| --- | --- |
| Collection records, approvals, job state and leases | Shared Redis |
| Uploaded originals and attached finished films | Private Vercel Blob |
| Staged originals, render progress and reusable derivatives | `/data/film-work/JOB_ID` |
| Reusable source-word transcripts | `/data/film-transcripts/COLLECTION_ID` |
| Temporary browser, bundler and encoding files | `/data/tmp` |

Do not confuse the volume with a backup of Redis or Blob. Enable appropriate backups for each durable service separately and follow [the backup runbook](BACKUP_RUNBOOK.md). Do not erase the volume to fix a failed job. Transcripts and intermediates can save time and paid work on retry.

The worker reserves an estimated two copies of source bytes plus two stereo PCM derivatives before taking original jobs. Unknown source duration conservatively reserves two hours. Rendering estimates another 4 MiB per second, in addition to the free-space floor. Cached files are counted conservatively again. Actual consumption depends on footage, so inspect volume usage after each initial test. Space checks are not filesystem reservations and cannot prevent unrelated writes from exhausting disk between checks.

If logs report disk pressure, increase the volume or pause the worker and have an operator verify safely disposable completed scratch work. Never remove active job folders, source recordings, or transcript caches blindly. No automatic deletion is implemented. Original jobs deferred for space keep their work and retry allowance; smaller jobs may continue. A heartbeat can remain fresh while all queued jobs await space, so inspect logs and job progress as well as online status.

If the worker is offline, inspect configuration errors first, then the volume and Redis connectivity. Startup errors list setting names without their values. A successful `--check` validates local prerequisites only, not access to Redis, Blob, or ElevenLabs.

## Verification before the first real story

Build and run the provider-free Linux smoke test:

```sh
docker build --platform linux/amd64 -f Dockerfile.worker -t time-tapestry-worker:qa .
docker run --rm --init --platform linux/amd64 --network none \
  --cpus=2 --memory=4g --memory-swap=4g --entrypoint node \
  time-tapestry-worker:qa --import tsx scripts/verify-worker-container.ts
```

This runs the real original-film composition using synthetic audio and video. It checks the preinstalled browser, ffmpeg, ffprobe, font, closer, 1080p H.264/AAC output, duration, preserved source hashes, and remaining owner approval requirement. The GitHub Worker container workflow repeats it. It does not exercise Scribe, remote storage, or four-film attachment.

After deployment, use one consented test collection on the hosted website. Record enough content for all four themes, approve processing, and close the browser. Confirm four playable films appear without a local worker running. Check original preservation, the correct voice, captions, exact-output approval, recipient-only QR access, and private playback. Interrupt a separate synthetic job to verify recovery. Keep evidence free of private links and credentials.

Lob is a separate release gate. Keep physical delivery disabled until webhook signing, scheduler authentication, intended-recipient access, dates, and the test-mode lifecycle have passed. A film worker deployment does not prove postcard delivery is ready.
