# Recording return and backup clarity

## Scope and design decisions

Returning storytellers need a clear next action before any account or storage
explanation. The current Time Tapestry design is the visual reference: existing
paper and espresso colors, Quicksand and Inter, rounded large controls, original
recording players and the existing conversation orb.

| Decision | Source and rationale |
| --- | --- |
| Compact current-part indicator and prominent Continue recording | User's return-screen screenshot; Refero ChatGPT style reviewed for conversation-first hierarchy. |
| Recording options and account guidance below the primary action | User requested less reading; Headspace style reviewed for comfortable spacing and readable rounded controls. |
| Remove giving description and Scripture callout from recording screen | Explicit user request. Questions and optional faith framing remain separate. |
| One compact measured upload bar with confirmation state | Refero Memotron upload screen and Riverside recording status screen. |
| Status and progress in the same place | 21st Dev File Upload Progress List by sean0205, demo 29444, reviewed through the connected Pro account. Borrowed hierarchy only; no third-party code or dependencies installed. |
| Optional original playback and selected-part re-recording | User request. Direct Finish interview remains available. Typed interview answers remain unavailable. |

References: [Memotron upload](https://refero.design/pages/f4fb8f40-9404-4ec8-850c-bc9a54543214),
[Riverside recording status](https://refero.design/pages/69fb848c-1684-4ea3-bb3a-6b212c435467),
[21st Dev progress component](https://21st.dev/@sean0205/components/c-progress-5).
Reference colors, fonts, dense dashboards and hardcoded demo countdowns were not
adopted. This is an existing-product simplification, not a new visual theme.

## Saving behavior

- Browser persistence permission is optional. Its absence alone no longer displays
  a recording-loss warning. Actual storage and upload failures still do.
- A completed upload is not treated as a completed backup. The server must confirm
  that the recording is attached to the interview.
- Direct uploads use measured transfer bytes. The fallback transport reports
  confirmed recording pieces rather than invented byte percentages or a timer.
- A stopped interview with pending backup shows a bold keep-open instruction.
  A confirmed backup with no pending words can show that it is safe to close.
- The exit guard includes nonempty local recordings whose backup failed, even
  when local device storage succeeded.
- Re-recording keeps earlier originals and does not replace the selected answer
  until the new recording is safely saved.

## Validation

Local browser verification completed with fictional collections:

- At 390 by 844, Continue recording is visible at y=274.5 to 322.5.
- At 320 by 740, it is visible at y=302.5 to 350.5, with no horizontal overflow.
- Returning interview has zero typed-answer fields. The broad browser-storage warning
  is absent when no actual failed save exists.
- Original review exposes one player and four part selectors. Selecting Part 2,
  choosing Record again, then Return restores Part 2 without replacing the original.
- Camera and microphone remain off during review and until the user starts recording.

Automated backup/review/access checks run in the final release suite. No actual
microphone capture or interrupted customer interview was used for this verification.
Browser checks use fictional local collections and silent local media fixtures.
No customer session is interrupted and no provider credentials are used for QA.
These checks do not establish real cloud transfer speed or guarantee recovery of
an unflushed fragment after a hard browser or device shutdown.
