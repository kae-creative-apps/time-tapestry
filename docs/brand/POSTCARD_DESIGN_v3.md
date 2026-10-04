# Time Tapestry postcards, woven keepsake v3

October 3, 2026. Tayloe approved this visual direction after reviewing the actual Lob test render: a full woven color front and a traditional personal-note back. The draft uses 6 × 9 inches so the existing 240-character public message limit remains readable alongside the QR and postal area. No live mailing is enabled by this design change.

## Reference and decisions

The supplied Time Tapestry brand board and exact approved v39 flowing-thread artwork are the primary sources. Refero searches returned no results during this pass. The studio voice guide and brand specialist review informed the concise printed instructions.

- Front: the exact flowing weave fills the entire face. It is not contained in a corner patch. Original geometry and fills are preserved at 32% opacity over an espresso-to-taupe gradient.
- Colors: espresso `#432e23`, taupe `#756454`, white logo, and the sage already embedded in the approved weave. Keep the current balance until a physical print sample confirms color. Do not redraw or recolor the approved artwork.
- White approved lockup centered above “Stories woven together.” A small “From [first name], for [first name]” dedication keeps the card personal.
- Back: white paper, espresso text, “Dear [first name],” the approved public encouragement, and the sender's first name. Visible scanning and email sign-in instructions sit beside the QR. No private interview excerpt or financial detail is selected automatically.
- One coordinated design covers all four messages. The separate owner approval of public wording and the intended-recipient email gate remain mandatory.

## Print specifications

- Trim: 9 × 6 inches. Artwork including bleed: 9.25 × 6.25 inches, or 888 × 600 CSS pixels at 96 dpi.
- Lob postal area: 4 × 2.375 inches, positioned from the official 6 × 9 template. Personal note finishes above it; QR and guidance remain to its left.
- QR: 1.5 inches square including a four-module quiet zone, generated at 600 pixels. Its URL contains no owner or recipient access key.
- Main note: Quicksand Medium, 25.5 pt for short messages, 22.5 pt for medium messages, 18 pt for longer messages. Salutation and signature: 15 pt. QR guidance: 13.5 pt; email instructions: 12 pt.
- Static TrueType print font is derived from the bundled Quicksand font. Its internal family is renamed Time Tapestry Print under the font license, and all encoded advances were checked against conservative preflight metrics. The original web/film font is unchanged.
- The background is exported directly from the approved SVG at 3000 pixels wide, exceeding 300 dpi at its print size. Logo artwork also exceeds 300 dpi at its placed size.
- HTML, fonts, logo, weave and QR are self-contained. The app sample, owner proof and Lob upload share the same renderer.

Lob specifies [TrueType font support and provider proofing](https://help.lob.com/print-and-mail/designing-mail-creatives/creative-formatting) and supplies the [6 × 9 mailing template](https://s3-us-west-2.amazonaws.com/public.lob.com/assets/templates/postcards/6x9_postcard.pdf). A physical sample remains necessary to judge paper, color conversion and real-world scanning.

## Verification and versioning

Four actual Lob test requests returned HTTP 200, using fictional recipient and return addresses. All eight rendered sides were inspected. Four QR codes decoded from the screenshot of Lob's rendered proofs match their respective chapter URLs. The test URLs use example.com, so these proofs do not establish public recipient access or live fulfillment.

The original test rounds remain in ignored QA storage. The early typography pass confirmed that static TTF restores the actual brand font in Lob. A clipping-container discrepancy also appeared in provider rendering and was removed. The final full-background version renders correctly.

New artwork carries a 6x9 marker. Historical approved snapshots retain their 4x6 format and exact frozen HTML; previews and delivery infer the format from each snapshot. Unsupported or mismatched faces are rejected. No historical approval is silently replaced by this design update.

- [Actual Lob front and back](evidence/postcard-woven-v3-front-back.jpg)
- [Actual Lob four-card set](evidence/postcards-woven-v3-lob.jpg)
- Private test manifests and logs: `.data/qa-evidence/postcard-woven-v3/`, excluded from Git.
- Reproduce the static font: `python scripts/export-postcard-font.py --check` with the pinned tooling noted in that script.

The test return address shown in these images is fictional. The operator's address and all credentials remain outside source control.

Final validation: 269 automated tests passed, TypeScript passed, and the `.next-woven-postcard-v3` production build passed. Tests include 90/91 and 160/161 character typography boundaries, the full 240-character note, pathological overflow rejection, escaped public text, historical format compatibility, mixed-size rejection and the four-card delivery lifecycle.
