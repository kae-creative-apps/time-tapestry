# Brand motion

Production-closer/film-closer-v2.mp4 is the currently deployed story-film closer. Joining-hands-review contains the silent v3 review MP4 and the v3/v4 editable Remotion studies. v4 is the smoother 6.5-second, 60 fps revision; v3 is the existing 7-second, 30 fps review export. A rendered v4 MP4 is not included.

The review concepts express passing down through two t forms meeting like joined hands, then settling into the mark. They are not automatically approved replacements for the production closer. No rejected woven-logo or passing-stitch motion study is included. The woven-logo-v1 subfolder contains only the exact shared artwork dependency required by v3/v4 imports.

Source files are unchanged and preserve their relative paths. Use the Time Tapestry app repository and its package-lock.json for the reproducible dependency environment. At the repository root, run npm ci, then:

    npx remotion studio video/brand/joining-hands-v4/entry.tsx --no-open

Select TimeTapestryJoiningHandsSmooth. To render a new review version from the app repository:

    npx remotion render video/brand/joining-hands-v4/entry.tsx TimeTapestryJoiningHandsSmooth video/output/Time-Tapestry-Joining-Hands-Smooth-new-review.mp4 --codec=h264

The app pins Remotion packages to 4.0.532. The original app package.json is included in 06-Source-reference only as dependency reference. This designer kit is not a standalone deployed application, and contains no credentials or runtime dependencies.

Use a new output filename for every review revision. Preserve the exact finished silhouette and outlined wordmark. Keep motion calm and legible; avoid bounce, extra symbols, or replacement voice narration.

The copied v3 source README contains a link to the original repository's motion-preview directory. That directory is not part of this standalone handoff. Use the adjacent `Joining-hands-review/Time-Tapestry-Joining-Hands-v3.mp4` for the included preview.
