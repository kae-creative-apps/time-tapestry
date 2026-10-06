"use client";

import { useEffect, useState } from "react";
import { collectionRequest } from "@/lib/collection/client-request";
import { portalField, portalSecondary } from "./PortalUI";

/** Report a preparation problem without asking the storyteller to rewrite a recording. */
export function StoryIssueReport({
  collectionId,
  chapterId,
  accessKey,
  initialIssueId,
  expectedChapterHash,
  onReported,
}: {
  collectionId: string;
  chapterId: string;
  accessKey: string;
  initialIssueId?: string;
  expectedChapterHash?: string;
  onReported?: () => void;
}) {
  const [category, setCategory] = useState("name");
  const [busy, setBusy] = useState(false);
  const [issueId, setIssueId] = useState(initialIssueId || "");
  useEffect(() => setIssueId(initialIssueId || ""), [initialIssueId]);
  const [error, setError] = useState("");
  async function report(withdraw = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await collectionRequest<{
        issues: Array<{ id: string; chapterId: string; status: string }>;
      }>(
        `/api/collection/${encodeURIComponent(collectionId)}/story-issues?key=${encodeURIComponent(accessKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            withdraw
              ? { action: "withdraw", issueId }
              : { chapterId, category, expectedChapterHash },
          ),
        },
      );
      setIssueId(
        response.issues.find(
          (issue) => issue.chapterId === chapterId && issue.status === "open",
        )?.id || "",
      );
      onReported?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not save this report. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 border-t border-warmgray-200 pt-4">
      <summary className="min-h-12 cursor-pointer py-2 text-base underline underline-offset-4">
        Something does not match my recording
      </summary>
      <p className="mt-2 text-base leading-7 text-ink-600">
        Flag a name, detail or missing context for checking before you share.
        Your recording will be preserved.
      </p>
      {issueId ? (
        <div className="mt-4 rounded-xl bg-sage-50 p-4">
          <p role="status">
            Your report is saved. Approval is on hold while this chapter is
            checked.
          </p>
          <p className="mt-3 text-sm leading-6">
            If you have compared this chapter with your original recording and
            it is already correct, you can withdraw your request.
          </p>
          <button
            className={`${portalSecondary} mt-3`}
            type="button"
            disabled={busy}
            onClick={() => void report(true)}
          >
            {busy ? "Saving…" : "I checked my recording; keep this version"}
          </button>
        </div>
      ) : (
        <>
          <label className="mt-3 block text-base font-medium">
            What needs checking?
            <select
              className={portalField}
              disabled={busy}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="name">A name</option>
              <option value="detail">A detail</option>
              <option value="missing_context">Missing context</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <button
            type="button"
            className={`${portalSecondary} mt-3`}
            disabled={busy}
            onClick={() => void report()}
          >
            {busy ? "Saving report…" : "Request a check before sharing"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-base text-oxblood">
          {error}
        </p>
      )}
    </details>
  );
}
