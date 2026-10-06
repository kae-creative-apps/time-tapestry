import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CHAPTERS } from "../src/lib/interview-state";
import type { Collection } from "../src/lib/collection/types";
import type {
  FilmVoice,
  StoryFilmArtifact,
} from "../src/lib/collection/films/types";

/** Explicit provenance for private-media access tests; no real film is rendered. */
export function syntheticOriginalFilmArtifact(
  collection: Collection,
  chapterId: string,
  mediaId: string,
): StoryFilmArtifact {
  return {
    jobId: "synthetic-original-job",
    chapterId,
    mediaId,
    narrationKind: "original_recording",
    presentation: "video",
    sourceTakeIds: [],
    sourceSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    planSha256: "c".repeat(64),
    durationSeconds: 1,
    createdAt: collection.createdAt,
    sourceRanges: [],
    sourceAssets: [],
  };
}

export const testVoice: FilmVoice = {
  agentId: "synthetic-agent",
  voiceId: "synthetic-voice",
  modelId: "eleven_multilingual_v2",
  settings: {
    stability: 0.5,
    similarityBoost: 0.8,
    speed: 1,
    style: 0,
    useSpeakerBoost: true,
  },
};
export function syntheticFilmCollection(): Collection {
  const now = new Date().toISOString();
  const stories = [
    "This is a fictional story for testing. My grandmother kept a blue notebook beside her kitchen window. She wrote down the names of neighbors she wanted to visit.",
    "This is a fictional story for testing. I learned patience while helping a friend repair an old bicycle. We tried again together when the first repair did not hold.",
    "This is a fictional story for testing. A quiet walk through the garden reminded me to pay attention. I found hope in the small signs of new growth.",
    "This is a fictional story for testing. I hope the next generation will make time to listen. A thoughtful question can help someone feel remembered.",
  ];
  const takes = CHAPTERS.map((theme, i) => ({
    id: randomUUID(),
    questionId: theme.id,
    prompt: theme.title,
    kind: "text" as const,
    text: stories[i],
    createdAt: now,
  }));
  return {
    schemaVersion: 2,
    id: `synthetic_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    ownerKey: randomUUID(),
    recipientKey: randomUUID(),
    requesterKey: randomUUID(),
    initiationPath: "share",
    storyteller: {
      name: "Alex Example",
      email: "synthetic-storyteller@example.test",
    },
    recipient: {
      name: "Sam Example",
      email: "synthetic-recipient@example.test",
    },
    requester: {
      name: "Alex Example",
      email: "synthetic-storyteller@example.test",
    },
    addressConfirmed: false,
    invitationNote: "Synthetic fixture only",
    faithFraming: "beliefs",
    currentQuestion: 4,
    chapterBlessings: {},
    takes,
    selectedTakeIds: Object.fromEntries(
      takes.map((take) => [take.questionId, take.id]),
    ),
    followUps: {},
    chapters: CHAPTERS.map((theme, i) => ({
      id: theme.id,
      title: theme.title,
      content: stories[i],
      postcardNote: "A fictional story for testing.",
      sourceTakeIds: [takes[i].id],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    })),
    draftOutdated: false,
    deliveries: [],
    replies: [],
    notifications: [],
    recipientViewedChapters: {},
    replyRemindersEnabled: false,
  };
}

/** Persist original-source metadata for queue tests; the pure fixture above stays historical text. */
export async function syntheticRecordedFilmCollection(
  kind: "voice" | "video" = "video",
): Promise<Collection> {
  const store = await import("../src/lib/collection/store");
  const collection = syntheticFilmCollection();
  for (const [index, take] of collection.takes.entries()) {
    take.kind = kind;
    take.mediaId = `original_${take.id}`;
    take.durationSeconds = 12;
    const extension = kind === "voice" ? "wav" : "mp4";
    const localPath = path.join(store.dataRoot, `${take.mediaId}.${extension}`);
    const content = Buffer.from(`Synthetic original source ${index}`);
    await writeFile(localPath, content);
    await store.putMedia({
      id: take.mediaId,
      collectionId: collection.id,
      role: "owner",
      mimeType: kind === "voice" ? "audio/wav" : "video/mp4",
      originalName: `synthetic.${extension}`,
      bytes: content.length,
      createdAt: collection.createdAt,
      localPath,
    });
  }
  await store.putCollection(collection);
  return collection;
}
