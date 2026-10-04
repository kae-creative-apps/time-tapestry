# Gloo readiness checklist

October 4, 2026. Owners below are the proposed handoff: Kaelyn on engineering and submission coordination, Tayloe on creative work, both on the complete rehearsal. Unchecked items are acceptance checks, not claims that their underlying code is missing.

## Kaelyn: deployment and connected services

- [ ] Resolve the failed Vercel deployment. The latest checked application commit was `3f0c901`: GitHub validation passed and Vercel reported failure. Prior diagnostics identified the five-minute cron versus hosting-plan restriction. Verify the current cause and configure a compatible scheduler.
- [ ] Confirm the public HTTPS origin, allowed ElevenLabs hostname, durable metadata store and private media store. Restart the deployment and confirm a saved collection and its media remain available.
- [ ] Use the existing ElevenLabs agent and voice from the private handoff. Test an actual microphone conversation, not only configuration lookup or a generated sample.
- [ ] Configure and test actual Gloo chapter generation if demonstrating that integration. `GLOO_API_KEY` was absent locally on October 4; hosted settings were not inspected. Source-preserving fallback text is not evidence of a Gloo request.
- [ ] Configure the verified email sender, Turnstile and server-side admin/scheduler secrets. Confirm real inbox delivery, sign-in return routing and access denial for the wrong recipient.
- [ ] Supervise the separate film worker with FFmpeg, ffprobe, supported Chromium and shared private storage. Record processing times and test its retry/status behavior.

## Both: one complete human journey

- [ ] Obtain permission for the demonstration interview and any public use of a person's image or voice.
- [ ] Test microphone/camera selection, mute, pause, resume, denied permission, slow loading, lost connection and refresh recovery on the actual demo laptop and a phone. Do not count an unsuccessful mobile viewport override as a mobile pass.
- [ ] Save a real interview, correct or exclude an answer, prepare all four stories and produce all four original-voice films. Watch each with sound and check captions, cuts, accuracy and emotional meaning. Four-output synthetic render evidence already exists; this is the human and editorial check.
- [ ] Approve the exact finished versions, then test private account navigation and playback. Confirm changes invalidate an older approval and originals remain available to the owner.
- [ ] Scan a QR pointing to the public site, sign in through a real inbox, open the intended collection and submit a recipient reply. Test an unauthorized recipient separately.
- [ ] Keep sensitive financial notes out of shared chapters and postcard wording unless the storyteller explicitly selects and approves suitable content. Confirm public postcard text is separately reviewed.
- [ ] Exercise the backup runbook and restore a test collection from storage outside the original computer. Keep actual customer records out of source control and public evidence.

## Kaelyn: Lob rehearsal

- [ ] Keep the current Lob test key and outgoing collection jobs disabled until deliberately running an isolated test with fictional recipients.
- [ ] Verify deployed signed-webhook handling and the protected recurring job. Exercise the initial and three-, six- and nine-month schedule, delayed-mail adjustments, retries and duplicate suppression.
- [ ] Scan a current test proof using the correct public destination. Earlier fictional/example-domain proofs establish print rendering, not the complete recipient login journey.

Real physical mail, delivery tracking and paper/color approval remain unverified. They are separate from a hackathon demonstration using clearly labeled Lob test proofs.

## Tayloe: website video and presentation

- [ ] Finish and approve the [website film](website-film/README.md), including the complete voice performance, picture, captions and current postcard imagery.
- [ ] Give Kaelyn the approved master, poster image and captions. Add a responsive player with a clear play control, no automatic sound and acceptable mobile loading performance.
- [ ] Refresh the [editable pitch v3](presentation/README.md) with current approved branding, current screenshots and accurate implementation status. Its older technology and operational claims should not be read verbatim.
- [ ] Prepare the separate hackathon demonstration video with a legible real product interaction and accurate AI attribution. Confirm duration, upload location and submission instructions against the current organizer materials.
- [ ] Keep an offline deck, approved sample collection and recorded walkthrough for a connection failure. Label illustrative or synthetic material.

## Both: submission and rehearsal

- [ ] Confirm the track, registration, current rules, required entry description, presentation length, video limits and deadlines through [Hackathon HQ](https://gloo.com/ai/hackathon/hq). Archived local rule summaries differ, so do not treat an older deck's judging weights as authoritative.
- [ ] If the chosen track requires an agent-build document, prepare its architecture, prompts, permissions, evaluations, reproduction steps and known limitations. Do not attach private session logs publicly.
- [ ] Verify judge access to the repository, public demonstration and submitted media. Document external tools and asset licenses as required.
- [ ] Rehearse speaking roles and the full sequence: interview, review, completed films, postcard QR, recipient playback and reply.

The latest recorded full application suite passed 269 tests. The later postcard/integration change passed 59 focused tests and a production build. Those are recorded engineering checks, not a replacement for the unchecked device, provider and deployment checks above. See [QA evidence](../QA_2026-10-03.md) and [postcard validation](../brand/POSTCARD_DESIGN_v5.md).
