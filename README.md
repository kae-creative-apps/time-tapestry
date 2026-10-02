# Time Tapestry

[![CI](https://github.com/kae-creative-apps/time-tapestry/actions/workflows/ci.yml/badge.svg)](https://github.com/kae-creative-apps/time-tapestry/actions/workflows/ci.yml)

A Legacy Season generator that turns one warm AI voice interview into a family's enduring story of generosity.

> **Brand idea:** Generosity is a story before it is a gift.

A grandparent sits down for a single guided voice interview. Time Tapestry shapes the answers into a Legacy Season: story chapters delivered over time, each inviting a quiet reply and ending with the grandchild choosing their own next step. It is a family's story of generosity, handed to the next generation in a form they will keep.

## The 6-step loop

1. **Request or share** — A grandchild asks, or a grandparent begins on their own.
2. **Voice interview** — A warm, patient AI interviewer asks four core questions, with two optional continuations.
3. **Review and approve** — The grandparent reads the shaped story and approves it.
4. **Deliver the keepsake** — The grandchild receives a private page with chapters, quotes, and causes.
5. **Reply** — The grandchild records a text or voice response.
6. **Choose a next step** — Continue the conversation, serve, give, or pass the story on.

## Quick start

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Fill in `.env.local` with keys for any live services you want to enable. The app runs in mock mode without keys.

## Tech stack

- **Framework:** Next.js 15 App Router, TypeScript strict, Tailwind CSS
- **Fonts:** Fraunces (serif) for stories; Inter (sans) for interface
- **Storage:** JSON files in `src/data/sessions/`
- **AI:** Gloo AI Studio via OpenAI-compatible client (with mock fallback)
- **Voice:** OpenAI Whisper STT, ElevenLabs TTS, browser SpeechSynthesis fallback
- **Delivery:** Resend email, Lob postcards

## Subdomain architecture

The project is split into two surfaces:

- **Marketing site:** `timetapestry.app` — landing, about, pricing, privacy, contact, and nonprofit info
- **Application:** `app.timetapestry.app` — request, share, interview, keepsake, family, and other interactive pages

Route groups keep the code organized:

- `src/app/(marketing)/` — marketing pages and shared marketing layout
- `src/app/` — app pages

Vercel maps the domains to the same project; the marketing and app surfaces are separated by domain, not by URL path.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `GLOO_API_KEY` | [Gloo AI Studio](https://studio.ai.gloo.com/) — story generation |
| `GLOO_MODEL` | Model name, e.g. `gloo-google-gemini-2.5-flash` |
| `OPENAI_API_KEY` | [OpenAI](https://platform.openai.com/api-keys) — speech-to-text |
| `ELEVENLABS_API_KEY` | [ElevenLabs](https://elevenlabs.io/app/sign-up) — AI voice interviewer |
| `ELEVENLABS_VOICE_ID` | Voice ID for the interviewer |
| `LOB_API_KEY` | [Lob](https://dashboard.lob.com/settings/api-keys) — postcard delivery |
| `RESEND_API_KEY` | [Resend](https://resend.com/api-keys) — email delivery |
| `RESEND_FROM_EMAIL` | Verified sending address, e.g. `noreply@timetapestry.app` |
| `NEXT_PUBLIC_APP_URL` | Public app URL, e.g. `https://app.timetapestry.app` |

## Mock mode

Time Tapestry works end-to-end without API keys using mock data. In mock mode:

- Voice interviews return a warm placeholder transcript.
- Story generation returns Gigi's pre-seeded demo story.
- Email and postcards log to the console instead of sending.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel setup, domain configuration, DNS records, and post-deploy checks.

## Contributing

This project was built for the Gloo AI Hackathon 2026. Improvements are welcome as small, focused pull requests.

## License

[MIT](./LICENSE)

## Contact

Built by [Kae Creative Apps](https://github.com/kae-creative-apps).
