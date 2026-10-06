import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { requireOwner } from "@/lib/collection/access";
import { playbackReady } from "@/lib/collection/playback";
import {
  attachReadyFilms,
  enqueueAutomaticOriginalFilms,
  filmJobView,
  filmWorkerHealthy,
  getFilmJob,
  latestFilmJob,
  retryStoryFilms,
} from "@/lib/collection/films/jobstore";
import { automaticFilmsAvailable } from "@/lib/collection/films/transcription";
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
    const current = await latestFilmJob(id);
    const job = current?.outputMode === "interactive" ? current : null;
    return NextResponse.json(
      {
        job: job ? filmJobView(job) : null,
        ready: await playbackReady(c, job),
        workerAvailable: await filmWorkerHealthy(),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Chapter progress could not be loaded. Your recordings remain saved.",
      },
      { status: 503, headers },
    );
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    const access = c && (await collectionAccessForRequest(req, c));
    if (!c || access?.role !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required." },
        { status: 403, headers },
      );
    requireOwner(c, access.role);
    const body = await readJsonBody(req, 4096);
    if (
      !["prepare", "retry"].includes(String(body.action)) ||
      body.processingApproved !== true
    )
      throw new Error(
        "Confirm processing of your original recordings to prepare your chapters.",
      );
    await guardRequest(req, { action: "render_film", resourceId: id });
    if (!(await filmWorkerHealthy()))
      return NextResponse.json(
        {
          error:
            "Chapter preparation is temporarily unavailable. Your recordings remain saved.",
        },
        { status: 503, headers },
      );
    if (!automaticFilmsAvailable())
      throw new Error(
        "Recording transcription is not configured. Your recordings remain saved.",
      );
    let job;
    if (body.action === "retry") {
      const previous = await getFilmJob(
        typeof body.jobId === "string" ? body.jobId : "",
      );
      if (
        previous?.collectionId !== id ||
        previous.outputMode !== "interactive" ||
        previous.sourceJobId
      )
        throw new Error("Choose the current chapter preparation to retry.");
      job = await retryStoryFilms(c, previous.id, true, "original");
    } else
      job = await enqueueAutomaticOriginalFilms(c, {
        processingApproved: true,
        presentation: "audio",
        outputMode: "interactive",
      });
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
              : "Your chapters could not be queued.",
        },
        { status: 400, headers },
      )
    );
  }
}
