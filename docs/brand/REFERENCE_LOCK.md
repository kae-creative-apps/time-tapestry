# Time Tapestry brand direction

Approved by Tayloe on October 2, 2026. The shared application brand implementation is complete. Browser QA and rendering scope are recorded below.

The supplied direction board owns the palette, rounded typography, photographic warmth and clear, quiet surfaces. The separately supplied monogram owns the icon geometry. The wordmark must use matching custom lowercase t letterforms wherever the brand is displayed.

## Implementation decisions

| Decision | Source | Role |
| --- | --- | --- |
| Almost-white canvas and espresso text | Approved direction board | Primary surfaces and readable text |
| Sage, clay and taupe accents | Approved direction board | Supporting surfaces, never low-contrast small text |
| Rounded sans headings | Approved direction board | Display hierarchy, replace the earlier serif style |
| One monogram and one wordmark definition | Approved monogram | Reuse in navigation, cards, print, video and favicon |
| Consistent rounded controls and generous spacing | Fruitful, Refero style d8a01033-6c9d-46ef-87c2-1a67780a9a8d | Borrow interface clarity only |
| Flat surfaces, minimal shadows | Say Briefly, Refero style 2dab5b15-55c1-4835-8d8b-0d42f67604bc | Borrow restraint only |

Do not reintroduce the angular placeholder mark, a serif wordmark, burgundy primary actions or artificial paper noise. References support the approved direction; they do not replace it. Existing interview, recording and delivery behavior must remain intact.

Original supplied references are preserved as approved-direction.png and approved-monogram.png.

## Master artwork and use

The icon is a vector recreation of the provided screenshot, which is preserved unchanged for comparison. The lowercase wordmark is custom vector lettering; all three t glyphs reuse one path with the monogram’s rounded stem, crossbar and turned foot. It does not depend on an installed font.

Source: `src/lib/brand-art.ts`. React renderer: `src/components/BrandArtwork.tsx`. Linked/unlinked UI variants: `src/components/Logo.tsx`. Run `node --import tsx scripts/export-brand.ts` after changing geometry to regenerate public SVG/PNG variants, the favicon and the HyperFrames asset. Do not hand-edit exported copies. The `/brand` route is an unlisted, noindex review/download page.

Headings use Quicksand; body text uses Inter. The previous `font-serif`, `oxblood` and `forest` class names remain compatibility aliases pointing to the new rounded display font, espresso actions and readable dark sage status colors.

Hero photograph: `public/brand/story-exchange.png`, generated as illustrative brand photography with image_gen on October 2, 2026. It depicts a fictional postcard exchange and is not evidence of a real customer. Original input board is unchanged.

## Scope and checks

- Shared navigation, admin, setup, interview, story/review screens inherit the same logo, typography, palette and controls.
- Postcard UI, print HTML, email templates and video templates use the same logo assets. Shipping/email behavior is unchanged.
- Browser inspection confirms Quicksand and Inter loaded, hero image loaded, and no horizontal overflow on the landing and interview pages at 390px.
- Desktop and mobile screenshots are stored in `docs/brand/evidence/`.
- This branding pass does not constitute a live voice test, a mailed print proof, an email-client compatibility test or an approved exported film.
