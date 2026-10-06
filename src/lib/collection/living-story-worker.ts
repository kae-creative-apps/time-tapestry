/** Long-running worker only. Never import this renderer from an API route. */
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { chat } from "../gloo-client";
import { reserveProviderBudget } from "../security/request";
import { chapterDurationFrames, VIDEO_FPS } from "../video-plan";
import { dataRoot, getCollection, getMedia, putMedia } from "./store";
import { assertPrivateBlobUrl, mediaBytes } from "./media";
import { isStoredOwnerRecording } from "./recording-validation";
import { finalizeMediaUpload, reserveMediaUpload } from "./usage";
import {
  claimNextLivingStoryMoment,
  heartbeatLivingStoryMoment,
  completeLivingStoryMoment,
  failLivingStoryMoment,
} from "./living-story";
import {
  readStoryEditorDraft,
  storyEditorMessages,
  STORY_EDITOR_INPUT_LIMIT,
  type StoryEditorRequest,
} from "./story-editorial";
import { sourceMetadataHash } from "./films/original-plan";
import { stageOriginalSource, originalAudioCopy } from "./films/source-media";
import { cachedSourceTranscript } from "./films/transcript-cache";
import { transcribeOriginal } from "./films/transcription";
import { detectSourceSilence } from "./films/source-silence";
import {
  cleanSourcePassage,
  SOURCE_CLEANUP_VERSION,
} from "./films/source-cleanup";
import {
  assertTimedSourceWords,
  captionsForWords,
} from "./films/word-matching";
import {
  prepareOriginalChapter,
  renderOriginalFilm,
} from "./films/original-render";
import { fileHash, privateJson, probeFilm } from "./films/render";
import { sha256 } from "./films/plan";
import {
  assertFilmDiskSpace,
  FilmDiskSpaceError,
  filmSourceScratchBytes,
  filmRenderScratchBytes,
} from "./films/disk-space";
import type { FilmChapter, StoryFilmJob } from "./films/types";
import type { StoredMedia } from "./types";

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimNextLivingStoryMoment>>
>;
type Options = {
  shouldStop?: () => boolean;
  transcribe?: typeof transcribeOriginal;
  edit?: StoryEditorRequest;
  render?: typeof renderOriginalFilm;
};

async function saveMomentFilm(
  claimed: Claim,
  sourceMediaId: string,
  file: string,
  outputSha256: string,
  assertCurrent: () => Promise<void>,
) {
  const collectionId = claimed.collection.id;
  const id = `filmmedia_${sha256(`${collectionId}:${claimed.moment.id}:${sourceMediaId}:${outputSha256}`).slice(0, 48)}`;
  const bytes = (await stat(file)).size;
  const existing = await getMedia(id);
  if (existing) {
    if (
      existing.collectionId !== collectionId ||
      existing.role !== "owner" ||
      existing.provenance !== "generated_film" ||
      existing.livingStoryMomentId !== claimed.moment.id ||
      existing.originalSourceMediaId !== sourceMediaId ||
      existing.bytes !== bytes ||
      sha256(await mediaBytes(existing)) !== outputSha256
    )
      throw new Error("The saved story film failed identity verification.");
    await assertCurrent();
    await finalizeMediaUpload({ collectionId, mediaId: id, bytes });
    return id;
  }
  await reserveMediaUpload({ collectionId, mediaId: id, bytes });
  const media: StoredMedia = {
    id,
    collectionId,
    role: "owner",
    provenance: "generated_film",
    livingStoryMomentId: claimed.moment.id,
    originalSourceMediaId: sourceMediaId,
    mimeType: "video/mp4",
    originalName: `memory-${claimed.moment.id}.mp4`,
    bytes,
    createdAt: new Date().toISOString(),
  };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // A unique immutable path makes interrupted retries safe without overwrite.
    const blob = await put(
      `collections/${collectionId}/${id}-${randomUUID()}.mp4`,
      createReadStream(file),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "video/mp4",
      },
    );
    assertPrivateBlobUrl(blob.url);
    media.url = blob.url;
  } else {
    if (process.env.VERCEL || process.env.KV_REST_API_URL)
      throw new Error("Shared story films need private Blob storage.");
    const directory = path.join(dataRoot, "media");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await assertFilmDiskSpace(dataRoot, bytes);
    const destination = path.join(directory, `${id}.mp4`);
    try {
      await copyFile(file, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        (await fileHash(destination)) !== outputSha256
      )
        throw error;
    }
    media.localPath = destination;
  }
  await assertCurrent();
  await putMedia(media);
  await finalizeMediaUpload({ collectionId, mediaId: id, bytes });
  return id;
}

