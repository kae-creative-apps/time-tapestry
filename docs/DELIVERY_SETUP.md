# Time Tapestry delivery setup

Status: audited October 3, 2026. Lob test authentication, the private test return address, and real provider rendering of all four postcard designs are verified. No physical postcards or emails were sent. Public hosting, recipient email verification, hosted security/storage, webhook registration and a running scheduler still need configuration. See `LOB_END_TO_END_QA.md` for evidence and remaining setup.

## Product behavior

Story approval and public postcard approval are separate steps. The storyteller first reviews and approves the four private stories and any included films. They then review all four postcard fronts and backs, the mailing address and dates, and explicitly confirm that the printed messages and names may be read by anyone handling the mail. Story approval alone does not authorize postcards. The server binds this consent to the current public messages and names, and binds print approval to the exact four-card proof.

The artwork uses the recipient's and storyteller's first names, a distinct public encouragement of 1 to 240 characters per card, fixed instructions, branding and a QR code. Private chapter titles, excerpts, postcard notes, personal blessings and Scripture fields are not copied into print. Safe generic encouragement is available as a starting point, but it still requires the same explicit four-card public approval. Unsupported or oversized print text is rejected instead of silently clipped. The postal address area remains reserved for Lob's required recipient name and mailing address, which are necessarily visible in the mail.

The QR is a keyless chapter locator. Scanning it opens a generic sign-in gate until a verified account matches the intended recipient's current email. It does not expose who the gift is from or reveal story or media content to an anonymous scanner. After verification, the chapter opens inside the collection, with all four approved written stories and included films available. Old recipient keys do not bypass this gate. Owner and requester private links retain their separate bearer permissions and must not be printed as recipient QR links.

After public consent and a confirmed address, the server freezes all four card designs, QR codes, approved public wording and address. It schedules that saved print version only when printing, webhook, scheduler, public website and recipient email verification are configured. If setup is incomplete, the proof stays held and the recurring job checks again later. Changing the public messages clears their consent and any untouched schedule until the updated cards are approved. No provider rendering, print or postal delivery is implied by an approved local proof.

Four postcards use the saved first mailing date and repeat after three, six and nine calendar months. If setup holds an old first date in the past, the worker prepares a fresh schedule when it can release the cards. It submits only a due postcard and never batches overdue cards together. A later postcard requires confirmed mailing of its predecessor, with at least three calendar months between that mailing and the next submission. Delays move the remaining visible schedule later. The first postcard introduces the gift.

### Legacy print proofs

New snapshots use print policy version 2 with `verified_recipient_email` access and a hash of the approved public messages. Older proofs remain readable by the owner for review, but are not eligible for mailing. An unsent legacy schedule is held without consuming provider attempts. It needs a newly generated four-card proof and explicit public-message consent; the replaced approved snapshot is archived unchanged.

If a provider request has already begun, its body, address, idempotency key and result are preserved. The worker does not replace or resend that legacy request automatically. An operator must reconcile it with the provider before any replacement. This change cannot retract physical cards already printed, but the old recipient QR key no longer grants online access once the new authorization code is deployed.

## Email transitions

| Trigger                               | Recipient        | Behavior                                                                                                                         |
| ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Invitation explicitly requested       | Storyteller      | Send the invitation link; suppress if the interview has already started.                                                         |
| Draft generation complete             | Storyteller      | Send the review link while that draft still awaits review.                                                                       |
| Address explicitly requested          | Recipient        | Send the keyless address locator; require the intended recipient's verified email and suppress after confirmation.               |
| Final approval, postcard journey      | Storyteller only | Queue an owner confirmation. The first postcard introduces the gift to the recipient, with no immediate recipient spoiler email. |
| Explicit digital sharing approval     | Chosen recipient | Send the keyless collection locator. The notification must match the exact recipient; opening requires their verified email.     |
| Automatic films finish                | Storyteller      | Send one review notification for that completed render job, while the collection remains a draft.                                |
| Carrier mailing confirmed             | Storyteller      | Confirm which postcard entered the mailstream. No immediate recipient spoiler email.                                             |
| Fourteen days after confirmed mailing | Recipient        | If not viewed, offer the story link in case the card did not arrive. If viewed, invite an optional video or written reply.       |
| Reply explicitly submitted            | Storyteller      | Send a private link to the reply.                                                                                                |

