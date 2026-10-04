import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  processDeliveryJobs,
  emailDeliveryEnabled,
  postalDeliveryEnabled,
} from "@/lib/collection/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Delivery job authentication is not configured." },
      { status: 503 },
    );
  const expected = Buffer.from("Bearer " + secret);
  const supplied = Buffer.from(req.headers.get("authorization") || "");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!emailDeliveryEnabled() && !postalDeliveryEnabled()) {
    return NextResponse.json(
      { error: "Collection delivery is disabled." },
      { status: 503 },
    );
  }
  try {
    const result = await processDeliveryJobs();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The delivery worker could not complete. Saved jobs remain available for reconciliation or retry.",
      },
      { status: 503 },
    );
  }
}

export const GET = run;
export const POST = run;
