# Designer postcards, production template v7

October 6, 2026. The latest supplied eight-page postcard PDF is archived in `postcards/designer-2026-10-06-v2/`. Its SHA-256 and extraction details are recorded alongside it. Earlier approved sources and frozen mailing proofs remain unchanged.

The homepage displays faithful 1500 by 1000 lossless front previews. The shared print renderer now uses four distinct front designs: kindness, faith, generosity and encouragement. Their titles, logo, motif geometry and palettes come directly from the supplied PDF. Only the sample dedication text is removed from the print background. The renderer inserts the correct card number and the storyteller and recipient's first names, with HTML escaping and measured overflow checks.

New postcards carry the explicit `4x6` size marker: 600 by 408 CSS pixels, or 6.25 by 4.25 inches including bleed. The embedded front backgrounds are 1875 by 1275 pixels at 300 dpi. Previously saved 6x9 or unmarked historical proofs retain their original format and exact artwork bytes. No saved schedules or mailing switches were changed.

The supplied back's scan instructions extend into the larger relative address area required for a 4x6 card. The production back therefore uses a narrower left-side instruction column and a separate sender line. This keeps the original visual language while protecting the [official Lob 4x6 address area](https://s3-us-west-2.amazonaws.com/public.lob.com/assets/templates/postcards/4x6_postcard.pdf): x 258.39, y 156.03, width 315.21 and height 228 CSS pixels. Lob supplies the real postal address, postage and barcode. None of the example addresses or QR destinations from the designer PDF are reused.

The back contains only explicitly approved public encouragement and first names. Every actual QR targets its collection and chapter through the existing verified-email access route, with no bearer credential in the URL. Original interviews, chapter text and private blessings are not selected as public print copy.

## Verification

- 53 tests passed across renderer, format compatibility, draft preview, proofs, lifecycle, public consent, delivery and saved failure recovery. Provider requests were mocked. No Lob or email sends were made.
- Four chapter-to-design mappings and four distinct QR destinations were verified. The lifecycle assertion confirms new requests use 4x6; historical compatibility tests preserve saved formats.
- The ordinary 240-character public message fits at 12pt. Wide or multiline overflow, unsupported glyphs, and overlong names are held for revision instead of clipped.
- Chromium inspected through CUA confirmed all four backs stay inside the measured content, sender and caption bounds. The 240-character stress sample also fits.
- TypeScript and formatting checks passed after the template changes.

Review files are in `review/2026-10-06-postcard-designer-print-v1/`: eight self-contained HTML sides, eight 300dpi PNGs, the eight-page PDF, an HTML comparison page and a contact sheet. These use fictional Gigi/Sammie details and non-delivering example QR links. The extra long-message HTML is a layout stress fixture, not a fifth postcard.

The local PDF was rendered with WeasyPrint; Chromium was checked separately. This is not a Lob-provider proof or a physical print test. Color conversion, paper appearance and real-world QR scanning remain to be checked before mailing is enabled.
