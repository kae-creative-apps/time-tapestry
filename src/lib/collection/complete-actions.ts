/** What the complete page offers. Status is text. At most one action. */
export type CompleteAction =
  | { kind: "retry"; label: "Try again" }
  | { kind: "link"; label: string; href: string }
  | { kind: "status"; label: string }
  | { kind: "none" };

export function completePageAction(input: {
  loading: boolean;
  ready: boolean;
  accepted: boolean;
  needsAttention: boolean;
  canRetry: boolean;
  canUseFullInterview: boolean;
  missingAreaId?: string;
  preparationStatus?: string | null;
  recordHref: string;
  reviewHref: string;
}): CompleteAction {
  if (input.loading) return { kind: "none" };
  if (input.ready)
    return {
      kind: "link",
      label: "Review your stories",
      href: input.reviewHref,
    };
  if (input.needsAttention) {
    if (input.canUseFullInterview) return { kind: "none" };
    if (input.missingAreaId)
      return {
        kind: "link",
        label: "Continue conversation",
        href: input.recordHref,
      };
    if (input.canRetry) return { kind: "retry", label: "Try again" };
    return {
      kind: "status",
      label: "Contact Time Tapestry with your private link.",
    };
  }
  if (!input.accepted)
    return {
      kind: "link",
      label: "Continue conversation",
      href: input.recordHref,
    };
  if (input.preparationStatus === "films_queued")
    return { kind: "status", label: "Preparing your videos." };
  return { kind: "status", label: "Preparing your stories." };
}

/** A failed preparation must stay on the recording page. Other submitted interviews return to complete. */
export function shouldLeaveRecordingForComplete(input: {
  role?: string | null;
  status?: string | null;
  draftOutdated?: boolean;
  preparation?: {
    status?: string | null;
    missingAreas?: readonly unknown[];
  } | null;
  rerecordChapterId?: string | null;
  phase?: string;
}): boolean {
  if (input.role !== "owner" || input.status === "approved") return false;
  if (input.rerecordChapterId) return false;
  if (input.draftOutdated) return false;
  const preparation = input.preparation;
  if (!preparation || preparation.missingAreas?.length) return false;
  if (preparation.status === "needs_attention") return false;
  if (input.phase !== undefined && input.phase !== "ready") return false;
  return true;
}
