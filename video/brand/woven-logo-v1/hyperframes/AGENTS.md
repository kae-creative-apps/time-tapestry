# Woven logo authoring

Read the HyperFrames composition and CLI skills before editing this project. Follow the parent DESIGN.md and preserve the approved v39 geometry.

`index.html` is generated. Edit the shared scene and motion files one directory above, then run `npm run build` here. Do not change the generated HTML directly.

Keep GSAP timelines deterministic, paused, and synchronously registered. Use only local media assets. Keep the initial state and backward seeking correct.

Run `npm run check` and the seek parity check before delivery. Rendering stays at one worker on this laptop. Use `hyperframes preview --background` for a persistent Studio handoff and verify its printed address.

This is an isolated motion study. Do not overwrite the approved production closer or publish without the user's authorization. Use new version folders for an approved design revision.
