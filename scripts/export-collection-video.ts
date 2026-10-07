/** Trusted operator CLI. Exports accepted takes, then imports reviewed-edit renders without publishing. */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { put } from "@vercel/blob";
import {
  dataRoot,
  getCollection,
  getMedia,
  mutateCollection,
  putMedia,
} from "../src/lib/collection/store";
import { mediaBytes } from "../src/lib/collection/media";
import { selectedAnswers } from "../src/lib/collection/content";
import type { Collection, StoredMedia } from "../src/lib/collection/types";
import {
  type ChapterVideoPlan,
  safeMediaPath,
  validateVideoPlan,
} from "../src/lib/video-plan";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
};
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const snapshot = (c: Collection) =>
  digest(
    JSON.stringify({
      id: c.id,
      storyteller: c.storyteller,
      selected: c.selectedTakeIds,
      chapters: c.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        content: ch.content,
        postcardNote: ch.postcardNote,
        sourceTakeIds: ch.sourceTakeIds,
        answers: selectedAnswers(c, ch.id),
      })),
      blessings: c.chapterBlessings,
    }),
  );
type Manifest = {
  schemaVersion: 1;
  collectionId: string;
  snapshotSha256: string;
  createdAt: string;
  chapters: {
    chapterId: string;
    planFile: string;
    captionStatus: "needs-alignment" | "text-only";
  }[];
};

