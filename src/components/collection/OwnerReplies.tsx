"use client";
import { useEffect } from "react";
import type { CollectionView } from "@/lib/collection/types";
import { mediaPath, portalSecondary } from "./PortalUI";
import { StoryMediaPlayer } from "./StoryOriginalPreview";
export function OwnerReplies({
  collection: c,
  accessKey,
  onRefresh,
  busy,
}: {
  collection: CollectionView;
  accessKey: string;
  onRefresh: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    const chapterId = window.location.hash.slice(1);
    if (/^q[1-4]$/.test(chapterId))
      document
        .getElementById(`reply-${chapterId}`)
        ?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <section
      className="mt-7 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8"
      aria-labelledby="owner-replies-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="owner-replies-heading" className="text-2xl font-semibold">
          Messages from {c.recipient.name}
        </h2>
        <button
          type="button"
          className={portalSecondary}
          disabled={busy}
          onClick={onRefresh}
        >
          Check for new messages
        </button>
      </div>
      {!c.replies.length && (
        <p className="mt-4 text-base leading-8 text-ink-500">
          When {c.recipient.name} sends a written or video reply to a story, you
          can open it here.
        </p>
      )}
      {c.chapters.map((chapter) => {
        const replies = c.replies.filter(
          (reply) => reply.chapterId === chapter.id,
        );
        return (
          replies.length > 0 && (
            <section
              key={chapter.id}
              id={`reply-${chapter.id}`}
              className="mt-6 scroll-mt-5 border-t border-warmgray-200 pt-6"
            >
              <h3 className="text-xl font-semibold">About “{chapter.title}”</h3>
              {replies.map((reply) => (
                <article
                  key={reply.id}
                  className="mt-5 rounded-xl bg-paper p-5"
                >
                  <p className="text-base font-medium">{c.recipient.name}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {new Date(reply.createdAt).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  {reply.mediaId && (
                    <StoryMediaPlayer
                      className="mt-4 max-w-2xl"
                      label={`Reply from ${c.recipient.name} about ${chapter.title}`}
                      src={mediaPath(c.id, reply.mediaId, accessKey)}
                    />
                  )}
                  {reply.text && (
                    <p className="mt-4 whitespace-pre-wrap text-lg leading-8">
                      {reply.text}
                    </p>
                  )}
                </article>
              ))}
            </section>
          )
        );
      })}
    </section>
  );
}
