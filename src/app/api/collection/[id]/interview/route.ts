import { NextRequest, NextResponse } from "next/server";
import {
  getCollection,
  getMedia,
  mutateCollection,
} from "@/lib/collection/store";
import { publicView, requireOwner, roleFor } from "@/lib/collection/access";
import {
  applyInterviewAction,
  InterviewInputError,
} from "@/lib/collection/interview";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const key = req.nextUrl.searchParams.get("key") || "";
    const initial = await getCollection(id);
    const role = initial && roleFor(initial, key);
    if (!initial || !role)
      return NextResponse.json(
        { error: "This private link is not valid." },
        { status: 404, headers },
      );
    if (role !== "owner")
      return NextResponse.json(
        { error: "Open your interview link to save a conversation." },
        { status: 403, headers },
      );
    const raw = await req.text();
    if (raw.length > 1_000_000)
      return NextResponse.json(
        {
          error:
            "Save this conversation in smaller updates. Your local words are unchanged.",
        },
        { status: 413, headers },
      );
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid interview update." },
        { status: 400, headers },
      );
    }
    const next = await mutateCollection(id, async (c) => {
      requireOwner(c, roleFor(c, key));
      return applyInterviewAction(c, input, getMedia);
    });
    return NextResponse.json(
      { collection: publicView(next, "owner") },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Your conversation could not be saved. Keep this page open and retry.",
      },
      {
        status: error instanceof InterviewInputError ? error.status : 400,
        headers,
      },
    );
  }
}
