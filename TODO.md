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

- [ ] Family account concept: build out the 23andMe-style shared family tree
- [ ] Multiple stories per family, viewable by invited members
- [ ] Helper mode for elderly users (someone assisting them)
- [ ] Phone/Twilio interview channel (fallback for users without browser access)
- [ ] Topic selection UI (generosity, faith journey, family history, recipes)
- [ ] Video keepsake upload and compression
- [ ] Physical box fulfillment (premium tier, 5 boxes over 5 months)
- [ ] Multi-language support
- [ ] Payment processing / checkout
- [ ] CRM connections for nonprofits
- [ ] Donor scoring and analytics
- [ ] Public story feed (opt-in)
- [ ] Mobile app (iOS/Android)

---

## Improvements to Consider

- [ ] Better mock responses (currently keyword-based, could be smarter)
- [ ] More robust error handling on API routes
- [ ] Accessibility audit (WCAG AAA compliance)
- [ ] Performance optimization
- [ ] SEO meta tags for keepsake pages
- [ ] Analytics tracking (privacy-respecting)
- [ ] Backup/export for session data
- [ ] GDPR/CCPA compliance review
