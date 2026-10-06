# Time Tapestry postcards, complete stitch pattern v5

October 4, 2026. The final reference is Tayloe's 11:23 AM screenshot: retain the taupe-to-sage front and white logo, use the complete approved stitch pattern, and make it slightly more transparent. The card keeps its 6 by 9 format and readable personal-note back.

## Design decisions

- Full front: the exact `approved-interlocking-pattern_v39.svg` artwork replaces the single enlarged flowing ribbon. Its path geometry and fill remain unchanged. The 3000-pixel PNG covers the artwork through the bleed, centered without stretching or a visible image boundary.
- Pattern opacity is 22%, reduced from 32%, so the white logo and message stay prominent.
- Background remains the existing taupe `#756454` to sage `#939480` gradient. Logo, Quicksand typography, tagline and dedication positions stay consistent with the selected screenshot.
- The back retains the corrected equal left/bottom logo margins, private QR destination, public encouragement and clear postal area.
- New artwork uses `woven-keepsake-v5` to refresh website samples. Historical approved snapshots remain frozen and require a new approval to replace them.

Refero research reviewed [Palette Supply](https://palette.supply), [mishmash](https://mishmash.pt) and [mymind](https://mymind.com). The useful principles were clear visual hierarchy, distinct roles for background and lettering, and preserving the product artwork. Tayloe's latest screenshot sets the actual color and pattern direction. This revision does not introduce a new palette or typeface.

## Reproduction and checks

Run `node --import tsx scripts/export-postcard-pattern.ts` to export the unchanged approved stitch artwork as `public/brand/time-tapestry-ribbon-print-v1.png`. Existing approved assets and earlier proof evidence remain available.

The relevant postcard, ElevenLabs voice, interview agent, Lob transport and delivery tests passed: 59 tests. Outbound providers were mocked in those tests. One separate final Lob test postcard used fictional addresses to check provider rendering; it did not send physical mail. The new pattern is shared by website samples and newly generated print proofs.

Physical paper and print color remain unverified. The private provider manifest lives in ignored `.data/qa-evidence/postcard-repeat-v5-soft/`. The existing ElevenLabs agent, voice, API credentials and Lob return-address configuration were not changed by this design revision. Kaelyn's setup and remaining deployment requirements are documented in [the development handoff](../KAELYN_SETUP.md).

- [Final Lob test proof](evidence/postcard-repeat-v5-front-back.jpg)
- [Website preview](evidence/postcard-repeat-v5-website.jpg)

The final `.next-postcard-repeat-v5` production build passed, including TypeScript validation. Browser inspection confirmed the new sample artwork, softer pattern and full-panel background in the production preview.
