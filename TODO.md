# Time Tapestry — TODO

## Completed

### Domain & DNS
- [x] Purchase timetapestry.app and app.timetapestry.app
- [x] Configure DNS for root domain and www/app subdomains
- [x] Verify domain in Resend dashboard

### Email (Resend)
- [x] Add Resend API key to `.env.local`
- [x] Confirm Resend is sending email successfully
- [x] Set `RESEND_FROM_EMAIL` to custom domain sender

### Platform & Deployment
- [x] Rebrand project from True Legacy to Time Tapestry
- [x] Set up GitHub repository for the project
- [x] Configure Vercel project and deployment
- [x] Add `vercel.json` with `framework: nextjs` and `outputDirectory: .next`
- [x] Fix Vercel build: resolved "No Output Directory named 'public' found"
- [x] Deployed to timetapestry.app and app.timetapestry.app

### Development
- [x] Add Gloo AI Studio API key to `.env.local`
- [x] Add ElevenLabs API key to `.env.local` (Text-to-Speech permission only)
- [x] Add OpenAI API key to `.env.local` (for Whisper STT)
- [x] Test full interview flow with real API keys
- [x] Verify all routes return 200
- [x] Run `npm run build` and confirm clean

---

## Known Issues / Recent Fixes

- **GitHub repo path**: The repository was initially tracking the wrong directory due to a parent `.git` at `/Users/kaylynnbrooks/Claude/`. It has been reinitialized at the project level (`/Users/kaylynnbrooks/Claude/projects/gloo-hackathon-true-legacy/`).
- **Vercel build failure**: Builds were failing with *"No Output Directory named 'public' found"*. Fixed by adding `vercel.json` with `framework: nextjs` and `outputDirectory: .next`.
- **Missing CI workflow**: `.github/workflows/ci.yml` was removed from the repo because the GitHub token lacks workflow scope. It needs to be re-added manually via the GitHub UI.
- **Environment file location**: `.env.local` is at `/Users/kaylynnbrooks/Claude/projects/gloo-hackathon-true-legacy/.env.local` and contains all API keys. It is not committed to version control.

---

## Completed Since Last Update

- [x] Switch video storage from Vercel KV base64 to Vercel Blob with direct browser upload
- [x] Add browser-side video compression (720p, 24-30fps, 800kbps)
- [x] Add pre-interview "What to expect" expectations screen
- [x] Wire up video recording flow at end of interview
- [x] Build admin dashboard with shared-secret auth at /admin
- [x] Session detail view at /admin/session/[id]
- [x] Cut nonprofit model and broaden language beyond generosity
- [x] Fix live interview submission (form was not redirecting)
- [x] Fix email links pointing to localhost (use NEXT_PUBLIC_APP_URL)
- [x] Switch from Deepgram to OpenAI Whisper for STT
- [x] Update branding: new folded-thread logo, cutting-edge design language
- [x] Change ElevenLabs voice from Rachel to Alice (more natural)
- [x] Switch ElevenLabs model from Flash to Turbo v2.5
- [x] Increase recording limit from 15s to 60s
- [x] Fix story engine to use actual transcript instead of demo data
- [x] Video keepsake upload and compression (basic recording + Vercel Blob storage done; real transcoding/adaptive bitrate still pending)

---

## Hackathon Day (Before Submission)

These items were completed as part of the hackathon submission and deployment. The remaining open items are polish and marketing assets.

- [x] Add Gloo AI Studio API key to `.env.local`
- [x] Add ElevenLabs API key to `.env.local` (Text-to-Speech permission only)
- [x] Add OpenAI API key to `.env.local` (for Whisper STT)
- [x] Add Resend API key to `.env.local`
- [x] Set `RESEND_FROM_EMAIL` to custom domain sender
- [x] Test full interview flow with real API keys
- [ ] Record 90-second demo video
- [ ] Write 250-word entry description
- [x] Verify all routes return 200
- [x] Run `npm run build` and confirm clean
- [x] Git commit final version
- [x] Push to GitHub

---

## Post-Hackathon (After Submission)

Still relevant once the hackathon submission is locked in.

- [x] Buy domain (timetapestry.app)
- [x] Verify domain in Resend dashboard
- [x] Add DNS records for Resend
- [x] Change `RESEND_FROM_EMAIL` to custom domain (noreply@timetapestry.app)
- [ ] Sign up for Lob account and get API key
- [ ] Add `LOB_API_KEY` to `.env.local`
- [ ] Test real postcard sending via Lob
- [ ] Switch from `test_` to `live_` Lob key for production
- [ ] Add physical address verification flow
- [ ] Test postcard QR code scanning

---

## Future Features (v2)

Still the planned roadmap for the next phase.

- [ ] User accounts and authentication (NextAuth.js or Clerk)
- [ ] Persistent user database (Postgres for real launch)
- [ ] Per-user dashboard to manage stories, view postcard history, edit profiles
- [ ] Admin dashboard with proper auth (currently using shared secret)
- [ ] Real video transcoding (Mux, AWS MediaConvert, or Cloudflare Stream)
- [ ] Adaptive bitrate streaming for video playback
- [ ] Video thumbnails and preview generation
- [ ] Replace Vercel Blob with proper CDN-backed video delivery
- [ ] Multi-user organization accounts (nonprofits sponsoring experiences)
- [ ] Role-based permissions (admin, org owner, grandparent, grandchild)
- [ ] Password reset and account recovery
- [ ] Email verification flow
- [ ] Family account concept: build out the 23andMe-style shared family tree
- [ ] Multiple stories per family, viewable by invited members
- [ ] Helper mode for elderly users (someone assisting them)
- [ ] Phone/Twilio interview channel (fallback for users without browser access)
- [ ] Topic selection UI (generosity, faith journey, family history, recipes)
- [ ] Physical box fulfillment (premium tier, 5 boxes over 5 months)
- [ ] Multi-language support
- [ ] Payment processing / checkout
- [ ] CRM connections for nonprofits
- [ ] Donor scoring and analytics
- [ ] Public story feed (opt-in)
- [ ] Mobile app (iOS/Android)

---

## Improvements to Consider

- [ ] Better video compression and adaptive bitrate
- [ ] Video preview thumbnails on keepsake page
- [ ] Improved admin dashboard with charts/analytics
- [ ] Bulk actions for admin (send reminders, export data)
- [ ] Audit logging for admin actions
- [ ] Better mock responses (currently keyword-based, could be smarter)
- [ ] More robust error handling on API routes
- [ ] Accessibility audit (WCAG AAA compliance)
- [ ] Performance optimization
- [ ] SEO meta tags for keepsake pages
- [ ] Analytics tracking (privacy-respecting)
- [ ] Backup/export for session data
- [ ] GDPR/CCPA compliance review
