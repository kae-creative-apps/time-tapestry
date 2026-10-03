import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { requireOwner, roleFor } from "@/lib/collection/access";
import {
  attachReadyFilms,
  enqueueStoryFilms,
  filmJobMatches,
  filmJobView,
  filmWorkerHealthy,
  latestFilmJob,
  retryStoryFilms,
} from "@/lib/collection/films/jobstore";
import { filmsAvailable } from "@/lib/collection/films/provider";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || roleFor(c, req.nextUrl.searchParams.get("key") || "") !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required." },
        { status: 403, headers },
      );
    const job = await latestFilmJob(id);
    const view = job ? filmJobView(job) : null;
    if (job && view && !filmJobMatches(job, c)) {
      view.status = "stale";
      view.error =
        "Your story text changed. Review the current scripts and create new films.";
    }
    const workerAvailable = await filmWorkerHealthy();
    return NextResponse.json(
      {
        job: view,
        available: filmsAvailable() && workerAvailable,
        workerAvailable,
        ...(!workerAvailable
          ? {
              notice:
                "The film worker is offline. Saved stories and completed films remain available. Queued films will wait for the worker.",
            }
          : {}),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Film progress could not be loaded. Your stories remain saved.",
      },
      { status: 503, headers },
    );
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    const role = c && roleFor(c, req.nextUrl.searchParams.get("key") || "");
    if (!c || role !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required." },
        { status: 403, headers },
      );
    requireOwner(c, role);
    const body = await readJsonBody(req, 4096);
    if (!["generate", "enqueue", "retry"].includes(String(body.action)))
      throw new Error("Choose generate or retry.");
    if (body.scriptsApproved !== true)
      throw new Error(
        "Review all four scripts and approve AI narration with your interviewer's voice first.",
      );
    await guardRequest(req, { action: "render_film", resourceId: id });
    if (!(await filmWorkerHealthy()))
      return NextResponse.json(
        {
          error:
            "The film worker is offline. Your stories are saved. Please try when the worker is available.",
        },
        { status: 503, headers },
      );
    const job =
      body.action === "retry"
        ? await retryStoryFilms(
            c,
            typeof body.jobId === "string" ? body.jobId : "",
            true,
          )
        : await enqueueStoryFilms(c, true);
    if (job.status === "ready") await attachReadyFilms(job);
    return NextResponse.json(
      { job: filmJobView(job), available: filmsAvailable() },
      { status: job.status === "ready" ? 200 : 202, headers },
    );
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return security;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The films could not be queued. Your stories remain saved.",
      },
      { status: 400, headers },
    );
  }
}
