# Restart handoff, October 3, 2026

Tayloe resumed after reboot on October 3. The shutdown turn was interrupted before its backup and GitHub push finished. Current code changes survived. Do not describe the interrupted backup as complete.

## Reboot recovery

- `/private/tmp/time-tapestry-live-preview` and the isolated `/private/tmp/tt-journey-qa.sHwaLz` were cleared during reboot. The later server-side preview collections and media in those folders have not been recovered.
- Earlier data in `.data/collections` survived. A quiescent, hash-verified local snapshot was completed at `.data/backups/2026-10-03-resume-01`: 339 private files, 35,169,469 bytes. This is another copy on the same Mac, not an independent cloud backup.
- A filesystem recovery search found no alternate runtime backup or local Time Machine snapshot. The new `/recover-recordings` route recovered two original videos and one written draft from the in-app browser at port 3109. Downloads were copied and hash-verified into `.data/backups/browser-recovery-2026-10-03-3109`. Port 3112 had no browser recordings/drafts. No complete collection reconstruction or complete recovery is claimed.
- Latest build: `NEXT_DIST_DIR=.next-woven-postcard-v3 npm run preview:local`. The woven-postcard-v3 production build and TypeScript passed; see docs/brand/POSTCARD_DESIGN_v3.md for the approved postcard direction and provider proof evidence. The launcher always uses permanent project `.data/collections`, disables outbound email/postcards and excludes cloud storage credentials. It enables the existing loopback-only local security mode so rehearsal writes work; auth, rate limits and quotas remain active. Run one preview at a time. Port defaults to 3109; `PORT` can select another historical origin for browser recovery. Current QA preview uses port 3112.
- Store QA logs in `.data/qa-evidence`, not temporary system folders.

## Current decisions

- Latest approved postcard visual: full woven espresso/taupe front with white logo; personal note and QR on the back. New designs use 6 × 9 to preserve readable 240-character notes. Historical approved 4 × 6 proofs stay frozen. Real Lob test proofs are in docs/brand/evidence; live fulfillment remains disabled.

- Keep the stacked gift cards in the homepage hero. The woven cloth was tried and rejected for the hero. It remains a collapsed optional experiment on `/brand/design`.
- Keep the approved two-t icon unchanged. All decorative patterns use the exact v39 flowing-thread/interlocking SVG assets, with no redraw or outlined recoloring. Warm espresso, paper, sage and clay. No em dashes in copy.
- Make account and story navigation obvious, with stronger contrast and visible videos. Preserve all authentication and recording/recovery protections.
- Original recorded voice/video is primary. AI narration is optional and must use the configured ElevenLabs interviewer voice. Browser speech and generic voice fallbacks have been removed. Final narrator approval is required before sharing or sending postcards.
- The pilot is free. Kaelyn handles the hackathon form. No AI avatar.

## Completed and saved

- End-to-end story recovery, retry and approval fixes; original-film source alignment/caching; bounded client requests; consolidated film polling; lazy Blob upload code.
- Security review and fixes: paid-provider budgets after validation, bounded exact-byte Lob webhook verification, both legacy public-upload routes retired.
- Contrast correction across dark brand panels.
- Restored stacked-card hero; new design board with grain, restrained border, four-thread pitch concept and optional cloth.
- Account recovery UI: Home/My stories, 30-minute same-tab return navigation, same-origin saved-link validation, honest unavailable-email state. No anonymous collection lookup.
- New approved-owner story/video browser at the top of the collection, direct original-recording navigation, previous/next controls for owner and recipient stories.
- The pre-reboot 214-test result is historical. Use the newer durable verification notes in `QA_2026-10-03.md`.
- Earlier isolated browser tests passed written-story setup/reload/review/approval, synthetic film playback/replies, mobile layout, and church contrast. Restored hero was visually checked after the final build.

## Personal postcards and recipient privacy

- Website preview, stacked hero cards, owner print proofs and mail artwork now share one renderer. The print includes first names, a separately approved short public message (up to 240 characters), a small signature and the exact approved thread pattern. Private interview excerpts and personal blessings are never automatically printed.
- QR codes and new recipient links are locators without access keys. Intended recipients must verify their email before stories, films, recordings or address forms open. Old recipient keys no longer authorize. Owner and requester private workspace links retain their existing capability access.
- Four public messages require separate, explicit print approval. Legacy unsent proofs are held for new consent; started provider requests remain unchanged for reconciliation. Email sign-in must be configured before mailing can proceed.
- The 1090px browser check verified the new front/back, actual hero cards and generic locked recipient screen. Viewport override still did not apply, so no new 390px visual verification is claimed. The later Lob audit generated real test PDF proofs for all four designs, inspected provider-rendered images, and decoded all four QR codes from those images. Physical print readability remains unverified.
- Lob rejected the previous inline HTML payload as too large. New requests freeze a versioned multipart envelope and upload embedded-artwork HTML files, with byte-identical retries. Old started JSON requests remain unchanged and held for reconciliation.
- Public postcard readiness now requires complete hosted recipient sign-in security as well as email configuration. Local/test bypass cannot release a public QR card. Address changes after printing begins preserve old requests and hold remaining cards; UI states that team review is required. See `LOB_END_TO_END_QA.md`.

