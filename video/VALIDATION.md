# Video pipeline validation

Checked October 2, 2026 using generated color frames and a synthetic tone. No family recording was uploaded, no ElevenLabs isolation call was made, and no postcard or email was sent.

## Passed

- Full repository TypeScript check at handoff.
- Six video-plan tests: draft approval boundary, inclusive one-hour cap, accepted take identity, path traversal, source answer identity, caption bounds and original preservation.
- Remotion worker smoke test: source trim, captions and a nine-second output including title and closer. The worker checked output duration, source hashes and a separately retained local original.
- Complete four-chapter local collection path: export accepted takes, edit test captions, render all four MP4s, register private local media and atomically attach them. Each output measured 10.005 seconds. The collection remained draft, all four `editorialReviewed` values stayed false, and no notifications or deliveries were created.
- Stale-snapshot rejection: changing a chapter after export prevented a render from starting.
- Conventional FFmpeg audio processing created a separate 3,000ms WAV, retained the original and kept listening review pending.
- HyperFrames full check: no lint, runtime, layout or motion errors; five of five text contrast checks passed.
- HyperFrames rendered a four-second temporary wordmark closer. Its still frame was visually inspected.
- Artifact handoff: Remotion rendered the HyperFrames closer with the synthetic interview clip and processed audio derivative. The completed output measured 9.003 seconds and stayed pending human review.

## Not verified

- Live ElevenLabs isolation, its cost or quality on real family speech.
- Cloud Blob output upload and playback in the deployed app. The adapter is implemented; the integration test used isolated local storage with cloud credentials removed.
- Production queue scheduling, retries or operator deployment.
- Automatic professional content editing or automatic caption alignment. The export produces an honest first assembly for operator editing; current app transcripts are untimed.
- Final logo approval. The closer is a temporary text wordmark.
- Editorial meaning, emotional pacing or final family approval. Synthetic test footage cannot establish these.

Test media, local original archives and generated renders are under gitignored `video/media`, `video/archive`, `video/output` and `video/workspaces`. The isolated collection fixture was saved under `/private/tmp/time-tapestry-video-integration-test` and was never a live user collection.