A recipient who has already replied to that chapter receives no follow-up for it. Turning off follow-up emails suppresses both fallback and reply invitations. Returned or rerouted mail stops the follow-up and further postcards until the address issue is reviewed. Repeated provider events do not queue duplicate notifications.

The root collection API queues invitations, draft review, address requests and reply notifications. The delivery worker queues and processes postcard events and processes all eligible notifications.

## Configuration

These settings supplement the existing collection storage and media settings:

```dotenv
# Delivery stays disabled until an operator explicitly enables it.
COLLECTION_DELIVERY_ENABLED=false
# Enable email independently while printing is not connected. The full delivery flag also enables email.
COLLECTION_EMAIL_ENABLED=false

# Protect the worker endpoint with a random private value.
CRON_SECRET=

# Use the public app host that serves /collection routes.
NEXT_PUBLIC_APP_URL=https://app.example.org

LOB_API_KEY=
LOB_FROM_ADDRESS_ID=
LOB_WEBHOOK_SECRET=

RESEND_API_KEY=
RESEND_FROM_EMAIL=Time Tapestry <stories@example.org>
```

Use a real, operator-approved Lob return-address ID. The return address must not be silently borrowed from an unrelated project. Resend needs a verified sending address/domain. `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and the public HTTPS origin are required for recipient email verification as well as the collection email workflow. Account sign-in emails operate independently of the collection queue enable flags. See `ACCOUNT_SETUP.md` for the browser-bound verification flow.

Postcard readiness requires account email configuration and hosted sign-in security before release and rechecks them before dispatching scheduled cards. Configure `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `KV_REST_API_URL` and `KV_REST_API_TOKEN`; a local worker's security bypass cannot make a public QR destination ready. If configuration becomes unavailable, the cards stay held without losing their saved schedule or consuming a print attempt. Missing configuration never reports mock success. Presence checks cannot prove inbox delivery, so verify the real sign-in flow before enabling postcards.

Local records use the collection file store. Vercel deployment requires the root store's persistent KV configuration. Do not turn on delivery against disposable or in-memory session data.

The PNG QR renderer requires `qrcode`; TypeScript uses `@types/qrcode`.

### Save a local Lob test key

From the repository root, open the local setup form:

```sh
node scripts/configure-lob.mjs --browser
```

Open the printed `http://127.0.0.1` link on the same computer, paste the Lob `test_` key into the password field, and choose **Save API key**. The form accepts test keys only by default. Its local session stays open for four hours and shows the exact expiry time on the form. Keep the helper running while entering the key. A successful save redirects to a confirmation page that remains available until expiry; refreshing or resubmitting cannot save the key again. Stopping the helper, shutting down the computer, or letting the session expire makes the link unavailable. In that case, run the helper again for a new link. If a terminal is preferred, run `node scripts/configure-lob.mjs` without `--browser` and paste the key at its hidden prompt. Do not put the key in command arguments, shell environment variables, chat, or GitHub.

The helper updates only `LOB_API_KEY` in this repository's ignored `.env.local`, preserves the other settings, and writes the file atomically with owner-only permissions. It refuses symbolic links and a file changed during entry. Delivery flags stay unchanged. The helper makes no Lob request, sends no postcard, and does not verify the key with the provider. Restart the intended local preview after saving so it can load the new value.

This configures the local checkout only. It does not update a hosted application's environment, deploy the app, configure the return address or webhook, or enable delivery. Keep `COLLECTION_DELIVERY_ENABLED=false` and `COLLECTION_EMAIL_ENABLED=false` during setup. Live-key entry requires the explicit `--allow-live` launch option and is outside this test setup.

## Worker

The protected endpoint is:

```text
POST /api/collection/jobs
Authorization: Bearer <CRON_SECRET>
```

GET is also supported for a scheduler that requires it. Authentication is required for both methods. The endpoint refuses work unless collection delivery or collection email is enabled. Email can run with `COLLECTION_EMAIL_ENABLED=true` without Lob credentials or postcard readiness. This does not change the first-postcard-first suppression for postal gifts. An invocation performs at most three provider requests, leaving further jobs for the next run. `vercel.json` now declares a five-minute recurring invocation for production deployments. This file change is not evidence that a deployed scheduler is running.

