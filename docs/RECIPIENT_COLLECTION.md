# Private recipient collection and printable story book

October 5, 2026. This is the current product direction on the working branch. See the final verification record for combined test and build results; this document does not establish a deployment or real inbox delivery.

## One collection, personal access

An approved collection contains four films made from the storyteller's original recordings and four read-only written chapters. The private page introduces the storyteller, addresses the signed-in recipient by their supplied name, and keeps the films, reading copy and replies together. When an additional invitation has no supplied name, the page uses a welcoming generic salutation. It does not guess a name from an email address.

The owner may invite additional recipients by email after approval. There is no five-person product limit. Invitations are processed in batches of up to 25 with the existing abuse protections, and the owner may invite another batch. Duplicate active invitations do not create another recipient or send another email. Removing an additional recipient blocks future account access and suppresses pending invitation emails. Previously downloaded files cannot be withdrawn from a person's device.

Digital sharing does not add physical postcards. The existing primary recipient remains the single postcard recipient, with one mailing address and the existing four-card schedule. Existing postcard links, primary-recipient replies and historical collections remain supported.

## Privacy and replies

- A QR code or link only locates the collection. The recipient must verify the matching email account before opening it. Old recipient bearer keys alone do not unlock stories, media or the book.
- Additional recipients receive access to the approved stories and their own reply history. They do not receive other recipients' email addresses, replies, uploaded reply recordings, the primary mailing address or delivery records.
- New replies and uploaded reply media are bound on the server to the authenticated recipient. Legacy untagged recipient records belong to the primary recipient.
- After a film ends, the recipient can write a private message to the storyteller. The saved reply appears in the storyteller's portal and queues an email notification. A queued or provider-accepted notification is not proof of inbox delivery.
- Original interview recordings, source references, unfinished drafts and private notes are not part of the recipient page or book export.

## Downloadable book

`GET /api/collection/{id}/book` produces a real PDF attachment for an approved collection. It uses the same owner or verified-recipient authorization as the private portal. Requester access, an unverified email, a revoked additional recipient and an unapproved collection cannot download it.

The PDF contains a branded cover with the storyteller and recipient names, followed by all four approved written chapters. Approved encouragement or Scripture already included in the collection is retained. Long stories continue onto additional pages without truncation. The document uses the existing approved logo, embedded Quicksand font, readable 14-point body text and US Letter pages. The PDF is generated in memory, returned with private no-store headers, and is not uploaded to a public file service.

The export uses an allowlisted snapshot. It excludes email addresses, member lists, access keys, private links, replies, source recordings and internal notes. Metadata identifies Time Tapestry without personal contact information. The recipient cover uses only the authenticated recipient's supplied name. An owner's download uses the primary recipient's name.

The current print font supports Latin names, accents and standard punctuation. If a supplied character cannot be rendered, the download returns a clear error instead of silently removing that character. Broader language support needs an additional licensed font and layout QA. Source stories remain unchanged.

## Operational checks

1. Install the locked dependencies, including `pdf-lib` and `@pdf-lib/fontkit`. The web app, not the film worker, creates the PDF. It does not call an external PDF service or start Chromium.
2. Ensure the deployed book route includes `public/brand/fonts/quicksand-print-medium-v1.ttf` and `public/brand/time-tapestry-lockup.png` in its server file trace. Test a real hosted download after deployment.
3. Test two distinct recipient accounts, a wrong account, an old recipient key, revoked access and a missing name. Confirm each person sees only their own replies and personalization.
4. Finish each film on a phone and desktop, send a reply, leave and return, then check the storyteller's portal and inbox. Verify duplicate submissions do not produce duplicate replies or notifications.
5. Download a short book and a long book. Inspect the cover, all four chapters, accented names, page breaks and the last sentence. Print or use the operating system's print preview to confirm margins.

Automated PDF coverage lives in `tests/story-book.test.ts`. It decodes the PDF's embedded text to verify complete chapters, long pagination, Unicode accents and the absence of private fields. Recipient membership, media isolation and invitation delivery are covered separately by the additional-recipient and account tests. These checks do not replace the hosted and inbox checks above.
