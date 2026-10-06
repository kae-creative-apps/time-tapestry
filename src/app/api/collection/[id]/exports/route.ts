import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import {
  attachReadyFilms,
  enqueuePlaybackExport,
  filmJobView,
  filmWorkerHealthy,
  getFilmJob,
  latestFilmJob,
  retryStoryFilms,
} from "@/lib/collection/films/jobstore";
import { playbackReady, playbackExportJobId } from "@/lib/collection/playback";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || (await collectionAccessForRequest(req, c))?.role !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required." },
        { status: 403, headers },
      );
    const source = await latestFilmJob(id);
    const job =
      source?.outputMode === "interactive"
        ? await getFilmJob(playbackExportJobId(source.id))
        : null;
    return NextResponse.json(
      {
        job: job ? filmJobView(job) : null,
        workerAvailable: await filmWorkerHealthy(),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Video export progress could not be loaded." },
      { status: 503, headers },
    );
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || (await collectionAccessForRequest(req, c))?.role !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required." },
        { status: 403, headers },
      );
    const body = await readJsonBody(req, 4096);
    if (!["request", "retry"].includes(String(body.action)))
      throw new Error("Choose a video export option.");
    await guardRequest(req, { action: "render_film", resourceId: id });
    const source = await latestFilmJob(id);
    if (
      !source ||
      source.status !== "ready" ||
      !(await playbackReady(c, source))
    )
      throw new Error("Your four chapters are still being prepared.");
    let job = await getFilmJob(playbackExportJobId(source.id));
    if (job?.status !== "ready" && !(await filmWorkerHealthy()))
      return NextResponse.json(
        {
          error:
            "Video export is temporarily unavailable. Your chapters remain available.",
        },
        { status: 503, headers },
      );
    if (body.action === "retry") {
      if (!job || body.jobId !== job.id || job.sourceJobId !== source.id)
        throw new Error("Choose the current video export to retry.");
      job = await retryStoryFilms(c, job.id, true, "original");
    } else job = await enqueuePlaybackExport(c);
    if (job.status === "ready") await attachReadyFilms(job);
    return NextResponse.json(
      { job: filmJobView(job) },
      { status: job.status === "ready" ? 200 : 202, headers },
    );
  } catch (error) {
    return (
      securityErrorResponse(error) ||
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Your video export could not be queued.",
        },
        { status: 400, headers },
      )
    );
  }
}
