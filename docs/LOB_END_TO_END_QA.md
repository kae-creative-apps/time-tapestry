# Lob delivery audit, October 3, 2026

The local application is connected to Lob's test account. Live end-to-end fulfillment is not yet configured. This audit used fictional stories and delivery details, isolated test storage, and a test API key. It sent no physical mail or email.

## What happens after a story

1. Submitting the interview prepares the private story review. It does not immediately mail personal content.
2. The storyteller approves the stories and any included films, chooses postcards, confirms the recipient address, and separately approves all four public postcard messages and names.
3. The app freezes the four print designs and creates one credential-free chapter QR per card. The intended recipient must verify their email to open the private content.
4. The app holds the nine-month schedule. The first card is due on the approved first mailing date, then the next cards at three, six and nine calendar months. Calendar month ends clamp correctly.
5. A protected recurring worker sends only the next eligible card to Lob. Provider acceptance means submitted, not mailed. A signed carrier event establishes mailing; later cards wait at least three months after the preceding actual mailing. Delays shift future dates instead of bunching overdue cards together.
6. Repeated jobs and webhooks cannot create duplicate sends. Address changes after printing begins hold remaining cards for team review.

The app generates QR images before Lob renders the cards. Keeping scheduling in the app also avoids depending on Lob's edition-specific advance scheduling, which is limited to 180 days. See [Lob delivery strategy](https://help.lob.com/print-and-mail/building-a-mail-strategy/choosing-a-delivery-strategy).

## Real provider verification

- The saved test key authenticated against both address and postcard APIs.
- The operator-provided return address was saved in the Lob test account. Only its ID was added to ignored local configuration. The street address and credentials are not in source control. A return address will be visible on physical mail; replace the home address with a PO box or business address before live sending if needed.
- Actual provider testing found a blocking HTTP 422: the self-contained artwork exceeded Lob's inline HTML size limit. New requests now upload HTML files using deterministic multipart bytes while preserving embedded brand images, fonts and QR codes.
- All four designs succeeded with HTTP 200 through the production transport helper, with the correct fictional recipient and rendered PDF proofs. An earlier multipart probe also created one fictional first-card proof.
- The rendered front and back were visually inspected. Each of the four QR codes was independently decoded from a screenshot of Lob's own rendered back and matched its expected collection/chapter path. No QR contained an owner key or recipient access credential.
- Test proofs used an explicit `https://example.com` placeholder origin and fictional return details. They do not establish a working public application, production return-address layout, or real recipient inbox access. The separately configured operator address was not used in shared screenshots.

Private provider responses and visual evidence are under `.data/qa-evidence/lob-e2e-2026-10-03/`, which is excluded from Git. Provider preview links expire.

## Automated regression coverage

Final validation: **263 tests passed, TypeScript passed, and the `.next-lob-e2e` production build passed**. The rebuilt local preview serves home and postcard examples successfully with outbound sending disabled. Test setup servers needed loopback listener permission; all test provider requests remained mocked.

- `postcard-lifecycle.test.ts` exercises all four cards through the protected jobs endpoint and signed webhook endpoint at months 0, 3, 6 and 9. Only synthetic KV storage and outbound providers are mocked.
- It checks recipient/address/approved artwork, matching chapter QR content, consent, no early dispatch, waiting for actual prior mailing, duplicate jobs/events, wrong provider references, invalid signatures and test-key rejection of live mailing evidence.
- `lob-transport.test.ts` verifies real-size embedded artwork and Unicode survive multipart serialization; retries retain identical bytes, boundary and idempotency key. Existing unmarked request snapshots remain unchanged for reconciliation.
- `postcard-proofs.test.ts` and delivery integration now require the same hosted security settings as public recipient sign-in. Local/test bypass cannot release public cards with missing sign-in security.
- `address-change-delivery.test.ts` proves untouched schedules can adopt an updated address, while submitted/mailed cards preserve their old provider payload and hold all later cards.
- Recipient privacy and account return tests cover wrong email, anonymous access, old recipient keys, browser-bound email verification and return to the selected chapter.

Lob test postcards do not receive real carrier tracking. The quarter-by-quarter run therefore uses signed synthetic events in isolated tests. A physical mailing and real recipient verification remain separate acceptance checks. See [Lob tracking documentation](https://help.lob.com/print-and-mail/getting-data-and-results/tracking-your-mail).

## Remaining configuration

| Dependency | Current state |
| --- | --- |
| Lob API key | Local test key verified; not a live key |
| Return address | Saved in Lob test account and ignored local config |
| Public HTTPS application | Not configured locally; latest reported Vercel deployment failed |
| Persistent hosted records and media | KV/private media configuration still required |
| Recipient email verification | Verified sender and Resend credentials still required |
| Hosted sign-in security | Turnstile site/secret keys and durable KV still required |
| Lob webhook | Public endpoint registration and signature secret still required |
| Recurring delivery worker | Cron secret and a functioning hosted scheduler still required |
| Outbound delivery | Remains disabled for the local rehearsal |

The existing Vercel configuration requests a five-minute cron. Prior deployment diagnostics identified a plan restriction; do not silently reduce frequency or purchase a plan. A running server on a personal computer is not a reliable nine-month scheduler.

Complete public hosting/storage/security and real recipient sign-in first. Then register the Lob webhook, configure the authenticated scheduler, and verify the deployed test flow. Switch to live credentials and enable physical sending only after an explicit live-mail decision. Shipping dates refer to dispatch, not guaranteed arrival dates.
