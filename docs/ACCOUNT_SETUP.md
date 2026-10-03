# Verified email accounts

The account library connects existing collections to an email address only after that person proves access to the email inbox. A name or contact email entered when a collection is created does not authenticate anyone.

Recipient access always requires a verified account whose email matches the collection's current recipient email. A postcard QR is a keyless locator such as `/collection/{id}/chapter/q1`. Scanning it does not grant access. An anonymous or incorrectly signed-in visitor sees a generic email sign-in gate, with no storyteller name, recipient email, story text or media. Missing and unauthorized collections receive the same response. Old recipient keys no longer authorize collection reads, replies, recording playback or uploads.

Private owner and requester links retain their existing bearer permissions. Keep those links private. They are separate from the recipient's email-gated access.

## Sign-in flow

1. Open `/account` or a recipient collection, chapter or address link, enter an email and complete the configured human verification.
2. The server issues a random, 15-minute, single-use link. Only a hash of the token and a hash of the requesting browser's nonce are stored.
3. The email link uses `/account/verify#token=...`. The fragment is not sent in navigation or access-log queries. The confirmation page passes it in the `X-Account-Verification` header to inspect the link, without consuming it.
4. The page shows the masked email and asks the person to confirm. Only the POST confirmation consumes the token and creates a session.
5. The link must open in the same browser that requested it. If it opens on another device or browser, request a fresh link there. This prevents an attacker from sending their own sign-in link to another person and silently signing that person into the wrong account.
6. The session is an opaque random HttpOnly, SameSite=Lax cookie. Only its hash is stored. Production cookies require HTTPS. Sessions expire after 30 days and are revoked on sign-out.
7. A request begun from a recipient link stores only a validated collection locator and an optional chapter or address view. After verification, the server returns that same local destination without a key. Arbitrary redirect URLs are rejected. Collection and media endpoints then independently recheck the intended recipient's verified email.

There is no debug-token response or local sign-in bypass. Tests inject a fake mail sender only when `NODE_ENV=test`; the public routes never expose that injection.

## Required deployment configuration

- `NEXT_PUBLIC_APP_URL`: the secure public website origin serving the account pages.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: a connected sending account and verified sender.
- Hosted security configuration, including Turnstile and persistent KV, described in `SECURITY_AND_STORAGE.md`.

Account sign-in emails are requested directly by the person signing in. They do not depend on the collection email queue or postcard enable flag. A missing sender or public origin produces a clear setup error. The UI does not claim a message was sent in this state. Recipients cannot use an old key to bypass unavailable email verification. Mail provider acceptance is not proof of inbox delivery.

Postcard readiness also requires this account email setup. A new mailing stays on hold if the recipient cannot request a verification email, including when email configuration becomes unavailable after a schedule was released.

The link request is protected by human verification, a per-client limit, and a persistent per-address limit of four requests per hour with a one-minute cooldown. Per-address rate limit keys are opaque hashes. Raw credentials, private messages and contact emails are not logged by this implementation.

## Library permissions

The verified email is matched against the current collection contacts. Owner permission takes precedence if the person is also a recipient or requester.

- Owners can resume the interview or reopen their review portal, recordings, stories and postcard status.
- Recipients open a keyless collection or chapter path using their verified session. They can see approved shared stories and included films, and send replies. Private source recordings remain owner-only.
- Requesters use their requester permission, which does not expose the narrator's drafts, private recordings or recipient stories.

The library list contains safe summaries and same-origin open endpoints, without owner keys or media URLs. The open endpoint rechecks membership. It sends recipients to a keyless locator and owners or requesters to their corresponding private capability link. Changing a collection contact changes which verified account can retrieve it. Owner and requester capability links remain bearer credentials and are not revoked by account sign-out; recipient keys do not grant access.

An authorized portal's **My stories** link can retain a validated local return destination in the same tab's session storage for 30 minutes. This supports **Back to my collection**, including keyless recipient chapter and address paths. It is cleared on sign-out. Private return links are not saved in persistent local storage. The saved-link input accepts only local collection or interview routes and does not bypass server authorization.

The first implementation scans the collection store and filters by verified email. It is appropriate for a small pilot, with a synthetic 32-collection library check. It is not an indexed account database. Before a large launch, add a durable email-to-collection index, bounded pagination and expired-auth-record cleanup. Expiry is enforced now, but expired login/session records are not automatically deleted.

## Verification performed

Local fixtures check token hashing, nonce binding, safe inspection, expiry, replay, concurrent single-use consumption, opaque session expiry/revocation, cookie settings, role-specific library access, cross-account rejection, provider configuration failures and a mocked fixed-origin email adapter. Recipient privacy tests exercise collection reads and writes, chapter film playback, local uploads and direct upload tokens. Anonymous requests, old recipient keys, wrong emails, revoked sessions and unverified accounts are denied without exposing collection details. Tests also cover safe collection, chapter and address return paths and rejection of unsafe redirect targets.

No real sign-in emails were sent during implementation. The account's provider connection, sending domain and live inbox delivery still require configuration and a deliberate end-to-end check. See `DELIVERY_SETUP.md` for public postcard consent and the mailing hold policy.
