# Time Tapestry

[![CI](https://github.com/kae-creative-apps/time-tapestry/actions/workflows/ci.yml/badge.svg)](https://github.com/kae-creative-apps/time-tapestry/actions/workflows/ci.yml)

Stories woven together. Time Tapestry helps people share stories, faith, values and generosity with the people they care about through a private story collection and four postcards.

This branch contains the revised four-chapter journey. Local tests and rendered fixtures do not establish live provider delivery or production readiness. See [Hackathon QA](docs/HACKATHON_QA.md) for the final check record and [October 2 decisions](docs/MEETING_DECISIONS_2026-10-02.md) for scope, research, owners and the demo script.

## Current journey

1. **Share or request a story.** Collect storyteller and recipient details. The recipient can be the requester or someone else. Postal address can be supplied now or requested separately; phone is optional. The postcard pilot supports US addresses.
2. **Answer four questions.** Type, record voice or record video for each question. Optional follow-ups are limited to two per section. Each recording can last up to ten minutes; two to five minutes is suggested. Video is optional.
3. **Choose and review.** Saved takes remain available locally and on the server after successful backup. Newest saved take is the default unless the storyteller explicitly chooses another. Selected answers become four draft chapters and postcard notes. The storyteller can add personal encouragement or Scripture, edit the text and review any finished videos.
4. **Approve the complete gift.** Source changes invalidate review. Final approval freezes the package. Nothing automatically shares unfinished content with the recipient.
5. **Introduce it by postcard.** The first postcard's QR code opens all approved chapters and included videos immediately. Four distinct postcards are planned for months 0, 3, 6 and 9. Confirmed mailing delays shift later cards; overdue cards are not sent together.
6. **Continue the conversation.** Fourteen days after confirmed mailing, an email offers the link and an optional video or written reply. Existing replies and email preferences suppress unnecessary reminders. A submitted reply queues an email to the storyteller.

There is no recipient approval email or immediate postcard-sent email that spoils the gift. Draft-ready and confirmed-mailing updates go to the storyteller. A requested address email can reach the recipient before the first card.

## Development handoff

Kaelyn: start with [setup and integration continuity](docs/KAELYN_SETUP.md). It explains which services are already configured locally, which hosting settings remain, and how to securely supply credentials without replacing the existing interviewer.

## Run locally

Use Node.js 22 or newer. From the repository root:

```sh
npm install
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
| `CRON_SECRET`                                                   | Private bearer secret protecting GET/POST `/api/collection/jobs`. No recurring job is installed automatically.                                                                                                                                               |
| `LOB_API_KEY`, `LOB_FROM_ADDRESS_ID`, `LOB_WEBHOOK_SECRET`      | Postcard API, approved return-address ID and webhook signing secret. Test cards do not establish actual mailing.                                                                                                                                             |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                           | Email API and verified sending identity. Provider acceptance does not prove delivery or reading.                                                                                                                                                             |
| `ADMIN_SECRET`                                                  | Private credential for existing admin tools. Leave blank to deny admin authentication. Never use a shared example password.                                                                                                                                  |

### Production storage and delivery

On Vercel, collection storage fails closed without both KV REST variables. Local filesystem recording upload is refused there; cloud media needs the private Blob store and authenticated direct-upload flow. The app does not silently replace missing cloud storage with ephemeral disk. If deploying elsewhere, arrange persistent storage explicitly and verify backup/recovery before accepting real recordings. Do not manually set `VERCEL` for local development.

Keep delivery disabled until an operator verifies recipients, approved content, the public HTTPS origin, Lob print proofs and QR scans, the Resend sender, and signed real tracking events. The worker is `POST /api/collection/jobs` with `Authorization: Bearer <CRON_SECRET>`; GET is supported for schedulers. Lob posts tracking to `/api/collection/webhooks/lob`. That route verifies the raw-body signature and actual mailing timestamps. Created postcards are only submitted, not mailed.

See [Delivery setup](docs/DELIVERY_SETUP.md) for enablement, suppression rules, delayed schedules, retry limits and reconciliation. There is no automatic cron deployment. Do not invoke an enabled worker with real recipients just to check whether it works.

## Video production

Recorded answers require an operator edit before they are presented as finished chapter videos. The [video worker](video/README.md) exports accepted takes, supports trims and timed captions, retains originals, renders through Remotion and attaches four outputs for narrator review. HyperFrames supplies an animated closer MP4. The closer currently uses a temporary wordmark pending approved logo assets.

FFmpeg audio processing is available; ElevenLabs isolation is optional and must be explicitly authorized. A finished film is limited to one hour including title and closer. The pipeline does not automatically choose the best clips, align untimed transcripts, replace professional editorial judgment or run a durable production render queue. Synthetic render evidence is recorded in [Video validation](video/VALIDATION.md).

Worker commands run separately from Next.js and need their environment supplied explicitly. For a local operator command that should use `.env.local`, use Node's `--env-file=.env.local` before `--import tsx`. The worker also needs FFmpeg/ffprobe and a supported Chrome renderer. Follow the complete instructions in the video README.

## Structure and access

- `src/components/collection/`: setup, interview, recording library, review, address and recipient pages.
- `src/app/api/collection/`: authenticated collection actions, media, transcription, spoken prompts, delivery jobs and Lob webhook.
- `src/lib/collection/`: records, access roles, source-based drafting, media and delivery lifecycle.
- `src/lib/interview-state.ts`: shared four-chapter questions and state transitions.
- `scripts/` and `video/`: operator rendering and media processing.
- `tests/`: interview, collection, recording backup and delivery checks.

Owner, requester and recipient links have different access. Treat their private bearer keys as credentials; anyone holding a recipient link can use it. Original takes and unfinished drafts are not exposed to recipients. Media is served through authorized routes rather than a public recording URL. Legacy code and records remain available behind admin access; they are not the new public journey.

## Checks and handoff

```sh
npm run typecheck
node --import tsx --test tests/*.test.ts scripts/render-chapter.test.ts
npm run build
```

Tests use local fixtures and do not send postcards or emails. The [QA record](docs/HACKATHON_QA.md) distinguishes browser checks, synthetic rendering and pending real-provider/device checks. Confirm live voice quality, transcription, long-recording recovery, private deployed playback, print proofs, email delivery and editorial meaning separately.

Keep changes coordinated with Kaelyn's current branch before merging. This documentation does not mean a production deployment, submission form or live delivery has occurred.

## License

[MIT](LICENSE). Built for the Gloo AI Hackathon 2026 by [Kae Creative Apps](https://github.com/kae-creative-apps) and the Time Tapestry team.
