import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { requireOwner, roleFor } from "@/lib/collection/access";
import {
  attachReadyFilms,
  enqueueOriginalFilms,
  enqueueAutomaticOriginalFilms,
  getFilmJob,
  filmJobInputsCurrent,
  filmJobView,
  filmWorkerHealthy,
  latestFilmJob,
  retryStoryFilms,
} from "@/lib/collection/films/jobstore";
import {
  getOriginalFilmEdit,
  originalFilmSources,
  saveOriginalFilmEdit,
  OriginalEditConflict,
} from "@/lib/collection/films/original-plan";
import { automaticFilmsAvailable } from "@/lib/collection/films/transcription";
import { RECORDING_ONLY_FILMS_MESSAGE } from "@/lib/collection/films/policy";
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
    const [job, originalPlan, sources, workerAvailable] = await Promise.all([
      latestFilmJob(id),
      getOriginalFilmEdit(id),
      originalFilmSources(c),
      filmWorkerHealthy(),
    ]);
    const view = job ? filmJobView(job) : null;
    if (job?.mode === "original" && view && !(await filmJobInputsCurrent(job, c))) {
      view.status = "stale";
      view.error =
        "Your story or selected recordings changed. Review the current version and create new films.";
    }
    return NextResponse.json(
      {
        job: view,
        originalPlan,
        sources,
        available: false,
        recordingOnly: true,
        originalAvailable: workerAvailable,
        automaticAvailable: automaticFilmsAvailable() && workerAvailable,
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
    const body = await readJsonBody(req, 32768);
    const action = String(body.action);
    if (["generate", "enqueue", "retry"].includes(action)) {
      return NextResponse.json({error: RECORDING_ONLY_FILMS_MESSAGE}, {status: 410, headers});
    }
    if (action === "save_original_plan") {
      await guardRequest(req, { action: "collection_write", resourceId: id });
      const originalPlan = await saveOriginalFilmEdit(
        c,
        body.chapters,
        body.baseRevisionHash,
      );
      return NextResponse.json({ originalPlan }, { headers });
    }
    if (
      ![
        "generate_original",
        "retry_original",
        "prepare_automatic",
        "retry_automatic",
      ].includes(action)
    )
      throw new Error("Choose a film generation or retry option.");
    const automatic =
      action === "prepare_automatic" || action === "retry_automatic";
    const original =
      action === "generate_original" ||
      action === "retry_original" ||
      automatic;
    if (
      automatic
        ? body.processingApproved !== true
        : original
          ? body.cutsApproved !== true || body.allowNoCaptions !== true
          : body.scriptsApproved !== true
    )
      throw new Error(
        automatic
          ? "Confirm automatic transcription and editing of your original recordings first."
          : original
            ? "Review every selected clip and confirm original sound without timed captions."
            : RECORDING_ONLY_FILMS_MESSAGE,
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
    if (automatic && !automaticFilmsAvailable())
      throw new Error(
        "Automatic source transcription is not configured. Your recordings remain saved.",
      );
    let job;
    if (action.startsWith("retry")) {
      const previous = await getFilmJob(
        typeof body.jobId === "string" ? body.jobId : "",
      );
      if (original && (previous?.preparation === "automatic") !== automatic)
        throw new Error("Choose the matching original-film retry option.");
      job = await retryStoryFilms(
        c,
        typeof body.jobId === "string" ? body.jobId : "",
        true,
        "original",
      );
    } else if (automatic)
      job = await enqueueAutomaticOriginalFilms(c, {
        processingApproved: true,
        presentation: body.presentation === "audio" ? "audio" : "video",
      });
    else if (original)
      job = await enqueueOriginalFilms(
        c,
        typeof body.planHash === "string" ? body.planHash : "",
        true,
        true,
      );
    else throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
    if (job.status === "ready") await attachReadyFilms(job);
    return NextResponse.json(
      {
        job: filmJobView(job),
        available: false,
        recordingOnly: true,
        originalAvailable: true,
        automaticAvailable: automaticFilmsAvailable(),
        workerAvailable: true,
      },
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
      { status: error instanceof OriginalEditConflict ? 409 : 400, headers },
    );
  }
}
