# True Legacy — TODO

## Hackathon Day (Before Submission)
- [ ] Add Gloo AI Studio API key to .env.local
- [ ] Add ElevenLabs API key to .env.local (Text-to-Speech permission only)
- [ ] Add OpenAI API key to .env.local (for Whisper STT)
- [ ] Add Resend API key to .env.local
- [ ] Set RESEND_FROM_EMAIL=onboarding@resend.com (for now)
- [ ] Test full interview flow with real API keys
- [ ] Record 90-second demo video
- [ ] Write 250-word entry description
- [ ] Verify all routes return 200
- [ ] Run npm run build and confirm clean
- [ ] Git commit final version
- [ ] Push to GitHub

## Post-Hackathon (After Submission)
- [ ] Buy domain (truelegacy.app or similar)
- [ ] Verify domain in Resend dashboard
- [ ] Add DNS records for Resend
- [ ] Change RESEND_FROM_EMAIL to custom domain (noreply@truelegacy.app)
- [ ] Sign up for Lob account and get API key
- [ ] Add LOB_API_KEY to .env.local
- [ ] Test real postcard sending via Lob
- [ ] Switch from test_ to live_ Lob key for production
- [ ] Add physical address verification flow
- [ ] Test postcard QR code scanning

## Future Features (v2)
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

## Improvements to Consider
- [ ] Better mock responses (currently keyword-based, could be smarter)
- [ ] More robust error handling on API routes
- [ ] Accessibility audit (WCAG AAA compliance)
- [ ] Performance optimization
- [ ] SEO meta tags for keepsake pages
- [ ] Analytics tracking (privacy-respecting)
- [ ] Backup/export for session data
- [ ] GDPR/CCPA compliance review
