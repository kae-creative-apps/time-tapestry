# Verified email accounts

The account library connects existing collections to an email address only after that person proves access to the email inbox. A name or contact email entered when a collection is created does not authenticate anyone. Existing private collection links continue to work with their existing owner, recipient or requester permissions.

## Sign-in flow

1. Open `/account`, enter an email and complete the configured human verification.
2. The server issues a random, 15-minute, single-use link. Only a hash of the token and a hash of the requesting browser's nonce are stored.
3. The email link uses `/account/verify#token=...`. The fragment is not sent in navigation or access-log queries. The confirmation page passes it in the `X-Account-Verification` header to inspect the link, without consuming it.
4. The page shows the masked email and asks the person to confirm. Only the POST confirmation consumes the token and creates a session.
5. The link must open in the same browser that requested it. If it opens on another device or browser, request a fresh link there. This prevents an attacker from sending their own sign-in link to another person and silently signing that person into the wrong account.
6. The session is an opaque random HttpOnly, SameSite=Lax cookie. Only its hash is stored. Production cookies require HTTPS. Sessions expire after 30 days and are revoked on sign-out.

There is no debug-token response or local sign-in bypass. Tests inject a fake mail sender only when `NODE_ENV=test`; the public routes never expose that injection.

## Required deployment configuration

- `NEXT_PUBLIC_APP_URL`: the secure public website origin serving the account pages.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: a connected sending account and verified sender.
- Hosted security configuration, including Turnstile and persistent KV, described in `SECURITY_AND_STORAGE.md`.

Account sign-in emails are requested directly by the person signing in. They do not depend on the collection email queue or postcard enable flag. A missing sender or public origin produces a clear setup error. The UI does not claim a message was sent in this state. Mail provider acceptance is not proof of inbox delivery.

The link request is protected by human verification, a per-client limit, and a persistent per-address limit of four requests per hour with a one-minute cooldown. Per-address rate limit keys are opaque hashes. Raw credentials, private messages and contact emails are not logged by this implementation.

## Library permissions

The verified email is matched against the current collection contacts. Owner permission takes precedence if the person is also a recipient or requester.

- Owners can resume the interview or reopen their review portal, recordings, stories and postcard status.
- Recipients use their recipient permission and can see approved shared content only.
- Requesters use their requester permission, which does not expose the narrator's drafts, private recordings or recipient stories.

The library list contains safe summaries and same-origin open endpoints, without owner keys or media URLs. The open endpoint rechecks membership before redirecting to the corresponding existing private link. Changing a collection contact changes which verified account can retrieve it. Existing capability links are still bearer credentials and are not revoked by signing out of the account.

The first implementation scans the collection store and filters by verified email. It is appropriate for a small pilot, with a synthetic 32-collection library check. It is not an indexed account database. Before a large launch, add a durable email-to-collection index, bounded pagination and expired-auth-record cleanup. Expiry is enforced now, but expired login/session records are not automatically deleted.

## Verification performed

Local fixtures check token hashing, nonce binding, safe inspection, expiry, replay, concurrent single-use consumption, opaque session expiry/revocation, cookie settings, role-specific library access, cross-account rejection, provider configuration failures and a mocked fixed-origin email adapter. No real sign-in emails were sent during implementation. The account's provider connection, sending domain and live inbox delivery still require configuration and a deliberate end-to-end check.