## Generosity capture

- The interviewer starts with a remembered helping story and may invite financial giving once when it fits. No required amount, lifetime total or invented impact. The existing four themes and two-follow-up cap remain.
- The third story review and approved owner review include optional private “Where you sowed” notes. Save is owner-only with revision conflicts. Notes are excluded from recipient/requester projections and automatic interview, story, film and print input.
- Owners may choose an editable excerpt for their written story draft before approval. This uses the ordinary save/review/approval path. Original recordings stay unchanged; original films use recorded sources and do not voice new written-only details.
- Browser QA covered failed-save retention, successful save/reload, selective copy with amount omitted, final review/approval, post-approval notes access and two-tab conflict recovery. No real storyteller usability or voice rehearsal was performed. See `GENEROSITY_MEMORIES.md`.

## Resume here

1. Confirm git state and remote on branch `codex/four-chapter-legacy` in this repository. The existing PR is https://github.com/kae-creative-apps/time-tapestry/pull/1. Check fresh CI with the Code Review connector, not a CLI CI fallback.
2. Latest browser checks passed: authorized collection → My stories → Back to my collection, external saved-link rejection, approved-owner film playback, next-story navigation, direct archive opening, and pausing playback when the archive closes. A fresh 390px check is still unverified because the in-app browser viewport override did not apply; do not describe the 869px screenshot as mobile QA.
3. Check `/brand/design` in the final production build, including reduced motion and optional cloth fallback. Keep the homepage cards. A worker visually checked the board on the dev preview.
4. Restart only one user-facing production preview and one film worker as needed, not the many historical preview ports. Use the permanent-data launcher above.
5. Browser recovery at ports 3109 and 3112 is complete as described above. Preserve existing `.data/collections`, recovered originals, browser storage and `.env.local`. Do not replace them with fixtures.
6. Explain videos accurately: prior to reboot, the latest temporary preview collection had two originals and no finished films. Those server files are currently missing. Earlier surviving collections and recovered browser originals must be assessed separately. Do not imply all recordings have become finished videos.
7. Update PR description if needed with this audit and final browser evidence. GitHub push is not production deployment.

## Still needs configuration / verification

- Live cloud metadata and private media storage, durable backup destination, supervised film worker, verified Resend sender, Lob webhook signature secret, public HTTPS origin, hosted Turnstile/KV security and scheduler. The operator-provided return address is now saved in the Lob test account and ignored local configuration.
- Local ElevenLabs credentials are present. Never print or commit them. Real microphone/camera and venue-network rehearsal remain separate from this isolated QA.
- Vercel deployment is failing with a cron-plan limitation: the repository uses a five-minute cron; Hobby permits daily cron. A user question is pending about compatible hosting/external scheduling versus a slower daily queue. Do not silently change the cadence or purchase a plan.
- No physical postcards or emails were sent. Lob test proofs were created; physical QR scans, carrier delivery, real recipient email verification and a real customer film quality review remain unverified.
- Lob test key and test return-address ID are saved in ignored `.env.local` with owner-only permissions. Both provider authentication and all four actual design renders returned HTTP 200. The home return address is not in GitHub and was not used in shared test screenshots; physical mail will show any configured return address. The setup helper stays available for four hours and preserves its success page after saving. Webhook, verified email and hosted deployment remain separate setup work. Do not enable production mailing. Code and instructions belong in GitHub; private credentials, address and recordings do not.
- The latest full dependency advisory check reported zero known production vulnerabilities. This is not a guarantee of complete security.

## Local process cleanup

At shutdown handoff, root stopped its preview and film-worker processes where identifiable. All localhost previews require restarting after reboot. Old ports used during development included 3107–3112 and 3210–3214. Avoid launching duplicates. Do not delete saved data to clean up processes.

Current detailed verification notes: `QA_2026-10-03.md`. Earlier `HACKATHON_QA.md` is historical and links to the newer notes.
