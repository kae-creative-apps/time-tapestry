import { NextRequest, NextResponse } from "next/server";
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
  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (declaredLength > 1024 * 1024)
    return NextResponse.json(
      { error: "Event body is too large." },
      { status: 413 },
    );
  const body = await req.text();
  if (Buffer.byteLength(body) > 1024 * 1024)
    return NextResponse.json(
      { error: "Event body is too large." },
      { status: 413 },
    );
  if (
    !verifyLobSignature(
      body,
      req.headers.get("lob-signature") || "",
      req.headers.get("lob-signature-timestamp") || "",
      secret,
    )
  ) {
    return NextResponse.json(
      { error: "Invalid webhook signature or timestamp." },
      { status: 401 },
    );
  }
  let event;
  try {
    event = parseLobEvent(JSON.parse(body));
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
