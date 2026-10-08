import {
  hasChapterPlayback,
  type StoryPlaybackArtifact,
} from "@/lib/audio/playback-types";

/** Theme labels shared with the public chapter cards. */
export const STORY_THEMES: Record<string, string> = {
  q1: "Kindness",
  q2: "Faith",
  q3: "Generosity",
  q4: "Encouragement",
};

export type StorytellerTaskId =
  "saved" | "prepared" | "approved" | "address" | "ebook";

export type StorytellerTaskState = "done" | "current" | "ready" | "upcoming";

export type StorytellerTask = {
  id: StorytellerTaskId;
  title: string;
  detail: string;
  state: StorytellerTaskState;
};

type ChapterSignal = {
  id: string;
  videoMediaId?: string;
  film?: {
    mediaId?: string;
    narrationKind?: string;
    outputSha256?: string;
  } | null;
  playback?: {
    schemaVersion?: number;
    chapterId?: string;
    mediaId?: string;
    outputSha256?: string;
    durationMs?: number;
  } | null;
};

export function storytellerFilmsReady(chapters: ChapterSignal[]) {
  if (chapters.length !== 4) return false;
  if (
    chapters.every((chapter) =>
      hasChapterPlayback(
        chapter as { id: string; playback?: StoryPlaybackArtifact },
      ),
    )
  )
    return true;
  return chapters.every(
    (chapter) =>
      chapter.videoMediaId &&
      chapter.film?.mediaId === chapter.videoMediaId &&
      chapter.film.narrationKind === "original_recording" &&
      chapter.film.outputSha256,
  );
}

export function storytellerTasks(input: {
  status: string;
  chapters: ChapterSignal[];
  addressConfirmed: boolean;
  recipientName: string;
  preparation?: { ready?: boolean; status?: string } | null;
}) {
  const name = input.recipientName.trim() || "your recipient";
  const prepared =
    input.preparation?.ready === true ||
    input.status === "approved" ||
    storytellerFilmsReady(input.chapters);
  const approved = input.status === "approved";
  const addressSaved = input.addressConfirmed;
  const hasBook = input.chapters.length > 0;
  const saved =
    prepared ||
    approved ||
    Boolean(input.preparation) ||
    input.chapters.length > 0;

  let currentId: StorytellerTaskId = "ebook";
  if (!saved) currentId = "saved";
  else if (!prepared) currentId = "prepared";
  else if (!approved) currentId = "approved";
  else if (!addressSaved) currentId = "address";

  const stateFor = (
    id: StorytellerTaskId,
    done: boolean,
    ready = false,
  ): StorytellerTaskState => {
    if (done) return "done";
    if (id === currentId) return "current";
    if (ready) return "ready";
    return "upcoming";
  };

  const preparing = Boolean(input.preparation) && !prepared;
  const tasks: StorytellerTask[] = [
    {
      id: "saved",
      title: "Interview saved",
      detail: saved
        ? "Your recording is kept."
        : "Return to your conversation to finish saving it.",
      state: stateFor("saved", saved),
    },
    {
      id: "prepared",
      title: "Stories and videos",
      detail: prepared
        ? "Your four stories and videos are ready to review."
        : input.preparation?.status === "needs_attention"
          ? "Preparation needs another look. Your recording is kept."
          : preparing
            ? "Your stories, videos, and postcard drafts are being prepared."
            : input.chapters.length
              ? "Your written stories are saved. The videos finish before you approve."
              : "Submit your interview so your gift can be prepared.",
      state: stateFor("prepared", prepared),
    },
    {
      id: "approved",
      title: "Review and approve",
      detail: approved
        ? `You approved this gift for ${name}.`
        : "Read each story and approve the gift before it is shared.",
      state: stateFor("approved", approved),
    },
    {
      id: "address",
      title: "Mailing address",
      detail: addressSaved
        ? `A mailing address for ${name} is saved.`
        : `Add where postcards for ${name} should be mailed.`,
      state: stateFor("address", addressSaved),
    },
    {
      id: "ebook",
      title: "Download your e-book",
      detail: hasBook
        ? approved
          ? "Save the keepsake PDF of your stories."
          : "Preview the story book while you finish your review."
        : "Your e-book appears here when the stories are ready.",
      state: stateFor("ebook", false, hasBook && currentId !== "ebook"),
    },
  ];

  return {
    tasks,
    current: tasks.find((task) => task.state === "current") ?? tasks[0],
    recipientName: name,
    prepared,
    approved,
    addressSaved,
    hasBook,
  };
}
