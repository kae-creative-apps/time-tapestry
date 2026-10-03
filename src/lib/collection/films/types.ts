export type FilmStage =
  "queued" | "narrating" | "rendering" | "ready" | "failed" | "stale";

export type StoryFilmArtifact = {
  jobId: string;
  chapterId: string;
  mediaId: string;
  narrationKind: "ai_interviewer";
  sourceTakeIds: string[];
  sourceSha256: string;
  scriptSha256: string;
  audioSha256: string;
  outputSha256: string;
  voiceId: string;
  modelId: string;
  durationSeconds: number;
  createdAt: string;
};

export type FilmVoice = {
  agentId: string;
  voiceId: string;
  modelId: string;
  settings: {
    stability: number;
    similarityBoost: number;
    speed: number;
    style: number;
    useSpeakerBoost: boolean;
  };
};

export type FilmWord = { text: string; startMs: number; endMs: number };
export type FilmChapter = {
  chapterId: string;
  chapterNumber: 1 | 2 | 3 | 4;
  title: string;
  content: string;
  script: string;
  sourceTakeIds: string[];
  sourceSha256: string;
  scriptSha256: string;
  status: FilmStage;
  progress: number;
  error?: string;
  artifact?: StoryFilmArtifact;
};

export type StoryFilmJob = {
  schemaVersion: 1;
  kind: "story-film-job";
  id: string;
  collectionId: string;
  storytellerName: string;
  versionHash: string;
  sourceSha256: string;
  templateVersion: string;
  voice: FilmVoice;
  status: FilmStage;
  chapters: FilmChapter[];
  createdAt: string;
  updatedAt: string;
  scriptsApprovedAt: string;
  attempts: number;
  error?: string;
  lease?: { token: string; expiresAt: number };
};

export type NarratedFilmPlan = {
  schemaVersion: 1;
  jobId: string;
  chapterId: string;
  chapterNumber: 1 | 2 | 3 | 4;
  storytellerName: string;
  title: string;
  script: string;
  sourceTakeIds: string[];
  sourceSha256: string;
  scriptSha256: string;
  audioSha256: string;
  audioDurationMs: number;
  words: FilmWord[];
  narrationKind: "ai_interviewer";
  templateVersion: string;
};

export type FilmJobView = Pick<
  StoryFilmJob,
  | "id"
  | "collectionId"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "scriptsApprovedAt"
  | "error"
> & {
  chapters: Pick<
    FilmChapter,
    "chapterId" | "title" | "status" | "progress" | "error" | "artifact"
  >[];
};
