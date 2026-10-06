# Time Tapestry user journey QA

Scope: signup, recorded interview and recovery, owner review, postcard wording,
approval, invited-reader verification, recipient playback, printable book and replies.
The target is a clear process for people with little technical experience.

## Design direction

Keep the approved Time Tapestry colors, logo, patterns, type and three-step review.
Use plain instructions, large existing controls, explicit save states and a useful
next action after a failure. No new visual theme or synthetic storyteller voice.

Reference review: Refero's Medium and Readwise styles supported readable content
hierarchy and clear primary actions; Tidal's email-verification flow (3278) supported
confirming the email, explaining the inbox step, and showing a clear return route.
Only those interaction and hierarchy principles were borrowed, not their colors,
fonts or illustrations. The existing Time Tapestry interface is the visual target.

## Findings and repairs

| Finding | Repair |
| --- | --- |
| Signup still described written input, older mailing intervals and link-only access. | Copy now matches recorded-only interviews, four films, two-week postcard cadence and verified email access. |
| Invalid fields and server errors were difficult to recover from. | Native form validation, email keyboard settings, whitespace-only name validation and focused server errors. |
| A voice-service outage had no obvious alternative. | Restored the existing one-answer-at-a-time recording route when capture is safely stopped. Transcription availability is explained separately. |
| A session could appear backed up despite failed media uploads. | Shared save-status rules distinguish active recording, device copies, pending words, failed backup and confirmed backup. |
| An empty failed recorder start could block submission after a successful later attempt. | Confirmed empty attempts no longer block; actual lost or unsaved media still does. |
| Permission dialogs and rapid taps could start capture after navigation or race recorder state. | Capture lifecycle and synchronous start/stop guards. |
| A muted or disconnected archive track could diverge from the live interviewer. | Capture interruption pauses; the installed SDK's microphone synchronization failure also pauses. Resuming always requires the user. A cancelled connection attempt closes its SDK client and cannot restart after a late connection result. |
| Owner review and recipient stories lost position on reload or browser Back. | Review step/chapter and recipient chapter are remembered in the URL; keyboard focus follows navigation. |
| A blank postcard on another card prevented saving without a clear remedy. | Identify the affected card and offer navigation and saved-word recovery that preserves other edits. |
| An earlier preview request could replace just-saved postcard words. | Cancel stale preview reads before saving. |
| Approval hid specific server error messages. | Preserve actionable server reasons. |
| Reader removal was easy to trigger accidentally. | Inline confirmation names the reader and explains the effect. |
| Stalled email verification could remain on Checking or Opening indefinitely. | Bounded requests, retry and a return-to-account action. |
| Reply retries could be blocked by a second playback check after a lost acknowledgement. | Reuse the successful check for immutable media and verify the exact saved reply before clearing a draft. |
| Restored reply recordings had no immediate preview. | Show the selected recording before sending. |
| The desktop sticky video overlapped the recipient reply row and blocked Send. | Keep the video within its normal grid row. |
| Digital-only readers could reach a mailing form that would always reject them. | Explain that their invitation covers stories and replies and provide Open my stories. |
| UI could imply an email was sent when email delivery was disabled. | Distinguish saved invitations/replies from available email notifications. |
| Library film counts included older AI or unverified films. | Count only matched original-recording films. |
| Browser default text size and keyboard disclosure focus were not fully respected. | Relative base text size, visible disclosure focus, skip-to-content and reduced-motion support in shared reveal components. |

## Test data and boundaries

Browser QA uses fictional local collections, fictional email addresses and an
isolated loopback app with external providers, email delivery and postcard sending
disabled. Local media fixtures test player/layout behavior only. They do not prove
cloud rendering quality, original-voice editing, live email delivery or physical mail.

The real Kaelyn recovery is a separate production investigation using retained
originals. Its processing status must not be inferred from this QA passing.
No original recording, customer approval, provider credential or mailing flag is
changed by these UI repairs.

## Evidence and limits

- Full regression suite: 526 tests passed, none failed or skipped.
- TypeScript validation and the Next.js production build passed.
- Independent review checked recipient access/reply changes and the pending-connection microphone-failure race.
- Chrome desktop: signup with Enter navigation; provider-unavailable recorded-only fallback; owner chapter/step Back and reload; cross-card draft recovery without losing other edits; approval-step restoration; verified-reader sign-in; saved reply; digital-reader address explanation and return; recipient chapter Back and reload.
- The recipient book downloaded successfully. The PDF has five US Letter pages: a cover and four chapters.
- Production browser preview at 390px and 320px: readable signup, review, postcard, verification, story and reply layouts. No horizontal page overflow. Observed primary controls were at least 52px high.
- Tests used fictional collections and disabled all outgoing providers. Final approval was covered by regression tests rather than approving a customer gift in browser QA.

A dev-preview script parse failure in the in-app browser did not reproduce in the production build. Chrome dev and the in-app production browser checks passed.
This is a technical usability and accessibility pass, not a study with actual
nine-year-old or ninety-year-old participants. Live device permission behavior,
real microphone interruption and abrupt browser termination still require a
consenting-device rehearsal. A final unflushed recording fragment cannot be
guaranteed after a hard browser or device shutdown.
