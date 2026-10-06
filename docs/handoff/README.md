# Time Tapestry project handoff

Prepared October 4, 2026 for Kaelyn and Tayloe. This is the starting point for the application, presentation and creative materials. The repository is public. Credentials, private recordings, customer records and internal meeting exports are not part of this package.

## Start here

**October 5 policy update:** new interviews are recorded video with sound or audio only, and new films keep the storyteller's original voice. The end-user flow is listen, record again if needed, keep the answer and give one final approval. Editable transcripts, written stories, private notes and Scripture fields are removed from that flow; existing saved data stays preserved. Only separate public postcard encouragement remains editable. Read [the current QA and remaining checks](../QA_2026-10-05_RECORDING_ONLY.md) and [story editing rules v2](../../video/STORY_EDITING_RULES_v2.md) before using older demos. New gifts use a biweekly postcard cadence; existing legacy gifts retain their saved quarterly cadence.

Approved collections now support additional private digital invitations, with no five-person product limit. Physical postcards still go to one primary recipient. The recipient page brings together the four films, read-only stories, private replies and a personalized PDF book. See [recipient access and book operations](../RECIPIENT_COLLECTION.md) for the current boundaries and remaining hosted checks.

1. Current work is on `codex/four-story-templates`. Compare the reviewed commit with concurrent work and the deployed revision before merging. The earlier October 4 handoff was on `codex/four-chapter-legacy` in [PR #1](https://github.com/kae-creative-apps/time-tapestry/pull/1).
2. Follow [Kaelyn's setup guide](../KAELYN_SETUP.md). The restricted environment-file handoff supplies the existing ElevenLabs connection and Lob test connection. Preserve an existing local environment file instead of overwriting it.
3. Run the web application and the [separate story-film worker](../STORY_FILM_WORKER.md). Configure their shared storage consistently.
4. Work through the [current readiness checklist](READINESS_2026-10-04.md). Passing local tests is separate from verifying a public deployment, real inbox delivery or physical mail.

## What is included

| Material | Location | Status |
| --- | --- | --- |
| Application, integration code, prompts, tests and locked dependencies | Repository root, `src/`, `scripts/`, `tests/`, `package-lock.json` | Current implementation on this branch |
| Original-voice story-film renderer and branded closer | [Film worker](../STORY_FILM_WORKER.md), [video source](../../video/), [runtime brand assets](../../public/brand/) | Automatic four-film assembly exists; real-interview editorial QA and hosted worker operation still need verification |
| Private digital invitations, recipient replies and downloadable story book | [Recipient collection guide](../RECIPIENT_COLLECTION.md) | Authenticated, personalized PDF export and recipient isolation implemented; hosted download, playback and inbox QA still required |
| Editable pitch deck, PDF, presenter script and slide overview | [Presentation archive](presentation/README.md) | Preserved October 2 v3 rehearsal draft; update before presenting |
| Brand wording in Word and PDF | [Word](brand/wording-v1/Time_Tapestry_Brand_Wording_v1.docx), [PDF](brand/wording-v1/Time_Tapestry_Brand_Wording_v1.pdf) | User-supplied working brand wording; use current product behavior when making capability claims |
| Editable brand presentation and asset sheet | [PowerPoint](brand/kit-v39/presentation/Time_Tapestry_Brand_Presentation_v39.pptx), [PDF](brand/kit-v39/presentation/Time_Tapestry_Asset_Sheet_v39.pdf) | Consolidated v39 identity reference; older postcard examples are superseded by the app's v5 design |
| Additional logo, wordmark and gradient exports | [Assets](brand/kit-v39/assets/) | Design handoff exports; the application already contains its runtime assets |
| Editable palette and licensed font files | [Palette](brand/kit-v39/source/color-tokens_v39.json), [fonts and licenses](brand/kit-v39/source/) | Original source files, including font licenses |
| Latest website narration and storyboard notes | [Website film handoff](website-film/README.md) | Editorial v5 drafts, not a finished or approved movie |
| Current postcard artwork and evidence | [Postcard design v5](../brand/POSTCARD_DESIGN_v5.md), [front/back proof](../brand/evidence/postcard-repeat-v5-front-back.jpg) | Approved full stitch repeat, 22% opacity, 6 by 9 format; Lob test proof only |
| Operations and recovery instructions | [Accounts](../ACCOUNT_SETUP.md), [delivery](../DELIVERY_SETUP.md), [security/storage](../SECURITY_AND_STORAGE.md), [backup runbook](../BACKUP_RUNBOOK.md) | Implementation and setup instructions; hosted configuration still needs verification |

The [asset manifest](ASSET_MANIFEST.json) records the source version, size and SHA-256 of each copied creative file. Source paths in that manifest are provenance relative to the studio's client folder, not commands to run. Original files were preserved without modification.

## Which reference wins

For current product behavior, start with [October 5 recording-only QA](../QA_2026-10-05_RECORDING_ONLY.md), [editing rules v2](../../video/STORY_EDITING_RULES_v2.md) and [the film-worker guide](../STORY_FILM_WORKER.md). [October 3 QA](../QA_2026-10-03.md) and [the October 4 setup guide](../KAELYN_SETUP.md) provide earlier context. Older meeting notes, slides and video-validation records describe earlier builds. They are historical evidence, not current operating instructions.

For today's application postcard, use [v5](../brand/POSTCARD_DESIGN_v5.md), the existing approved SVG pattern paths and the shared print renderer. Preserve the white logo, complete stitch pattern and selected taupe-to-sage field. Do not restore old 4 by 6 layouts or rejected brand variants from earlier presentation examples.

The website marketing film, hackathon demonstration video and four films produced from each interview are three separate deliverables. Completing one does not complete the others.

## What still lives outside GitHub

- The restricted `.env.local` handoff and provider account permissions. Personal Codex plugin sessions are not portable application credentials.
- Original recordings, contacts, private story collections, access links, generated customer films and backup snapshots. Use an authenticated storage transfer and test restoration. A repository clone is not a recording backup.
- The complete in-progress marketing-film media project and its large source assets. Its latest scripts are included here; coordinate a private media handoff with Tayloe before resuming that edit. See [film status](website-film/README.md).
- Running servers, the render-worker process, hosted environment settings, verified sending domains, webhooks and recurring-job configuration. These require setup in the destination environment.

No entry submission, live mailing, public deployment or independent cloud backup is established by pushing this handoff.
