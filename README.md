# Time Tapestry

[![CI](https://github.com/kae-creative-apps/time-tapestry/actions/workflows/ci.yml/badge.svg)](https://github.com/kae-creative-apps/time-tapestry/actions/workflows/ci.yml)

Stories woven together. Time Tapestry helps people share stories, faith, values and generosity with the people they care about through a private story collection and four postcards.

This branch contains the revised four-chapter journey. Local tests and rendered fixtures do not establish live provider delivery or production readiness. Start with the [current QA record](docs/QA_2026-10-03.md) and [approved postcard design v5](docs/brand/POSTCARD_DESIGN_v5.md). [October 2 decisions](docs/MEETING_DECISIONS_2026-10-02.md) and [Hackathon QA](docs/HACKATHON_QA.md) are historical snapshots; later work supersedes some of their implementation status.

## Current journey

1. **Share or request a story.** Collect storyteller and recipient details. The recipient can be the requester or someone else. Postal address can be supplied now or requested separately; phone is optional. The postcard pilot supports US addresses.
2. **Share across four themes.** Use the guided live interviewer, type answers, or record individual voice or video answers. The interviewer asks one question at a time; optional follow-ups are limited to two per section. Video is optional.
3. **Choose and review.** Saved takes remain available locally and on the server after successful backup. Newest saved take is the default unless the storyteller explicitly chooses another. Selected answers become four draft chapters. With processing consent and a running worker, original recordings become four films using verified source-word timing, captions and the brand closer. The storyteller can edit written chapters and review each finished film. Optional generosity notes stay private unless the owner explicitly adds an excerpt to a written story.
4. **Approve the complete gift.** Source changes invalidate review. Final approval freezes the package. Public postcard wording has its own explicit consent and four-card print approval. Private interview excerpts and financial details are not copied into print automatically. Nothing automatically shares unfinished content with the recipient.
5. **Introduce it by postcard.** The first postcard's keyless QR opens the intended chapter after the recipient verifies the correct email address. All approved chapters and included videos are then available. Four distinct postcards are scheduled for months 0, 3, 6 and 9 when delivery is configured and enabled. Confirmed mailing delays shift later cards; overdue cards are not sent together.
6. **Continue the conversation.** Fourteen days after confirmed mailing, an email offers the link and an optional video or written reply. Existing replies and email preferences suppress unnecessary reminders. A submitted reply queues an email to the storyteller.

There is no recipient approval email or immediate postcard-sent email that spoils the gift. Draft-ready and confirmed-mailing updates go to the storyteller. A requested address email can reach the recipient before the first card.

## Development handoff

Kaelyn: start with the [complete handoff index](docs/handoff/README.md) and [setup and integration continuity](docs/KAELYN_SETUP.md). They collect the supporting project materials and explain which services are already configured locally, which hosting settings remain, and how to securely supply credentials without replacing the existing interviewer.

## Run locally

Use Node.js 22 or newer. From the repository root:

```sh
npm ci
cp -n .env.local.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Keep `NEXT_PUBLIC_APP_URL` aligned with the port and host you actually use. If `.env.local` already exists, keep it and add only missing settings from the example. Never commit credentials or private collection data.

The typed-answer path works without AI or delivery keys. Without Gloo, chapters preserve selected source text and follow-ups use the configured questions. Without ElevenLabs, the interface keeps written questions and saved recordings available without substituting a device voice. Without OpenAI, transcription reports that it is unavailable, retains the recording and offers typed correction. These are explicit recovery paths, not simulated successful AI, email or postal delivery.

Local collection records and media use `.data/collections/`, or `COLLECTION_DATA_DIR` when set. Browser recordings also use IndexedDB backups. Browser storage can be cleared or evicted, so it is not a substitute for successful server backup. Keep local data out of Git.

## Free pilot and group gifts

All current family and organization journeys are free. `/for-organizations` creates a group of 1 to 100 gifts, collects organizer contact details, and opens a private management dashboard. Organizers add a storyteller's name and email, then copy and share the individual gift link themselves. No checkout runs and no invitation email is claimed as sent. Families choose their own recipient and retain control of their collection. The organization dashboard shows invitation and claim status, not family stories, recordings or private story links.

Unused gift links can be revoked. Redemption is serialized and retryable with a browser-session claim token, so duplicate requests cannot consume another gift or overwrite saved answers. Keep the management URL private, since it provides access to names, emails and unclaimed gift links.

## Live interview controls

The orb remains the interviewer's visual presence. Before starting, participants can select microphone and camera, explicitly open a local preview, and check microphone input. Device changes require a pause so each recording segment is finalized first. Mute applies to both the conversation and the separate original recording.

The client bundle warms on focus or hover and loads alongside session setup. Stable orb, question and status areas avoid page-height changes during incoming speech. A delayed connection message explains when the interviewer is still loading. Failed connections can be retried normally or through the authenticated WebSocket alternative. Both paths preserve the same interview prompt and require owner access. No automatic second conversation is started.

Live voice requires `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` on the server. Credentials must never be placed in GitHub or client code. The app validates agent settings and obtains a short-lived connection credential. WebRTC uses the SDK's dual peer connection option for compatibility. WebSocket fallback does not bypass agent authorization.

See [Storage readiness](docs/STORAGE_READINESS.md) before accepting lasting family archives. GitHub stores application code, not contact records or recordings.

## Configuration

[.env.local.example](.env.local.example) lists every setting for the new collection journey. Restart the development server after changing it.

| Settings                                                        | Purpose                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                                           | Origin serving the app and private collection links. Local default in the example is `http://localhost:3000`; real print/email links require the correct public HTTPS origin.                                                                                |
| `COLLECTION_DATA_DIR`                                           | Optional local collection/media directory. Leave empty for `.data/collections`.                                                                                                                                                                              |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN`                          | Durable cloud collection records and mutation locks. Both are required on Vercel.                                                                                                                                                                            |
| `BLOB_READ_WRITE_TOKEN`                                         | Token for a **private** Vercel Blob store used for cloud recordings and rendered videos. A public store is rejected.                                                                                                                                         |
| `GLOO_API_KEY`, `GLOO_MODEL`                                    | Source-based chapter editing and adaptive follow-ups. Default model: `gloo-google-gemini-2.5-flash`.                                                                                                                                                         |
| `OPENAI_API_KEY`                                                | Whisper transcription. Use a valid OpenAI key; a Gloo key is not assumed interchangeable. Current transcription request limit is 25 MB.                                                                                                                      |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | Live interview, generated narration and spoken questions use the configured interviewer's voice. REST playback and narration share `STORY_FILM_TTS_MODEL` (default `eleven_multilingual_v2`) and the agent's voice settings. No device voice fallback or independent voice override. Optional worker audio isolation uses the same API key and requires explicit external-processing consent. |
| `COLLECTION_DELIVERY_ENABLED`                                   | Must equal `true` before the collection worker sends anything. Defaults to disabled; supplying provider keys alone does not enable it.                                                                                                                       |
| `CRON_SECRET`                                                   | Private bearer secret protecting GET/POST `/api/collection/jobs`. The repository declares a five-minute Vercel cron; a compatible deployed scheduler still needs verification.                                                                               |
| `LOB_API_KEY`, `LOB_FROM_ADDRESS_ID`, `LOB_WEBHOOK_SECRET`      | Postcard API, approved return-address ID and webhook signing secret. Test cards do not establish actual mailing.                                                                                                                                             |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                           | Email API and verified sending identity. Provider acceptance does not prove delivery or reading.                                                                                                                                                             |
| `ADMIN_SECRET`                                                  | Private credential for existing admin tools. Leave blank to deny admin authentication. Never use a shared example password.                                                                                                                                  |

### Production storage and delivery

On Vercel, collection storage fails closed without both KV REST variables. Local filesystem recording upload is refused there; cloud media needs the private Blob store and authenticated direct-upload flow. The app does not silently replace missing cloud storage with ephemeral disk. If deploying elsewhere, arrange persistent storage explicitly and verify backup/recovery before accepting real recordings. Do not manually set `VERCEL` for local development.

Keep delivery disabled until an operator verifies recipients, approved content, the public HTTPS origin, Lob print proofs and QR scans, the Resend sender, and signed real tracking events. The worker is `POST /api/collection/jobs` with `Authorization: Bearer <CRON_SECRET>`; GET is supported for schedulers. Lob posts tracking to `/api/collection/webhooks/lob`. That route verifies the raw-body signature and actual mailing timestamps. Created postcards are only submitted, not mailed.

See [Delivery setup](docs/DELIVERY_SETUP.md) for enablement, suppression rules, delayed schedules, retry limits and reconciliation. The five-minute cron declared in `vercel.json` needs compatible hosting or an explicitly configured external scheduler. Prior deployment diagnostics reported that this interval exceeds Vercel Hobby's limit. The declaration alone does not establish a running scheduled job. Do not invoke an enabled worker with real recipients just to check whether it works.

## Video production

The [automatic story film worker](docs/STORY_FILM_WORKER.md) processes consented jobs from a durable queue. It transcribes the actual source recordings with ElevenLabs Scribe v2, matches accepted answers to verified word timestamps, levels a copy of the original audio, adds source-timed captions, and renders four films through Remotion with approved branding and the HyperFrames closer. All four outputs attach together for the storyteller's review; originals remain unchanged. The default is the storyteller's own voice and optional camera footage. AI interviewer narration is a separate, explicitly approved alternative that resolves the voice from the existing ElevenLabs agent.

Automatic assembly is conservative. Uncertain alignment, missing media or unusable source material stops for attention instead of inventing cuts or substituting narration. Completed outputs still require review and approval. Each finished film is limited to one hour including title and closer. Version checks, bounded retries and verified cached assets support recovery. Synthetic fixture renders establish that the pipeline runs, not that every real interview will produce an editorially strong film. The [manual video tooling](video/README.md) remains available for controlled recovery and reviewed edits.

Run `npm run video:worker` separately from Next.js. This command loads `.env.local` and needs FFmpeg, ffprobe, a supported Chrome renderer, and the same metadata and private media configuration as the web app. Hosted operation requires a supervised long-running worker; committing the queue and worker code does not deploy that service. Follow [Story film worker](docs/STORY_FILM_WORKER.md) for runtime, consent, progress and recovery details.

## Structure and access

- `src/components/collection/`: setup, interview, recording library, review, address and recipient pages.
- `src/app/api/collection/`: authenticated collection actions, media, transcription, spoken prompts, delivery jobs and Lob webhook.
- `src/lib/collection/`: records, access roles, source-based drafting, media and delivery lifecycle.
- `src/lib/interview-state.ts`: shared four-chapter questions and state transitions.
- `scripts/` and `video/`: automatic story film worker, controlled manual rendering and media processing.
- `tests/`: interview, collection, recording backup and delivery checks.

Owner and requester links retain separate bearer permissions, so treat those keys as credentials. Recipient QR and email links are keyless locators: reading a collection, playing its films or replying requires a verified account matching the intended recipient email. Old recipient keys do not bypass this check. Anonymous and wrong-email visitors see a generic gate without story content or names. Original takes, private generosity notes and unfinished drafts are not exposed to recipients. Media is served through authorized routes rather than a public recording URL. See [Account setup](docs/ACCOUNT_SETUP.md) for the current access model. Legacy code and records remain available behind admin access; they are not the new public journey.

## Checks and handoff

```sh
npm test
npm run typecheck
npm run build
```

Tests use local fixtures and mock outbound providers. The [current QA record](docs/QA_2026-10-03.md) distinguishes browser checks, synthetic rendering and separate provider evidence. The October 3 full suite passed 269 tests. The October 4 postcard v5 change passed 59 focused tests and a production build, with one separate fictional Lob test proof. That is not a claim that the full suite was rerun after the visual revision. The existing ElevenLabs interviewer and generated read-aloud voice were verified against the same agent. Confirm real-device voice quality, long-recording recovery, private deployed playback, recipient inbox access, physical print color and editorial meaning separately.

Keep changes coordinated with Kaelyn's current branch before merging. This documentation does not mean a production deployment, submission form or live delivery has occurred.

## License

[MIT](LICENSE). Built for the Gloo AI Hackathon 2026 by [Kae Creative Apps](https://github.com/kae-creative-apps) and the Time Tapestry team.
