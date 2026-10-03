# Time Tapestry voice and UX wording

Updated October 2, 2026. Working product language, not a final name decision.

## Voice

Speak to one person sharing something with someone they love. Be warm, clear and naturally Christian. Invite a specific memory, including ordinary choices and lessons still being learned. Do not ask someone to prove their virtue or deliver a polished testimony.

Use warmth for invitations and precision for actions. Recording, saving, reviewing, approving and sending are different actions. Do not make them sound interchangeable. AI helps prepare a draft; the person decides what it means and what to share.

No em dashes. Avoid grandchild-only language, keepsake, gentle, quiet and final-word framing.

## Vocabulary

| Where | Preferred language |
| --- | --- |
| During the interview | Part 1 of 4; next part |
| Main interview titles | People who shaped me; My walk with Jesus; Learning to live generously; What I want you to know |
| Finished written output | Story; written story |
| Story review | Story 1 of 4 |
| Storyteller's page | Your stories |
| Recipient's page | Stories from {name} |
| The whole experience | Your gift |
| Destination | Story page |
| Original recording | Recording; take when choosing between attempts |
| Transcript correction | Review the words; correct names or details |
| Sharing consent | Approve my gift and schedule postcards |
| Recipient reply | Send my message |

Internal chapter IDs, collection routes and stored field names remain unchanged. Biblical book, chapter and verse remains correct. Approved story titles and historical content are not rewritten by this copy update.

## Interview and transcript decisions

New interviews use Christian faith and lived values. The framing dropdown is removed. Historical records retain their stored framing. Voice, video and typed answers remain available.

The four parts organize one interview, not four separate conversations. Each question invites one concrete memory. Two to five minutes is suggested for a recording, with the existing ten-minute capture limit. People may replay or record again and choose their saved take.

Recording is the primary task. Automatic transcription starts after backup when the service is connected. Review the words is a collapsed correction control, not an assignment to transcribe the recording. Names and details can be corrected without replacing the original video. If transcription fails, show its status and an explicit retry. A secondary typing fallback keeps the answer attached to the original recording.

The local demo has no transcription credentials. It says so, rather than showing a false processing or completion state. A transcript retry must not erase saved words if a successful save response is lost.

## Trust language

- Say saved on this device only after durable local storage is confirmed. A memory-only fallback says to keep the tab open and download the recording.
- A local save is not a permanent backup. Backed up means the server copy is confirmed.
- Recording a reply does not send it. Sending requires the explicit message action.
- Approval makes all four stories available at the private gift link and schedules postcards. The approved version cannot be edited in this pilot.
- Anyone with the private gift link can open the stories.
- Use Explore all four stories for the complete gift, including text-only gifts. Do not promise videos when none are included.
- Scheduled, sent for printing, mailed and delivered are distinct states. A follow-up email is scheduled two weeks after confirmed mailing, not guaranteed to arrive then.
- The first postcard introduces the whole gift. The other three invite a return at months 3, 6 and 9.
- Requesters cannot see the storyteller's private review screen. Instructions must match the person's role.

## Audit scope and design reference

Reviewed setup, interview, recorder, saved answers, review/approval, address collection, recipient page, replies, delivery states, product emails, public pages and user-facing errors. Legacy administrative screens and internal code vocabulary remain technical.

The existing Time Tapestry app and the user's October 2 screenshots are the design reference for this narrow wording update. Preserve the paper canvas, editorial typography, oxblood actions and current layout. The prior Refero audit remains the visual direction; this pass clarifies vocabulary and states without introducing a new visual system.

## Validation boundaries

Automated checks cover interview flow, source invalidation, explicit take selection, approval, access controls, delivery scheduling, reply idempotency, recording storage and video constraints. Browser QA uses synthetic content. Live transcription, natural ElevenLabs voice, real-device recording recovery and actual mail/email delivery still need configured-provider validation before the final demo.
