# Kaelyn's development handoff

Checked October 4, 2026. Work from `codex/four-chapter-legacy` in [time-tapestry](https://github.com/kae-creative-apps/time-tapestry), with [PR #1](https://github.com/kae-creative-apps/time-tapestry/pull/1). Coordinate before merging into another working branch.

GitHub contains the application, locked dependencies, integration code, prompts, brand assets, rendering templates and tests. A push does not disconnect the existing provider accounts. It also does not copy local credentials, provider-side settings, recordings or a running worker to another computer or deployment.

## Start locally

Use Node.js 22 or newer. In a fresh checkout:

```sh
npm ci
cp -n .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`. Match `NEXT_PUBLIC_APP_URL` to the actual browser origin. Preserve an existing `.env.local`; add only missing settings. Restart Next.js after environment changes. The typed-story path works without provider keys and reports unavailable services honestly.

For a production-style local rehearsal:

```sh
npm run build
PORT=3112 npm run preview:local
```

The rehearsal launcher binds only to the local computer, uses permanent `.data/collections`, and disables outbound collection email/postcards and cloud storage. It still uses configured ElevenLabs credentials. Run one preview at a time. Do not stop a preview while someone is recording.

## Preserve the connected services

These are configuration checks on Tayloe's ignored local environment, not fresh live-provider or hosted-deployment tests.

| Service | Code and settings to preserve | Local configuration on October 4 |
| --- | --- | --- |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`; prompt and validation in `src/lib/collection/conversation-agent.ts`; shared voice resolution in `src/lib/elevenlabs-client.ts` | Key and agent ID present. Agent ID matches the documented existing interviewer. Keep this agent and its voice. |
| Lob | `LOB_API_KEY`, `LOB_FROM_ADDRESS_ID`, `LOB_WEBHOOK_SECRET`; delivery transport, approved artwork and signed webhook handling | Test key and return-address ID present. Webhook secret absent. Actual test render evidence exists; no live mailing is established. |
| Gloo | `GLOO_API_KEY`, optional `GLOO_MODEL` | Key absent. Source text and configured questions remain available. |
| OpenAI transcription | `OPENAI_API_KEY` | Key absent. Original recordings are retained; typed correction remains available. The film worker also has a separate ElevenLabs transcription adapter. |
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Absent. Recipient email verification and live email delivery need setup. |
| Hosted records and media | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN` for a private Blob store | Absent locally. Configure durable hosted storage separately. |
| Hosted bot protection | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`; optional `SECURITY_HASH_SECRET` | Absent locally. Public signup and recipient verification require hosted security. |
| Delivery scheduler and admin | `CRON_SECRET`, `ADMIN_SECRET` | Absent locally. Both collection delivery flags remain disabled. |

Provide Kaelyn access to the existing provider projects or scoped developer credentials through a secure secret-sharing channel. Put server secrets in her ignored `.env.local` and the hosting/worker environment settings. Do not paste keys into GitHub issues, PRs, committed files or browser code. GitHub Actions secrets are not automatically application runtime environment variables. The existing local env file remains ignored with owner-only permissions.

The existing agent, branch, client-tool and voice identifiers and provider setup requirements are recorded in [Live interview setup](LIVE_INTERVIEW_SETUP.md). Retain the private agent, patient turn taking, supported client events and `set_interview_theme` tool. Add the final application hostname to the existing agent's permitted domains when deploying. A key from another ElevenLabs account may not be able to access this agent. Read-aloud and optional film narration resolve the voice from this same agent; do not replace it with a generic voice or browser speech.

Refero, 21st Dev, GitHub and other Codex plugins are development tools connected to Tayloe's Codex account. Their login sessions do not ship with this repository. Kaelyn can build the committed app without those plugins, or connect her own development tools. Remotion dependencies, the HyperFrames project and the rendered brand closer are committed; they are distinct from a personal plugin login.

## Run the separate film worker

Follow [Story film worker](STORY_FILM_WORKER.md). It needs FFmpeg, ffprobe, a supported Chrome renderer and the same collection/media configuration as the app. The worker loads local environment configuration itself:

```sh
npm run video:worker
```

Do not point a test worker at another person's live data. On hosted deployments, supervise this process separately from the Next.js web server. It only processes consented queued work and still requires review of completed stories and films before sharing.

## Before public deployment

Configure the public HTTPS origin, durable storage, Turnstile and verified Resend sender first. Then configure Lob's signed webhook and a recurring call to `/api/collection/jobs` using `CRON_SECRET`. Preserve the current test-only mailing decision. Test keys do not mail physical postcards, and a GitHub push is not a deployment or a working delivery schedule.

The repository currently requests a five-minute Vercel cron. Prior deployment diagnostics reported a plan restriction. Resolve compatible hosting or scheduling explicitly instead of silently changing delivery frequency. No hosting account, secret store or provider account was modified during this handoff audit.

See [Delivery setup](DELIVERY_SETUP.md), [Security and storage](SECURITY_AND_STORAGE.md), [Account setup](ACCOUNT_SETUP.md) and [Lob verification](LOB_END_TO_END_QA.md) for configuration and acceptance checks.

## Data and validation

Private contacts, transcripts, recordings, generated media and backups remain outside Git in `.data/` or private cloud storage. Cloning the repo does not recover them. Preserve Tayloe's existing `.data/collections` and follow [Backup runbook](BACKUP_RUNBOOK.md) before migration. Use fictional fixtures for development. Never replace the existing collection store with test data.

```sh
npm test
npm run typecheck
npm run build
```

Tests mock outbound providers. Passing tests or the presence of environment variables does not verify live audio, inbox delivery, physical mail or a durable production film worker. Verify those against the intended deployment separately.