async function editedStory(
  work: string,
  sourceSha256: string,
  claimed: Claim,
  transcript: string,
  request?: StoryEditorRequest,
) {
  const sources = [
    {
      id: claimed.moment.sourceMediaId!,
      prompt: claimed.moment.question,
      text: transcript,
    },
  ];
  const messages = storyEditorMessages(claimed.moment.title, sources);
  if (messages[1].content.length > STORY_EDITOR_INPUT_LIMIT)
    throw new Error(
      "This complete recording needs an editor check before a written story can be prepared.",
    );
  const identity = sha256(JSON.stringify({ sourceSha256, messages }));
  const receipt = path.join(work, `written-${identity}.json`);
  let response: unknown;
  try {
    const cached = JSON.parse(await readFile(receipt, "utf8"));
    if (cached.identity !== identity)
      throw new Error("The written-story cache failed source verification.");
    response = cached.response;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!request && !process.env.GLOO_API_KEY?.trim())
      throw new Error("The story editor needs Gloo configured on the worker.");
    if (!request) await reserveProviderBudget("generate");
    response = await (request ?? chat)(messages);
    readStoryEditorDraft(response, sources);
    await privateJson(receipt, { identity, sourceSha256, response });
  }
  return readStoryEditorDraft(response, sources).content;
}

