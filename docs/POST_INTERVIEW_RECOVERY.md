# Post interview review and recovery

The owner reviews one finished film at a time, reads the corresponding story or downloads the private draft book, personalizes postcard encouragement, then approves the digital gift. The recipient address and public-print approval remain separate requirements for physical mailing. New recipients can be invited after digital approval. The owner preview of the recipient page is read-only.

## Saved progress

Completed answers and interview segments are attached to the private collection. The recorder also writes local fragments to IndexedDB while recording. On return, the verified storyteller can open the account library and continue the correct collection and capture mode. Recovery uploads only after owner authorization. Opening the page does not start the microphone or camera.

A same-browser return can recover committed local fragments that were not yet uploaded. Another device can resume only the server-saved progress. Browser storage eviction, device failure, or the most recent fragment before its IndexedDB write cannot be guaranteed recoverable. The UI distinguishes local saving from confirmed server attachment. Never place collection keys in account-library JSON or localStorage.

A Web Lock prevents another tab from taking over and finalizing an actively recorded collection's journal when the browser supports Web Locks. Browsers without that API retain the existing recovery behavior.

## Factual issues in a written story

The owner can report a name, detail, missing context or other mismatch without editing the story text. An open report holds digital approval. The owner can withdraw a mistaken report after comparing the original recording. Report state remains private to the storyteller.

The team resolves actual issues with the private operator script described in `STORY_ISSUE_REVIEW.md`. The script requires checking the source recording, preserves the previous version and original media, rejects stale corrections, and queues replacement films when wording changes. It does not automatically infer correct names or verify meaning. Monitor open reports through that operator workflow; no staff email destination is invented by the app.

## Preparation and delivery recovery

A failed checkpoint after films are ready preserves their attachments and existing review marks. Exhausted retries produce an attention state instead of another misleading retry. Owner notifications are queued for terminal preparation or delivery holds, and stale notices are suppressed.

The Railway worker processes delivery on a separate 60-second timer, including during long renders. The daily Vercel cron remains a fallback. Existing delivery flags, provider credentials, print approval, address confirmation and idempotency checks still govern sending. A changed address after a provider attempt holds remaining cards for team review rather than modifying an already submitted printing request.

## Books and replies

The draft PDF endpoint is owner-only and uses private, no-store responses. Recipient downloads require an approved collection and verified authorized access. Quicksand remains the primary book font, with Noto Sans CJK as a fallback for supported Chinese, Japanese and Korean characters. Unsupported characters produce a clear error instead of silently disappearing.

A recipient recording must pass browser playback checks before submission. The server independently reads private stored bytes and validates container tracks and packets, including complete WAV chunks. An already saved reply remains idempotent even if its media is temporarily unavailable. These are practical integrity checks, not a promise to fully decode every frame on the server.
