# Reviewing a reported story detail

Owners can flag a name, detail, missing context or other mismatch while reviewing their draft gift. They cannot edit the generated story. An open report blocks final digital approval until the team checks it or the owner withdraws the report. Reports and correction history are private to the storyteller and authorized operators.

This workflow corrects generated prose against the person's saved original recording. It never changes their original recording, transcript or selected answers, and it does not provide a post-interview re-record action.

## Environment and private working files

Run from the repository root, using Node and the installed dependencies, in an authorized environment connected to the same private collection storage and media as the website. The CLI does not load `.env.local` automatically. Use the existing server environment or, if necessary, Node's `--env-file=/absolute/private/path/to/environment` option before `--import tsx`. Confirm the target environment before applying a correction. Without cloud storage variables, the storage layer uses the local `.data/collections` directory, which is not the production collection store.

Do not put credentials in command arguments, this document, Git, terminal output or an issue report. Environment files and correction files stay outside the repository and shared folders. Collection IDs and report IDs are operational references, not authentication keys. Do not paste private source material into shared logs or messages.

Create a private temporary working directory:

```sh
story_review_dir="$(mktemp -d "${TMPDIR:-/tmp}/time-tapestry-review.XXXXXX")"
chmod 700 "$story_review_dir"
```

The inspect command below creates its JSON file with mode `0600` and refuses to overwrite an existing file. It contains private story text, transcripts, media references and source fingerprints. Use a local editor that preserves private file permissions. If your editor replaces the file, restore `0600` before applying it:

```sh
chmod 600 "$story_review_dir/correction.json"
```

## Find and inspect a report

List open reports:

```sh
node --import tsx scripts/resolve-story-issue.ts list
```

The command prints one JSON line per open report with its collection ID, report ID, chapter ID, category and creation time. It does not print story text, names, email addresses or credentials. The queue is read-only. An empty list only means that the configured storage returned no open reports, so check the environment if a known report is missing.

Copy the relevant IDs into this command, replacing the angle-bracket placeholders:

```sh
node --import tsx scripts/resolve-story-issue.ts inspect '<collection-id>' '<issue-id>' "$story_review_dir/correction.json"
```

This writes a private correction draft without changing the application. It includes the current generated `content`, version fingerprints, `sourceReferences` and an empty `evidence` list. The copied references help locate the originals. They are not trusted as evidence when applying the correction; the server storage is read again.

## Review the original, then prepare the correction

1. Open the referenced recordings through existing authorized private media access. Listen to the original answer and enough surrounding context to understand it. Do not rely only on a potentially imperfect transcript.
2. Compare the reported detail with the generated story. Correct only `content`, preserving the person's meaning, perspective and context. If the wording is already accurate, leave it unchanged and still document the source check.
3. Add one or more entries to `evidence`, each with the current source `takeId` and an exact supporting excerpt from that source's saved transcript. Use the `sourceReferences` entries to find those IDs and excerpts.
4. Set `sourceReviewed` to `true` only after completing that human review. Keep all three `expected...Hash` fields and the collection/report IDs unchanged.

Evidence has this shape. Replace the illustrative values with the actual matching source:

```json
{
  "takeId": "selected-source-id",
  "quote": "An exact excerpt from the selected source transcript."
}
```

There must be 1 to 20 evidence entries. Each quote must be 3 to 4,000 characters and appear exactly in the current selected answer with an owned, saved original recording. The story content limit is 32,000 characters.

These checks establish source and version consistency. They do not automatically prove that the rewritten narrative is semantically faithful or that a name is spelled correctly. The operator's source-listening attestation is required. If the audio and transcript disagree, do not invent an excerpt, alter the original transcript or bypass the checks. Leave the report open and escalate it for a source-preserving resolution.

## Apply and verify

```sh
node --import tsx scripts/resolve-story-issue.ts apply "$story_review_dir/correction.json" --source-reviewed
```

Both `sourceReviewed: true` in the file and the explicit `--source-reviewed` flag are required. The CLI prints a compact success result containing `ok`, `auditId` and `filmsRequeued`. It does not print the correction text or raw provider errors.

Before saving, the operation rechecks the current draft, report, selected sources and fingerprints under a collection lock. It rejects approved gifts, outdated drafts, withdrawn reports, conflicting versions and active story or film preparation. It never changes an already approved gift. If preparation is still active, wait for it to settle and inspect again. If the source or story changed, create a new inspection file and review the current version instead of editing the fingerprints.

The correction preserves an append-only private audit record containing the prior chapters, preparation reference, correction and evidence. When the wording is unchanged, it resolves the report without resetting the films. When the wording changes, it:

- Saves the corrected story and preserves existing original media and old film provenance.
- Clears the four current film attachments and their review marks so the gift cannot use stale films or approvals.
- Detaches the old preparation reference so its cached draft cannot overwrite the correction.
- Suppresses obsolete, unattempted preparation notices and queues replacement films from the existing original recordings.
- Requires the storyteller to review the replacement films and approve the gift again. Other open reports still block approval.

Confirm that the collection returns to the expected preparation/review state, all four replacement films finish when requeued, the changed chapter reflects the source, and unrelated private recordings remain available. No correction command sends a postcard or approves a gift. Existing automatic preparation and notification workers continue under their configured permissions and delivery flags.

## Recover a failed handoff

Saving the corrected draft and audit happens before the film queue handoff. If queueing fails after the save, repeat the same apply command with the exact same correction file:

```sh
node --import tsx scripts/resolve-story-issue.ts apply "$story_review_dir/correction.json" --source-reviewed
```

The matching audit and current source fingerprints allow an idempotent retry. Film queue IDs are deduplicated. Do not change the file between retries, reset issue status manually, delete the audit or clear source records. If another correction or source change occurred, the retry is refused and a fresh review is needed.

Keep the private correction file until the handoff and review state are verified. Then remove that temporary file and directory according to the team's private-data retention practice. The application's private correction history remains the durable record.

## Monitor reports and preparation attention

Run `list` during the team's operating checks and after a user reports a blocked approval. Reports stay open until checked or withdrawn. No staff email destination, recurring report-monitoring task or support-ticket integration is configured by this feature. The team must own this queue and tell the storyteller when a manual intervention is needed.

Film or preparation failures are separate from factual story reports. Check the existing preparation attention state, worker health and queued notification status after any requeue. A resolved story report does not prove that rendering or notification delivery succeeded. Do not repeatedly apply a successful correction to repair a terminal render failure; use the established preparation recovery workflow and preserve the audit trail.
