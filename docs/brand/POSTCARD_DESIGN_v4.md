# Time Tapestry postcards, woven keepsake v4

October 3, 2026. A focused revision of the v3 design at Tayloe's request: keep the full weave and white logo, make the front a little brighter and less brown, improve the back logo's bottom margin, and fill the website preview panel with the approved pattern.

## Changes

- The front gradient now uses the existing taupe `#756454` and sage `#939480` brand colors. The approved flowing-thread geometry and original fills remain unchanged at 32% opacity. The centered white lockup and composition are preserved.
- The front dedication is 24 CSS pixels (18 pt at print size), with shared typography values used by both rendering and overflow preflight. White text has at least 3.09:1 contrast across the gradient and darker pattern, meeting the large-text contrast threshold at the artwork's native size.
- The back logo moved up 26 CSS pixels. It now has 40 CSS pixels of clear space from both the left and bottom trim edges, approximately 0.42 inches. QR placement and Lob's postal clear area are unchanged.
- The website panel's pattern had a fixed 700-pixel width and negative bottom offset. It now fills the panel in both dimensions, preserving the approved SVG's cover behavior. The rendered SVG and panel bounds match, including the top edge.
- The sample cache version changed to `woven-keepsake-v4`. The marketing sample, new owner proofs, and newly generated Lob artwork use the same renderer. Historical approved artwork remains frozen until a new proof is explicitly approved.

## Verification

- All 29 relevant postcard design, format, and proof tests passed.
- The production build, including TypeScript validation, passed.
- One actual Lob test postcard was generated with fictional names and mailing addresses. Both sides were visually inspected for color, typography, padding and postal layout. No physical mail was sent.
- The production website preview was checked on both sides; the full-panel background and corrected logo spacing were verified.
- Physical paper and print color have not been verified.

[Actual Lob test proof](evidence/postcard-woven-v4-front-back.jpg)

[Website back and full background](evidence/postcard-woven-v4-website.jpg)

Private test metadata is in the ignored `.data/qa-evidence/postcard-woven-v4/` folder. No credentials or personal addresses are included in these references.