The code makes a real POST to Lob's postcard endpoint and Resend's email endpoint when enabled and correctly configured. New Lob requests upload the complete approved front and back as HTML files using multipart form data. Inline HTML has a 10,000-character limit and rejects our embedded fonts and artwork. The versioned saved request determines the multipart boundary and bytes so retries remain identical. Internal transport metadata is not sent to Lob. Previously frozen JSON requests are held for reconciliation rather than silently converted. Resend continues to receive JSON. Do not invoke an enabled worker with real recipient records as a diagnostic.

Claims and outcomes are stored under the collection mutation lock. Each claimed provider job has a two-minute lease. External API calls happen after the lock is released, with a twelve-second request timeout.

Lob success means submitted, not mailed. Email success means the provider accepted a nonempty email ID, not that the recipient read the message. No success is synthesized when a provider is missing or returns an error.

## Lob webhook

Configure a live webhook at:

```text
POST /api/collection/webhooks/lob
```

Subscribe to postcard mailing/tracking, return, reroute, rendering failure and cancellation events. If the account does not expose the Mailed event, In Transit can establish that mailing occurred. The worker requires an actual Mailed or In Transit carrier timestamp from `body.tracking_events`; API creation and estimated delivery dates do not establish mailing.

Lob describes Mailed as edition-dependent and does not guarantee every delivery scan. Its test postcards do not receive tracking events. The implementation therefore does not promise access at the precise instant a card enters a mailbox. [Lob tracking documentation](https://help.lob.com/print-and-mail/getting-data-and-results/tracking-your-mail)

The route verifies `Lob-Signature` against HMAC-SHA256 of the exact timestamp, a period and the raw request body. It checks five-minute timestamp freshness before parsing the event. It rejects the public debugger secret `secret`. Match events through their provider postcard ID because Lob redacts webhook metadata. [Lob webhook documentation](https://lobapi.zendesk.com/hc/en-us/articles/42406528139027-Using-webhooks)

The consumer deduplicates event IDs durably. Invalid signatures, malformed events, invalid tracking timestamps and failed storage return non-success responses. An event that races the initial postcard-ID save receives a retry response. A test API key cannot confirm a live mailing event, even if another event type contains mailing history.

The webhook only saves events and queues notifications. It does not call either sending provider.

## Retry and reconciliation

Before every postcard claim, including a retry, the worker checks the policy-2 proof, current public-message consent, recipient email configuration, approved collection, address, keyless QR locator and public origin. It sends the saved front, back and address verbatim. Missing public consent and legacy proofs remain held without consuming an attempt. A changed proof after dispatch began or a mismatched frozen provider request requires reconciliation. Each postcard uses an idempotency key based on collection, approved version and chapter. Each email uses its notification ID. The serialized provider request is frozen on the first claim and reused unchanged on retries.

Lob and Resend document a 24-hour idempotency window. This worker stops automatic retry after 23 hours from the first attempt, after five attempts, or on a nonretryable provider failure. An ambiguous old outcome requires operator reconciliation before another send. [Lob idempotency guidance](https://lobapi.zendesk.com/hc/en-us/articles/42406526490259-Managing-mail-settings), [Resend idempotency guidance](https://resend.com/changelog/idempotency-keys)

Do not clear the stored request, change its key or mark a timed-out request unsent merely to unblock the UI. Find the matching provider request first. If the provider created the postcard or email, repair the saved provider ID and status. If it definitively did not, document that finding before preparing an intentional retry. There is no public endpoint that bypasses this reconciliation.

Changing an address after a provider request has begun cannot change that existing request. Keep the previous address in its saved request for audit. Resolve an uncertain print job before issuing a replacement.

An address change after submission or mailing safely holds the remaining cards and preserves the original proof and provider payload. The address form explains that team review is required. There is currently no self-service or admin resume operation for this case; operator reconciliation remains necessary. Do not claim that a saved new address has automatically resumed the quarterly series.

The request snapshots contain private delivery information. Legacy snapshots may also retain old access URLs and private print text. Keep them server-side and do not rewrite them to hide history. UI views need status, schedule and the safe error summary, not the serialized provider request.

## Verification before enabling

1. Complete the core collection flow with local test data and delivery disabled.
2. Run the focused tests below. They make no external requests.
3. In an isolated test collection, review all four public messages and names, save explicit public consent, then have the operator create a Lob test proof. Inspect all four fronts and backs at actual print size, including long first names, the 240-character message limit, bleed, address clear zones and the QR. Local fit checks are not evidence of the provider's final PDF rendering.
4. Scan each QR while signed out and verify that no collection identity or content appears. Verify that a wrong email and an old recipient key still cannot open stories or films. Then sign in with the intended recipient email and check the correct chapter, all approved content, film playback, replies and the address return flow.
5. Confirm the Resend sending domain and sending address in the provider, then deliberately verify a real sign-in email reaches the intended test inbox. Ensure mailing stays held if email verification setup is absent.
6. Configure the live signing secret and independently verify incoming signed events. Unit fixtures and debugger events are not evidence of actual mailing.
7. Enable delivery only after reviewing recipients, approved content and provider configuration. Confirm that the recurring protected job is registered and running in the deployment. A local preview does not run deployment cron jobs.

Lob requires bleed and address clear zones for 4x6 artwork and recommends checking the final PDF rendered by its test environment. The implementation follows its reference layout, but final provider-rendered proofs have not been checked in this session. [Lob 4x6 HTML reference](https://github.com/lob/examples/blob/master/postcards/4x6-back.html), [Lob API artwork guidance](https://docs.lob.com/)

## Scheduler plan and deployment

Vercel's current documentation limits Hobby cron jobs to once per day. The five-minute schedule in this repository requires a plan that supports frequent cron jobs, such as Pro or Enterprise. It will fail deployment on Hobby. If using Hobby, either configure a separately hosted scheduler to call the protected endpoint every five minutes, or explicitly change the schedule to once daily and accept delayed, low-throughput email and print processing. Do not claim prompt automatic delivery with only one daily invocation and a three-request batch. [Vercel cron usage limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Vercel sends the configured `CRON_SECRET` in the Authorization bearer header. Cron runs on production deployments, not preview deployments. The code does not create a cloud project, purchase a plan, enable environment flags or verify a real schedule. [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Vercel cron quickstart](https://vercel.com/docs/cron-jobs/quickstart)

At the current three-provider-request batch cap and a five-minute schedule, the theoretical ceiling is 36 attempts per hour. Provider latency, retries and failed readiness lower real throughput. This is a bounded pilot queue, not a high-volume mail system. Monitor pending items and oldest due times. Before broader scale, use an indexed durable job queue with independent workers and provider rate controls.

Automatic film rendering is a separate long-running worker. Deploy that worker against the same persistent store and private media storage; the cron endpoint does not render video. The film worker queues a durable owner review email only after all films attach successfully. The family still approves the finished collection before recipient sharing or postcard production. A failed film render never sends a ready message.

## Focused tests

From the repository root:

```sh
node --import tsx --test tests/delivery.test.ts tests/delivery-automation.test.ts tests/postcard-proofs.test.ts tests/postcard-public-consent.test.ts tests/postcard-public-message.test.ts tests/postcard-design.test.ts tests/account-auth.test.ts tests/account-navigation.test.ts tests/account-recipient-return.test.ts tests/recipient-privacy.test.ts
```

Tests cover calendar scheduling, delay handling, no batch catch-up, carrier-time anchoring, duplicate events, created-versus-mailed distinction, return handling, reminder suppression, signature verification, invalid event rejection, text escaping, first-name/public-only artwork, the 240-character message limit and keyless QR generation. They verify explicit consent on the exact four-card proof, invalidation after public-message edits, policy-1 holds, unchanged started requests and a hold when recipient email setup disappears.

Automation fixtures additionally cover scheduler authentication, email processing without Lob, approved digital sharing through a keyless locator, safe handling of previously queued legacy recipient locators, one ready email per film job, exact immutable print bytes and saved-request mismatch rejection. Account and media tests verify that old recipient keys and unauthorized accounts cannot bypass email verification. Providers are replaced by local mocks.

These checks do not establish deployed scheduling, provider credentials, postal delivery, email deliverability or printed QR readability. No real messages or postcards were sent during implementation.
