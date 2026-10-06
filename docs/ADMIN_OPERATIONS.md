# Private admin access and recovery

Open `/admin/collections`. If signed out, use **Email me a sign-in link** with the approved team address, then open the link in the same browser and confirm it. The approved identities are exactly `team@foronestudios.com` and `kbrooks@gloo.us`. Existing verified account sessions for those identities also work. Membership is server-owned, and adding a client email, query token or old `ADMIN_SECRET` never grants access.

Links expire in 15 minutes and work once. The account session expires after 30 days; the admin Sign out button revokes it on the server and clears its HttpOnly cookie. Requesting a new sign-in link requires the existing Resend account-email and human-verification configuration. Code and local tests do not prove production email delivery.

## What the dashboard shows

- Submission time and durable interview preparation status, separate from approved story status.
- Original recordings and prepared output films, with private playback/download endpoints. A recorded cloud locator is shown as unverified until accessed; it is not a backup verification.
- A branded four-chapter PDF generated on download. Unapproved versions are clearly marked drafts. Incomplete chapters block PDF generation.
- New family moments and their original file, edited film, written chapter and processing state, when available. They do not replace the original four chapters.
- Email acceptance, attempts, next retry and provider reference. Sent does not mean opened or delivered to the inbox.
- Lob scheduling, provider reference, events, holds and reconciliation requirements. Test or disabled mailing is not described as shipped.
- A recovery manifest with saved content and file references, without capability keys, private URLs, lease tokens or provider request bodies. Download the original media separately. It is not a complete database backup.

Each private read, playback, download, export, PDF and preparation retry records the verified team account, resource and action in the existing audit store. Store and transfer downloaded recovery files privately. Do not commit them or put them in ordinary email. Raw tokens and media URLs never belong in logs or screenshots.

## Deliberate recovery

1. Open the reported collection and compare submission status, original-file availability, worker status and any error. Download a private recovery copy before a manual repair.
2. Fix the reported configuration or source issue using its existing operational runbook. A missing upload that never reached the server must be recovered from the storyteller's original device or an independent backup.
3. **Retry saved interview preparation** appears only for an existing owner-approved processing request whose current preparation reports retry eligibility. The server rechecks the verified admin session under the collection lock, rejects a changed/approved collection, and respects the existing attempt ceiling. A repeated stale click cannot create a second job. This action preserves originals and queues work; it does not itself call rendering or delivery providers.
4. Preparation beyond its retry limit, stale source/template work, missing source coverage and reported story issues need operator review. Do not reset attempt counters or overwrite approved outputs to bypass these protections. Use `STORY_ISSUE_REVIEW.md`, `RAILWAY_WORKER_SETUP.md` and the worker's attention report as applicable.
5. Refresh and verify the resulting files and written stories before approving any user-facing result. Enqueued work is not proof of rendering success.

There are intentionally no email-resend or postcard-send buttons here. An ambiguous provider response requires finding the original provider request using its stored reference/idempotency record. Follow `DELIVERY_SETUP.md` before changing delivery state. Do not retry an uncertain send as a new request, enable live mailing, or alter an approved schedule during a film repair.

## Remaining operational limits

This uses the existing pilot metadata store, not a new indexed database. Collection listing and media inventory scan records. There is no automatic independent backup/restore verification, operator queue ownership, SSO or MFA supplied by this change. Historical prototype media URLs are withheld instead of being exposed directly; migration into private collection media is needed for playback. The dashboard reports saved state and the worker heartbeat, not an end-to-end cloud-provider certification.
