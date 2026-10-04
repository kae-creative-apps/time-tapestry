import { NextRequest, NextResponse } from "next/server";
import { readRawBody, securityErrorResponse } from "@/lib/security/http";
import {
  parseLobEvent,
  receiveLobEvent,
  verifyLobSignature,
} from "@/lib/collection/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.LOB_WEBHOOK_SECRET;
  if (!secret || secret === "secret") {
    return NextResponse.json(
      { error: "A private Lob webhook signing secret is required." },
      { status: 503 },
    );
  }
  const signature = req.headers.get("lob-signature") || "";
  const timestamp = req.headers.get("lob-signature-timestamp") || "";
  const milliseconds = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (
    !/^[a-fA-F0-9]{64}$/.test(signature) ||
    !/^\d{10}(?:\d{3})?$/.test(timestamp) ||
    !Number.isFinite(milliseconds) ||
    Math.abs(Date.now() - milliseconds) > 5 * 60 * 1000
  ) {
    await req.body?.cancel().catch(() => {});
    return NextResponse.json(
      { error: "Invalid webhook signature or timestamp." },
      { status: 401 },
    );
  }
  let body: Buffer;
  try {
    body = await readRawBody(req, 1024 * 1024, "Event body is too large.");
  } catch (error) {
    return (
      securityErrorResponse(error) ||
      NextResponse.json(
        { error: "Invalid postcard event body." },
        { status: 400 },
      )
    );
  }
  if (!verifyLobSignature(body, signature, timestamp, secret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature or timestamp." },
      { status: 401 },
    );
  }
  let event;
  try {
    event = parseLobEvent(JSON.parse(body.toString("utf8")));
  } catch {
    return NextResponse.json(
      { error: "Invalid postcard event." },
      { status: 400 },
    );
  }
  const hasMailingEvidence =
    [
      "postcard.mailed",
      "postcard.in_transit",
      "postcard.in_local_area",
      "postcard.processed_for_delivery",
      "postcard.delivered",
    ].includes(event.event_type.id) ||
    event.body.tracking_events?.some(
      (t) => t.name === "Mailed" || t.name === "In Transit",
    );
  if (process.env.LOB_API_KEY?.startsWith("test_") && hasMailingEvidence) {
    return NextResponse.json(
      { error: "Test postcards do not have confirmed mailing events." },
      { status: 422 },
    );
  }
  try {
    const result = await receiveLobEvent(event);
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Postcard is not recorded yet."
    ) {
      return NextResponse.json(
        { error: "Postcard is not recorded yet. Retry this event." },
        { status: 409 },
      );
    }
    if (
      error instanceof Error &&
      error.message.includes("tracking timestamp")
    ) {
      return NextResponse.json(
        {
          error: "Mail confirmation needs a valid carrier tracking timestamp.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Event could not be stored. Retry this event." },
      { status: 503 },
    );
  }
}
