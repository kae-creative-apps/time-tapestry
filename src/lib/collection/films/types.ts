export type FilmStage =
  | "queued"
  | "transcribing"
  | "matching"
  | "preparing"
  | "narrating"
  | "rendering"
  | "ready"
  | "failed"
  | "stale";

type FilmArtifactBase = {
  jobId: string;
  chapterId: string;
  mediaId: string;
  sourceTakeIds: string[];
  sourceSha256: string;
  outputSha256: string;
  durationSeconds: number;
  createdAt: string;
};
export type StoryFilmArtifact = FilmArtifactBase &
  (
    | {
        narrationKind: "ai_interviewer";
        scriptSha256: string;
        audioSha256: string;
        voiceId: string;
        modelId: string;
      }
    | {
        narrationKind: "original_recording";
        presentation: "video" | "audio";
        planSha256: string;
        sourceRanges: OriginalClipSelection[];
        sourceAssets: { mediaId: string; sha256: string; durationMs: number }[];
      }
  );

export type SourceCaption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: null;
  confidence: null;
};
export type OriginalClipSelection = {
  mediaId: string;
  inMs: number;
  outMs: number;
  captions?: SourceCaption[];
};
export type OriginalChapterEdit = {
  chapterId: string;
  presentation: "video" | "audio";
  clips: OriginalClipSelection[];
};
export type OriginalFilmEdit = {
  schemaVersion: 1;
  collectionId: string;
  revisionHash: string;
  storyHash: string;
  chapters: OriginalChapterEdit[];
  updatedAt: string;
};
export type OriginalFilmSource = {
  mediaId: string;
  kind: "video" | "audio";
  durationMs: number | null;
  createdAt: string;
  fromInterview: boolean;
  chapterIds: string[];
  sourceTakeIds: string[];
};
export type OriginalSourceSnapshot = OriginalFilmSource & {
  metadataSha256: string;
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
  sourceEdit?: OriginalChapterEdit;
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
  mode?: "ai_narration" | "original";
  preparation?: "automatic" | "manual";
  processingConsentAt?: string;
  automaticPresentation?: "video" | "audio";
  voice?: FilmVoice;
  originalPlanHash?: string;
  originalSources?: OriginalSourceSnapshot[];
  cutsApprovedAt?: string;
  allowNoCaptions?: boolean;
  status: FilmStage;
  chapters: FilmChapter[];
  createdAt: string;
  updatedAt: string;
  scriptsApprovedAt: string;
  attempts: number;
  nextAttemptAt?: string;
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
  | "mode"
  | "preparation"
  | "createdAt"
  | "updatedAt"
  | "scriptsApprovedAt"
  | "nextAttemptAt"
  | "error"
> & {
  chapters: Pick<
    FilmChapter,
    "chapterId" | "title" | "status" | "progress" | "error" | "artifact"
  >[];
};
