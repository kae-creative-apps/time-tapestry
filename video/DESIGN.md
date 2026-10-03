# Time Tapestry video direction

## Visual direction

A restrained family documentary using the October 2 brand reference. The person's face and voice carry the story. The rounded, woven t icon and lowercase wordmark come from `src/lib/brand-art.ts`. Remotion renders the shared `BrandArtwork` component, so its lettering cannot drift from the app. HyperFrames uses the exported SVG of the same master artwork.

## Colors

- Paper #fbfaf8: title and closer backgrounds, light text over footage.
- Espresso #432e23: primary titles, the logo and video canvas.
- Taupe #756454: secondary titles and the closer tagline.
- Sage #939480 and clay #c18f7b: supporting brand colors, reserved for future approved treatments.

Remotion reads `BRAND_COLORS` directly. The standalone HyperFrames project mirrors the paper, espresso and taupe values.

## Typography

The logo is vector artwork with no font dependency. Titles and the closer tagline use Arial Rounded MT Bold, then Trebuchet MS, Arial and sans-serif fallbacks. Captions stay in Arial for clarity. Quicksand is used by the web app but is not yet bundled into either video renderer. Rendering on another machine may change title metrics until a licensed local font is included and loaded before capture.

## Motion

A short fade and 18px rise introduce titles and the shared logo. The tagline fades in after the logo. There is no movement over a speaking face. Captions remain steady. The closer lasts four seconds.

## Asset maintenance

From the repository root, run `node --import tsx scripts/export-brand.ts`. This regenerates the public SVG/PNG assets and `video/hyperframes/assets/time-tapestry-lockup.svg` from the master geometry. Do not draw or retype a separate wordmark in a template.

## Content boundaries

- Keep the person's original face and voice.
- Do not add decorative stock footage or synthetic family photographs.
- Do not remove a pause merely because it is quiet.
- Do not generate new wording or new cuts during playback.
- Review a new rendered cut before real delivery. Source updates do not verify the finished film.
