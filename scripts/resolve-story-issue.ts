import { writeFile, readFile } from "node:fs/promises";
import {
  storyCorrectionTemplate,
  resolveStoryIssue,
  type StoryCorrection,
} from "../src/lib/collection/story-issues";

import { listCollections } from "../src/lib/collection/store";
import { SecurityError } from "../src/lib/security/policy";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "list" && args.length === 0) {
    for (const c of await listCollections()) {
      for (const issue of c.storyIssues ?? []) {
        if (issue.status === "open")
          process.stdout.write(
            JSON.stringify({
              collectionId: c.id,
              issueId: issue.id,
              chapterId: issue.chapterId,
              category: issue.category,
              createdAt: issue.createdAt,
            }) + "\n",
          );
      }
    }
    return;
  }
  if (command === "inspect" && args.length === 3) {
    const [collectionId, issueId, file] = args;
    const template = await storyCorrectionTemplate(collectionId, issueId);
    await writeFile(file, JSON.stringify(template, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(
      "Private correction draft saved. Listen to the saved recording, add exact supporting source excerpts, correct only the generated story, and set sourceReviewed to true. No application data changed.\n",
    );
    return;
  }
  if (
    command === "apply" &&
    args.length === 2 &&
    args[1] === "--source-reviewed"
  ) {
    const input = JSON.parse(
      await readFile(args[0], "utf8"),
    ) as StoryCorrection;
    const result = await resolveStoryIssue(input);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        auditId: result.auditId,
        filmsRequeued: result.filmsRequeued,
      }) + "\n",
    );
    return;
  }
  throw new Error(
    "Usage: list, inspect <collection-id> <issue-id> <private-output.json>, or apply <private-correction.json> --source-reviewed. Use the existing private server environment; never put credentials in arguments.",
  );
}
main().catch((error: unknown) => {
  process.stderr.write(
    (error instanceof SecurityError
      ? error.message
      : "The operation could not finish. Check the command, private JSON file and configured storage. Private source text and provider errors are not printed.") +
      "\nIf queueing failed after saving, repeat the same apply command. Saved originals and correction history remain intact.\n",
  );
  process.exitCode = 1;
});
