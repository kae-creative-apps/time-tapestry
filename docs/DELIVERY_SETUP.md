# Time Tapestry delivery setup

Status: implementation updated October 3, 2026. No postcards or emails were sent while building or testing this work. Provider credentials, live fulfillment, domain verification and final Lob PDF proofs still need an operator check.

## Product behavior

The storyteller reviews and approves the complete collection before print jobs become eligible. The server then freezes all four postcard designs, their QR codes, the approved wording and the confirmed mailing address. It automatically schedules that exact saved print version when the printing service, webhook, scheduler and public website are configured. If setup is incomplete, it holds the saved version and reports that state; the recurring job checks again later. No additional design, printing or posting step is required from the family. The first postcard introduces the gift. Its QR code opens its chapter inside the collection, with all approved written chapters and included videos available immediately.

Four postcards begin at approval and repeat after three, six and nine calendar months. The worker only submits a postcard when it is due. It never submits an overdue batch together. A later postcard requires confirmed mailing of its predecessor, with at least three calendar months between that confirmed mailing and the next submission. Delays move the visible remaining schedule later.

Each postcard uses its approved chapter note and any personal encouragement or Scripture the storyteller supplied. Nothing is regenerated on a scan or a retry. Combined postcard note, encouragement, Scripture text, reference and translation must fit within 1,000 characters. Long approved text is rejected, never silently truncated. The printed front uses those words and the back reserves Lob's address area, with a PNG QR code generated locally.

## Email transitions

| Trigger                               | Recipient            | Behavior                                                                                                                   |
| ------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Invitation explicitly requested       | Storyteller          | Send the invitation link; suppress if the interview has already started.                                                   |
| Draft generation complete             | Storyteller          | Send the review link while that draft still awaits review.                                                                 |
| Address explicitly requested          | Recipient            | Ask for their postal address; suppress after confirmation.                                                                 |
| Final approval, postcard journey      | Storyteller only     | Queue an owner confirmation. The first postcard introduces the gift to the recipient, with no immediate recipient spoiler email.                                              |
| Explicit digital sharing approval     | Chosen recipient     | Send the approved collection link. The notification must match the exact recipient and recipient-scoped link.               |
| Automatic films finish                | Storyteller          | Send one review notification for that completed render job, while the collection remains a draft.                           |
| Carrier mailing confirmed             | Storyteller          | Confirm which postcard entered the mailstream. No immediate recipient spoiler email.                                       |
| Fourteen days after confirmed mailing | Recipient            | If not viewed, offer the story link in case the card did not arrive. If viewed, invite an optional video or written reply. |
| Reply explicitly submitted            | Storyteller          | Send a private link to the reply.                                                                                          |

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

Use a real, operator-approved Lob return-address ID. The return address must not be silently borrowed from an unrelated project. Resend needs a verified sending address/domain. Missing configuration leaves work pending with an explicit setup error, rather than reporting mock success.

Local records use the collection file store. Vercel deployment requires the root store's persistent KV configuration. Do not turn on delivery against disposable or in-memory session data.

The PNG QR renderer requires `qrcode`; TypeScript uses `@types/qrcode`.

## Worker

The protected endpoint is:

```text
POST /api/collection/jobs
Authorization: Bearer <CRON_SECRET>
```

GET is also supported for a scheduler that requires it. Authentication is required for both methods. The endpoint refuses work unless collection delivery or collection email is enabled. Email can run with `COLLECTION_EMAIL_ENABLED=true` without Lob credentials or postcard readiness. This does not change the first-postcard-first suppression for postal gifts. An invocation performs at most three provider requests, leaving further jobs for the next run. `vercel.json` now declares a five-minute recurring invocation for production deployments. This file change is not evidence that a deployed scheduler is running.

The code makes a real POST to Lob's postcard endpoint and Resend's email endpoint when enabled and correctly configured. Do not invoke an enabled worker with real recipient records as a diagnostic.

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

Before every postcard claim, including a retry, the worker validates the saved released proof against the approved content, address, private QR link and public origin. It sends the saved front, back and address verbatim. A changed proof or a mismatched frozen provider request is held for reconciliation, not silently regenerated. Each postcard uses an idempotency key based on collection, approved version and chapter. Each email uses its notification ID. The serialized provider request is frozen on the first claim and reused unchanged on retries.

Lob and Resend document a 24-hour idempotency window. This worker stops automatic retry after 23 hours from the first attempt, after five attempts, or on a nonretryable provider failure. An ambiguous old outcome requires operator reconciliation before another send. [Lob idempotency guidance](https://lobapi.zendesk.com/hc/en-us/articles/42406526490259-Managing-mail-settings), [Resend idempotency guidance](https://resend.com/changelog/idempotency-keys)

Do not clear the stored request, change its key or mark a timed-out request unsent merely to unblock the UI. Find the matching provider request first. If the provider created the postcard or email, repair the saved provider ID and status. If it definitively did not, document that finding before preparing an intentional retry. There is no public endpoint that bypasses this reconciliation.

Changing an address after a provider request has begun cannot change that existing request. Keep the previous address in its saved request for audit. Resolve an uncertain print job before issuing a replacement.

The request snapshots contain private delivery information and access URLs. Keep them server-side. UI views need status, schedule and the safe error summary, not the serialized request.

## Verification before enabling

1. Complete the core collection flow with local test data and delivery disabled.
2. Run the focused tests below. They make no external requests.
3. In an isolated test collection, have the operator create a Lob test proof. Inspect all four PDFs at actual print size, including a long title and the longest allowed message. Character limits are an implementation guard, not a guarantee of typographic fit.
4. Scan each printed QR proof on a phone and verify the correct chapter, all approved content, private access and reply controls.
5. Confirm the Resend sending domain and sending address in the provider.
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
node --import tsx --test tests/delivery.test.ts tests/delivery-automation.test.ts tests/account-auth.test.ts
```

Tests cover calendar scheduling, delay handling, no batch catch-up, carrier-time anchoring, duplicate events, created-versus-mailed distinction, return handling, reminder suppression, signature verification, invalid event rejection, text escaping, print copy limits and QR image generation. Automation fixtures additionally cover scheduler authentication, email processing without Lob, explicit approved digital sharing, one ready email per film job, exact immutable print bytes, stale-proof rejection and saved-request mismatch rejection. Providers are replaced by local mocks.

These checks do not establish deployed scheduling, provider credentials, postal delivery, email deliverability or printed QR readability. No real messages or postcards were sent during implementation.