export async function processLivingStoryMoment(
  claimed: Claim,
  options: Options = {},
) {
  const { collection, moment, leaseId } = claimed;
  const sourceMediaId = moment.sourceMediaId!;
  let metadataHash: string | undefined;
  let heartbeatError: unknown;
  let heartbeatWrite = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatWrite = heartbeatWrite
      .then(async () => {
        await heartbeatLivingStoryMoment(collection.id, moment.id, leaseId);
      })
      .catch((error) => {
        heartbeatError = error;
      });
  }, 20000);
  const assertCurrent = async () => {
    if (heartbeatError) throw heartbeatError;
    const current = await getCollection(collection.id);
    const active = current?.livingStory?.moments.find(
      (item) => item.id === moment.id,
    );
    const media = await getMedia(sourceMediaId);
    if (
      !current ||
      current.status !== "approved" ||
      active?.status !== "processing" ||
      active.processing?.state !== "running" ||
      active.processing.leaseId !== leaseId ||
      !(Date.parse(active.processing.leaseExpiresAt || "") > Date.now()) ||
      active.sourceMediaId !== sourceMediaId ||
      active.question !== moment.question ||
      active.title !== moment.title ||
      active.processingApprovedAt !== moment.processingApprovedAt ||
      !isStoredOwnerRecording(media, current) ||
      media.provenance !== "uploaded_recording" ||
      media.livingStoryMomentId !== moment.id ||
      (metadataHash && sourceMetadataHash(media) !== metadataHash)
    )
      throw new Error(
        "The source recording or story preparation lease changed.",
      );
    await assertFilmDiskSpace(dataRoot);
    return media;
  };
  const checkCurrent = async () => {
    await assertCurrent();
  };
  const work = path.join(
    dataRoot,
    "living-story-work",
    collection.id,
    moment.id,
    sourceMediaId,
  );
  let phase = "source verification";
  try {
    const media = await assertCurrent();
    metadataHash = sourceMetadataHash(media);
    if (
      (process.env.VERCEL || process.env.KV_REST_API_URL) &&
      !process.env.BLOB_READ_WRITE_TOKEN
    )
      throw new Error("Shared story films need private Blob storage.");
    await assertFilmDiskSpace(
      dataRoot,
      filmSourceScratchBytes([{ bytes: media.bytes, durationMs: null }]),
    );
    await mkdir(work, { recursive: true, mode: 0o700 });
    const job: StoryFilmJob = {
      schemaVersion: 1,
      kind: "story-film-job",
      id: `living_${sha256(`${collection.id}:${moment.id}:${metadataHash}`)}`,
      collectionId: collection.id,
      storytellerName: collection.storyteller.name,
      mode: "original",
      preparation: "automatic",
      processingConsentAt: moment.processingApprovedAt,
      sourceSha256: metadataHash,
      versionHash: metadataHash,
      templateVersion: "living-story-original-v1",
      status: "preparing",
      chapters: [],
      createdAt: moment.createdAt,
      updatedAt: new Date().toISOString(),
      scriptsApprovedAt: moment.processingApprovedAt!,
      attempts: moment.processing!.attempts,
      originalSources: [
        {
          mediaId: sourceMediaId,
          kind: media.mimeType.startsWith("video/") ? "video" : "audio",
          durationMs: null,
          createdAt: media.createdAt,
          fromInterview: false,
          chapterIds: [moment.id],
          sourceTakeIds: [sourceMediaId],
          metadataSha256: metadataHash,
        },
      ],
    };
    const staged = await stageOriginalSource(job, sourceMediaId, work);
    await assertCurrent();
    phase = "transcription";
    const words = await cachedSourceTranscript({
      cacheRoot: path.join(dataRoot, "film-transcripts", collection.id),
      sourceSha256: staged.originalSha256,
      mediaId: sourceMediaId,
      durationMs: staged.durationMs,
      attempt: job.attempts,
      request: async () => {
        // A cache hit can finish without providers. On a miss, require the
        // downstream editor before incurring a paid transcription request.
        if (!options.edit && !process.env.GLOO_API_KEY?.trim())
          throw new Error(
            "The story editor needs Gloo configured on the worker.",
          );
        const audio = await originalAudioCopy(staged, false);
        await assertCurrent();
        return (options.transcribe ?? transcribeOriginal)(
          audio.file,
          sourceMediaId,
          staged.durationMs,
        );
      },
    });
    assertTimedSourceWords(words);
    if (new Set(words.map((word) => word.speakerId).filter(Boolean)).size > 1)
      throw new Error(
        "This recording contains multiple detected speakers and needs an editor check.",
      );
    const sourceTranscript = words.map((word) => word.text).join(" ");
    await assertCurrent();
    phase = "source cleanup";
    const waveform = await originalAudioCopy(staged, false);
    const silence = await detectSourceSilence(waveform.file, staged.durationMs);
    // SavedRecorder contains only the storyteller's answer. Preserve the full
    // ordered source; only confirmed silence and conservative fillers may go.
    const cleaned = cleanSourcePassage(
      {
        mediaId: sourceMediaId,
        inMs: 0,
        outMs: staged.durationMs,
        captions: captionsForWords(words),
      },
      words,
      silence,
    );
    await assertCurrent();
    phase = "written story";
    const content = await editedStory(
      work,
      staged.originalSha256,
      claimed,
      sourceTranscript,
      options.edit,
    );
    await assertCurrent();
    const chapter: FilmChapter = {
      chapterId: moment.id,
      chapterNumber: 1,
      title: moment.title,
      content,
      script: content,
      sourceTakeIds: [sourceMediaId],
      sourceSha256: staged.originalSha256,
      scriptSha256: sha256(content),
      status: "preparing",
      progress: 0,
      sourceEdit: {
        chapterId: moment.id,
        presentation: media.mimeType.startsWith("video/") ? "video" : "audio",
        clips: cleaned.clips,
        cleanup: {
          version: SOURCE_CLEANUP_VERSION,
          removed: cleaned.removed,
          skippedReason: cleaned.skippedReason,
        },
      },
    };
    job.chapters = [chapter];
    phase = "film rendering";
    const prepared = await prepareOriginalChapter(
      job,
      chapter,
      path.join(work, "chapter"),
      checkCurrent,
      async () => {},
    );
    prepared.plan.promptQuestion = moment.question;
    await privateJson(
      path.join(work, "chapter", "source-plan.json"),
      prepared.plan,
    );
    const expectedSeconds = chapterDurationFrames(prepared.plan) / VIDEO_FPS;
    await assertFilmDiskSpace(
      dataRoot,
      filmRenderScratchBytes(expectedSeconds),
    );
    const output = path.join(work, `film-${randomUUID()}.mp4`);
    const rendered = await (options.render ?? renderOriginalFilm)(
      prepared,
      output,
      async () => {
        await assertCurrent();
      },
      checkCurrent,
    );
    const probe = await probeFilm(output);
    if (
      !probe.types.includes("audio") ||
      !probe.types.includes("video") ||
      Math.abs(probe.durationSeconds - expectedSeconds) > 0.2 ||
      (await fileHash(output)) !== rendered.outputSha256
    )
      throw new Error(
        "The prepared film failed its audio, video, duration or hash verification.",
      );
    const currentMedia = await assertCurrent();
    if (sha256(await mediaBytes(currentMedia)) !== staged.originalSha256)
      throw new Error(
        "The original recording changed before its film was saved.",
      );
    phase = "private film storage";
    const videoMediaId = await saveMomentFilm(
      claimed,
      sourceMediaId,
      output,
      rendered.outputSha256,
      checkCurrent,
    );
    await assertCurrent();
    const sourceQuote =
      sourceTranscript.length <= 240
        ? sourceTranscript
        : sourceTranscript.slice(0, 240).replace(/\s+\S*$/, "");
    const result = await completeLivingStoryMoment(
      collection.id,
      moment.id,
      leaseId,
      {
        videoMediaId,
        content,
        sourceMediaId,
        sourceSha256: staged.originalSha256,
        sourceQuote,
        sourceTranscript,
      },
    );
    return result.livingStory!.moments.find((item) => item.id === moment.id)!;
  } catch (error) {
    await mkdir(work, { recursive: true, mode: 0o700 })
      .then(() =>
        privateJson(path.join(work, `failure-${leaseId}.json`), {
          phase,
          error:
            error instanceof Error
              ? error.message
              : "Unknown story preparation error",
          occurredAt: new Date().toISOString(),
        }),
      )
      .catch(() => {});
    try {
      const failed = await failLivingStoryMoment(
        collection.id,
        moment.id,
        leaseId,
        "We could not finish preparing this film and written story. Your original recording is saved. You can retry, or save a new recording if the problem continues.",
      );
      return failed.livingStory!.moments.find((item) => item.id === moment.id)!;
    } catch {
      // A replacement lease or a changed collection owns its state now.
      return (
        (await getCollection(collection.id))?.livingStory?.moments.find(
          (item) => item.id === moment.id,
        ) ?? null
      );
    }
  } finally {
    clearInterval(heartbeat);
    await heartbeatWrite;
  }
}

export async function runLivingStoryWorkerOnce(
  _workerId = `local-${process.pid}`,
  options: Options = {},
) {
  if (options.shouldStop?.()) return null;
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  try {
    await assertFilmDiskSpace(dataRoot);
  } catch (error) {
    if (error instanceof FilmDiskSpaceError) return null;
    throw error;
  }
  if (options.shouldStop?.()) return null;
  const claimed = await claimNextLivingStoryMoment();
  if (!claimed) return null;
  // A claimed job finishes during graceful shutdown; no later job is claimed.
  return processLivingStoryMoment(claimed, options);
}
