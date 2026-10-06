# Time Tapestry front door

Build target: Gusto's live homepage observed October 6, 2026, adapted to the supplied Time Tapestry postcard PDF and existing brand. Direct build requested by Tayloe. Scope is the marketing homepage, not the recording or delivery workflow.

Designing a welcoming homepage for storytellers and their families, including people with little technical experience. Its job is to explain the gift and make starting or requesting a story easy. Keep the existing voice orb and cached conversation preview. No new microphone access, tracking, or external UI dependencies.

## Reference lock

Primary composition: https://gusto.com/ as observed in the live browser. Preserve its large centered hero, focused pair of actions, overlapping product showcase, spacious full-width section rhythm, and accessible product feature exploration. Do not copy its copy, proprietary artwork, red/pink gradient, typeface, customer claims, or business navigation.

Identity authority: Time Tapestry's Quicksand display, Inter body, original two-t mark, existing voice orb, and the user's new postcard artwork. Paper #FBFAF8 and ink #432E23 remain the reading system. The new cards supply sand #F1E6DB, sage #DADECF and clay #E5C8BB as product surfaces, not as low-contrast body text.

Refero full style research: Apron (11fe119c-6dc0-495d-8885-78a275967bb7), Zelt (04a3a1a2-a941-4fa4-a318-6f10b9a4f7bd), Workable (52cc147d-3e4e-49f6-aa14-571b7a72b50d). Reviewed after three searches across Gusto/HR product marketing, warm family storytelling, and confident marketing typography.

| Decision | Source and bounded role | Why |
| --- | --- | --- |
| Oversized centered headline and clear two-action row | Gusto live hero | Make the purpose and next step obvious. |
| Product showcase beneath the headline | Gusto product collage | Show the conversation, book and postcards instead of abstract feature claims. |
| Existing animated voice orb | Explicit user requirement and current product | Preserve the familiar voice experience without changing recording code. |
| Light canvas, dark high-contrast actions, broad spacing | Time Tapestry identity; Apron's spacing and CTA hierarchy only | Keep the site brighter, approachable and readable. No borrowed yellow or photography. |
| Soft corners and quiet flat surfaces | Zelt's component restraint only | Keep the layout warm without a grid of heavily shadowed boxes. |
| Alternating text/product section and clear benefit hierarchy | Workable's product communication only | Explain features using actual artwork. No borrowed palette or stock portraits. |
| Four selectable, captioned postcard designs | New supplied PDF; Gusto feature chooser | Make the new designs visible and easy to explore without autoplay. |
| 52px touch actions, keyboard access, reduced motion | Existing product standards and Refero craft | Support older readers and mobile users. |

## Content and media rules

Use faithful front previews from the new PDF. Sample Gigi/Sammie names match the existing fictional demo. Back artwork includes addresses and unverified QR destinations, so it is excluded from public assets. Preserve the original PDF privately as source evidence. No customer recordings or private account links appear on the homepage.

Product sequence: original four recorded chapters, source-based films and downloadable story book, personalized encouragement, optional further recorded stories and family questions. Keep record-only answers, optional faith questions, verified-email access, free pilot and postal-testing qualifications. No invented testimonials, adoption counts, fixed interview time, automatic-mail guarantees, or permanent-storage promises.

Hero product compositions are labeled as illustrations/sample designs. The orb is the real shared component; preview playback is the existing cached sample, not a live interview. No generated imagery is needed because real approved product assets and code-native interface components cover these roles.

Reject: dark brown full-page treatment, red/pink imitation of Gusto, copied payroll UI, invented social proof, decorative serif headline fragments, hidden core actions, autoplay sound, animated carousels, and changes to shared recording/orb internals.

## Verification

Verify desktop and mobile renders, 320px horizontal overflow, keyboard navigation, postcard selection, preview audio/modal behavior, CTA routes, reduced motion, typecheck, build and CI before merging. Attach final evidence and results to the handoff.
