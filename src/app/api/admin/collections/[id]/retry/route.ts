import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminReadHeaders, auditAdminRead } from "@/lib/admin-collections";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody } from "@/lib/security/http";
import { SecurityError } from "@/lib/security/policy";
import {
  enqueueInterviewPreparation,
  getInterviewPreparationView,
  InterviewPreparationError,
} from "@/lib/collection/interview-preparation";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(req);
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
        if (
          current.status === "approved" ||
          !view?.processingApprovedAt ||
          !view.canRetry
        )
          throw new SecurityError(
            "This preparation needs an operator check before it can be retried.",
            409,
          );
        await auditAdminRead(req, "retry_preparation", id);
      },
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
