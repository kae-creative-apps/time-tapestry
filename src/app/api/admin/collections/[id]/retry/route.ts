import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  adminReadHeaders,
  adminRetryOverrideAvailable,
  auditAdminRead,
} from "@/lib/admin-collections";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody } from "@/lib/security/http";
import { SecurityError } from "@/lib/security/policy";
import {
  enqueueInterviewPreparation,
  getInterviewPreparationView,
  InterviewPreparationError,
} from "@/lib/collection/interview-preparation";
import {
  adminFilmRetryOverrideAllowed,
  adminRetryOverrideReason,
  latestFilmJob,
  retryStoryFilms,
} from "@/lib/collection/films/jobstore";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { account } = await requireAdmin(req);
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      throw new SecurityError("Collection not found.", 404);
    await guardRequest(req, { action: "generate", resourceId: id });
    const body = await readJsonBody(req, 2048);
    if (
      body.action !== "retry_preparation" ||
      typeof body.expectedUpdatedAt !== "string"
    )
      throw new SecurityError(
        "Refresh the collection before retrying preparation.",
        400,
      );
    const reason = adminRetryOverrideReason(body.reason);
    const result = await enqueueInterviewPreparation(id, {
      processingApproved: true,
      retry: true,
      authorize: async (current) => {
        await requireAdmin(req);
        if (current.updatedAt !== body.expectedUpdatedAt)
          throw new SecurityError(
            "This collection changed. Refresh before retrying.",
            409,
          );
        const view = await getInterviewPreparationView(current);
        const film = await latestFilmJob(current.id);
        const canRetry =
          current.status !== "approved" &&
          Boolean(view?.processingApprovedAt) &&
          view?.canRetry === true;
        const canOverride = adminRetryOverrideAvailable(current, view, film);
        if (!canRetry && !canOverride)
          throw new SecurityError(
            "This preparation needs an operator check before it can be retried.",
            409,
          );
        if (canOverride) {
          if (!reason) throw new SecurityError("Say why this retry is needed.", 400);
          if (film && adminFilmRetryOverrideAllowed(film))
            await retryStoryFilms(current, film.id, true, "original", {
              reason,
              actor: { accountId: account.id, email: account.email },
            });
        }
        await auditAdminRead(req, "retry_preparation", id, undefined, {
          ...(reason ? { reason } : {}),
        });
      },
      ...(reason
        ? {
            adminOverride: {
              reason,
              actor: { accountId: account.id, email: account.email },
            },
          }
        : {}),
    });
    return NextResponse.json(
      { ok: true, preparation: result.preparation },
      { status: 202, headers: adminReadHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SecurityError ||
          error instanceof InterviewPreparationError
            ? error.message
            : "Preparation could not be queued. Saved recordings are unchanged.",
      },
      {
        status:
          error instanceof SecurityError ||
          error instanceof InterviewPreparationError
            ? error.status
            : 503,
        headers: adminReadHeaders,
      },
    );
  }
}