async function exportPlans() {
  const c = await getCollection(option("--collection"));
  if (!c) throw new Error("Collection not found");
  if (c.status === "approved")
    throw new Error(
      "Approved collections are immutable; create a new draft revision first",
    );
  if (c.chapters.length !== 4)
    throw new Error(
      "Create all four story drafts before exporting video plans",
    );
  const work = path.resolve(option("--work-dir"));
  if (work.split(path.sep).includes("public"))
    throw new Error(
      "The workspace must be private, never in a public asset folder",
    );
  await mkdir(path.dirname(work), { recursive: true, mode: 0o700 });
  await mkdir(work, { mode: 0o700 }); // New workspace only. Never overwrite another edit.
  await mkdir(path.join(work, "media"), { mode: 0o700 });
  await mkdir(path.join(work, "plans"), { mode: 0o700 });
  const liveAnswers = c.chapters
    .flatMap((chapter) => selectedAnswers(c, chapter.id))
    .filter((take) => take.liveSource?.sourceRanges.length);
  if (liveAnswers.length) {
    const mediaIds = [
      ...new Set(
        liveAnswers.flatMap((take) =>
          take.liveSource!.sourceRanges.map((range) => range.mediaId),
        ),
      ),
    ];
    const originals = [];
    for (const mediaId of mediaIds) {
      const media = await getMedia(mediaId);
      if (!media || media.collectionId !== c.id || media.role !== "owner")
        throw new Error(
          "A live conversation original is missing or belongs to another collection",
        );
      const bytes = await mediaBytes(media);
      const ext = media.mimeType.includes("mp4")
        ? ".mp4"
        : media.mimeType.includes("ogg")
          ? ".ogg"
          : media.mimeType.includes("mpeg")
            ? ".mp3"
            : media.mimeType.includes("wav")
              ? ".wav"
              : media.mimeType.includes("quicktime")
                ? ".mov"
                : ".webm";
      const relativePath = `media/${mediaId}${ext}`;
      await writeFile(path.join(work, relativePath), bytes, {
        flag: "wx",
        mode: 0o600,
      });
      originals.push({
        mediaId,
        relativePath,
        mimeType: media.mimeType,
        sha256: digest(bytes),
        archiveRef: `collection-media:${mediaId}`,
        originalPreserved: true,
      });
    }
    const guidePath = path.join(work, "conversation-source-ranges.json");
    await writeFile(
      guidePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          collectionId: c.id,
          snapshotSha256: snapshot(c),
          status: "needs-editor-alignment",
          instructions: [
            "These files are complete original recordings, not finished story videos.",
            "Estimated turn times come from browser events and are not verified speech boundaries. Unaligned turns may reference every recording in their session.",
            "Listen to each original and create a reviewed edit plan using verified in/out times. Do not repeat the whole recording once per answer.",
            "Preserve the originals, omit interviewer speech where appropriate, align captions, and review the final video before attaching it to the gift.",
            "This packet is intentionally not a renderable plan. The standard exporter cannot certify these live conversation edits.",
          ],
          originals,
          answers: liveAnswers.map((take) => ({
            id: take.id,
            text: take.text,
            prompt: take.prompt,
            ...take.liveSource,
          })),
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    throw new Error(
      `Live conversation timing needs editorial alignment. Originals and a source guide were exported to ${guidePath}. No automatic video plan was created.`,
    );
  }
  const manifest: Manifest = {
    schemaVersion: 1,
    collectionId: c.id,
    snapshotSha256: snapshot(c),
    createdAt: new Date().toISOString(),
    chapters: [],
  };
  for (const [chapterIndex, chapter] of c.chapters.entries()) {
    const takes = selectedAnswers(c, chapter.id);
    if (
      !takes.length ||
      takes.some((take) => !chapter.sourceTakeIds.includes(take.id))
    )
      throw new Error(
        "Story drafts must match the currently selected takes; regenerate the drafts first",
      );
    const plan: ChapterVideoPlan = {
      schemaVersion: 1,
      id: randomUUID(),
      sessionId: c.id,
      chapterId: chapter.id,
      chapterNumber: (chapterIndex + 1) as 1 | 2 | 3 | 4,
      revision: 1,
      title: chapter.title,
      storytellerName: c.storyteller.name,
      sources: [],
      clips: [],
      approval: null,
    };
    for (const take of takes) {
      if (!take.mediaId || take.kind === "text") {
        const chunks = take.text.match(/[\s\S]{1,450}(?:\s|$)/g) || [take.text];
        for (const [index, text] of chunks.entries()) {
          if (!text.trim()) continue;
          plan.clips.push({
            id: `${take.id}-text-${index}`,
            sourceAnswerId: take.id,
            kind: "text",
            inMs: 0,
            outMs: Math.max(
              6000,
              Math.ceil((text.trim().split(/\s+/).length / 2.5) * 1000),
            ),
            captions: [],
            text: text.trim(),
            editorialReason:
              "Unedited accepted typed answer. Confirm readability and wording before approving the edit.",
          });
        }
        continue;
      }
      const media = await getMedia(take.mediaId);
      if (!media || media.collectionId !== c.id || media.role !== "owner")
        throw new Error(
          "Accepted source media is missing or belongs to another collection",
        );
      const bytes = await mediaBytes(media);
      const ext = (
        {
          "video/mp4": ".mp4",
          "video/quicktime": ".mov",
          "video/webm": ".webm",
          "audio/webm": ".webm",
          "audio/mp4": ".m4a",
          "audio/mpeg": ".mp3",
          "audio/wav": ".wav",
          "audio/ogg": ".ogg",
        } as Record<string, string>
      )[media.mimeType];
      if (!ext) throw new Error("Unsupported source format");
      const relativePath = `${randomUUID()}${ext}`;
      const staged = path.join(work, "media", relativePath);
      await writeFile(staged, bytes, { flag: "wx", mode: 0o600 });
      const { stdout } = await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        staged,
      ]);
      const durationMs = Math.round(Number(stdout.trim()) * 1000);
      if (!Number.isFinite(durationMs) || durationMs <= 0)
        throw new Error("Source duration could not be measured");
      plan.sources.push({
        assetId: media.id,
        sourceAnswerId: take.id,
        takeId: take.id,
        acceptedTakeId: take.id,
        kind: take.kind === "video" ? "video" : "audio",
        relativePath,
        sha256: digest(bytes),
        durationMs,
        archiveRef: `collection-media:${media.id}`,
        originalPreserved: true,
      });
      plan.clips.push({
        id: randomUUID(),
        sourceAnswerId: take.id,
        sourceAssetId: media.id,
        kind: take.kind === "video" ? "video" : "audio",
        inMs: 0,
        outMs: durationMs,
        captions: [],
        editorialReason:
          "Unedited accepted recording. Review the source, choose complete thoughts and align captions before approving this edit.",
      });
    }
    validateVideoPlan(plan, { requireApproval: false });
    const planFile = `plans/chapter-${chapterIndex + 1}.json`;
    await writeFile(
      path.join(work, planFile),
      JSON.stringify(plan, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    manifest.chapters.push({
      chapterId: chapter.id,
      planFile,
      captionStatus: plan.sources.length ? "needs-alignment" : "text-only",
    });
  }
  const manifestPath = path.join(work, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    JSON.stringify({
      status: "exported-for-editing",
      manifest: manifestPath,
      chapters: manifest.chapters,
      nextStep:
        "Edit plans and align captions. Then run the render command with --approve-edit-plan --editor NAME. Export does not certify professional editing.",
    }) + "\n",
  );
}

async function runWorker(planFile: string, work: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/render-chapter.ts",
        "--plan",
        planFile,
        "--media-root",
        path.join(work, "media"),
        "--archive-root",
        path.join(work, "archive"),
        "--output",
        output,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Render worker failed with exit code ${code}`)),
    );
  });
}

async function storeOutput(
  collectionId: string,
  output: string,
): Promise<StoredMedia> {
  const id = randomUUID();
  const { size } = await stat(output);
  const media: StoredMedia = {
    id,
    collectionId,
    role: "owner",
    mimeType: "video/mp4",
    originalName: path.basename(output),
    bytes: size,
    createdAt: new Date().toISOString(),
  };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(
      `collections/${collectionId}/${id}`,
      createReadStream(output),
      { access: "private", contentType: "video/mp4", addRandomSuffix: false },
    );
    if (!blob.url.includes(".private.blob.vercel-storage.com/"))
      throw new Error("Rendered output was not stored privately");
    media.url = blob.url;
  } else {
    if (process.env.VERCEL || process.env.REDIS_URL || process.env.KV_REST_API_URL)
      throw new Error(
        "Cloud collection requires private Blob storage for rendered videos",
      );
    const dir = path.join(dataRoot, "media");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    media.localPath = path.join(dir, id);
    await copyFile(output, media.localPath, constants.COPYFILE_EXCL);
  }
  await putMedia(media);
  return media;
}

async function renderPlans() {
  if (!args.includes("--approve-edit-plan"))
    throw new Error(
      "Review every edit plan first, then explicitly pass --approve-edit-plan",
    );
  const editor = option("--editor").trim();
  if (!editor || editor.length > 120)
    throw new Error("Provide the actual editor name");
  const manifestPath = await realpath(path.resolve(option("--manifest")));
  const work = path.dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.chapters) ||
    manifest.chapters.length !== 4
  )
    throw new Error("Invalid four-chapter manifest");
  const current = await getCollection(manifest.collectionId);
  if (
    !current ||
    current.status === "approved" ||
    snapshot(current) !== manifest.snapshotSha256
  )
    throw new Error(
      "Collection has changed since export. Export a fresh edit package",
    );
  const outputs: {
    chapterId: string;
    mediaId: string;
    resultFile: string;
    outputSha256: string;
  }[] = [];
  // Validate every plan before starting potentially expensive work.
  const plans = await Promise.all(
    manifest.chapters.map(async (entry) => {
      if (!safeMediaPath(entry.planFile)) throw new Error("Unsafe plan path");
      const planPath = await realpath(path.join(work, entry.planFile));
      if (!planPath.startsWith(work + path.sep))
        throw new Error("Plan escapes its workspace");
      const plan = validateVideoPlan(
        JSON.parse(await readFile(planPath, "utf8")),
        { requireApproval: false },
      );
      if (plan.sessionId !== current.id || plan.chapterId !== entry.chapterId)
        throw new Error("Plan identity does not match its collection");
      const accepted = selectedAnswers(current, plan.chapterId);
      if (
        plan.clips.some(
          (clip) => !accepted.some((take) => take.id === clip.sourceAnswerId),
        )
      )
        throw new Error("Plan contains an answer that is no longer selected");
      if (
        plan.sources.some(
          (source) =>
            !accepted.some(
              (take) =>
                take.id === source.takeId &&
                take.mediaId === source.assetId &&
                source.sourceAnswerId === take.id,
            ),
        )
      )
        throw new Error("Plan includes a source that is not an accepted take");
      if (
        !args.includes("--allow-no-captions") &&
        plan.clips.some(
          (clip) => clip.kind !== "text" && clip.captions.length === 0,
        )
      )
        throw new Error(
          "Add source-timed captions to every recorded clip. --allow-no-captions explicitly produces an uncaptained review cut",
        );
      return {
        ...plan,
        approval: { approvedBy: editor, approvedAt: new Date().toISOString() },
      };
    }),
  );
  if (
    new Set(plans.map((plan) => plan.chapterId)).size !== 4 ||
    current.chapters.some(
      (ch) => !plans.some((plan) => plan.chapterId === ch.id),
    )
  )
    throw new Error("Manifest must cover each current chapter exactly once");
  const runId = randomUUID();
  await mkdir(path.join(work, "output"), { recursive: true, mode: 0o700 });
  for (const plan of plans) {
    const approvedFile = path.join(
      work,
      "plans",
      `approved-${plan.chapterNumber}-${runId}.json`,
    );
    const output = path.join(
      work,
      "output",
      `chapter-${plan.chapterNumber}-${runId}.mp4`,
    );
    await writeFile(approvedFile, JSON.stringify(plan, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await runWorker(approvedFile, work, output);
    const result = JSON.parse(await readFile(output + ".result.json", "utf8"));
    if (
      result.status !== "rendered-awaiting-review" ||
      result.draft ||
      result.releaseEligible !== false
    )
      throw new Error("Unexpected render worker result");
    const media = await storeOutput(current.id, output);
    outputs.push({
      chapterId: plan.chapterId,
      mediaId: media.id,
      resultFile: output + ".result.json",
      outputSha256: result.outputSha256,
    });
  }
  await mutateCollection(current.id, (c) => {
    if (c.status === "approved" || snapshot(c) !== manifest.snapshotSha256)
      throw new Error(
        "Collection changed during rendering. Outputs are preserved, but not attached. Re-export before retrying",
      );
    for (const output of outputs) {
      const chapter = c.chapters.find((ch) => ch.id === output.chapterId)!;
      chapter.videoMediaId = output.mediaId;
      chapter.videoStatus = "ready";
      chapter.editorialReviewed = false;
    }
    return c;
  });
  await writeFile(
    path.join(work, `import-${runId}.json`),
    JSON.stringify(
      { collectionId: current.id, status: "awaiting-final-review", outputs },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  process.stdout.write(
    JSON.stringify({
      collectionId: current.id,
      status: "awaiting-final-review",
      videoCount: outputs.length,
      outputs,
      published: false,
      emailsSent: false,
      nextStep:
        "Open the owner review page, watch each finished cut, and explicitly approve the exact videos. Nothing was released.",
    }) + "\n",
  );
}

async function main() {
  if (args[0] === "export") await exportPlans();
  else if (args[0] === "render") await renderPlans();
  else
    throw new Error(
      "Use export --collection ID --work-dir PRIVATE_DIR, or render --manifest FILE --approve-edit-plan --editor NAME",
    );
}
main().catch((error) => {
  process.stderr.write(
    `Collection video job failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
