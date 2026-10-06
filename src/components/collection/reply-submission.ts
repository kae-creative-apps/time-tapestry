import type { Reply } from "@/lib/collection/types";
import { verifyReplyPlayback } from "./reply-playback";

/** Rechecking immutable media must not block confirmation after a lost save response. */
export function createReplyPlaybackCheck(verify = verifyReplyPlayback) {
  const checked = new Set<string>();
  return async (src: string) => {
    if (checked.has(src)) return;
    await verify(src);
    checked.add(src);
  };
}

export function replyAcknowledgement(
  replies: Reply[],
  draft: { replyId: string; chapterId: string; text: string; mediaId: string },
) {
  const saved = replies.find((reply) => reply.id === draft.replyId);
  if (!saved) return "unconfirmed";
  return saved.chapterId === draft.chapterId &&
    saved.text.trim() === draft.text.trim() &&
    (saved.mediaId || "") === draft.mediaId
    ? "saved"
    : "changed";
}
