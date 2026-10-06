import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { getInterviewPreparationView } from "@/lib/collection/interview-preparation";

const noStore = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    const access = c && (await collectionAccessForRequest(req, c));
    if (!c || access?.role !== "owner")
      return NextResponse.json(
        { error: "Open your private storyteller link to see preparation." },
        { status: 404, headers: noStore },
      );
    return NextResponse.json(
      { preparation: await getInterviewPreparationView(c) },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Preparation progress is temporarily unavailable. Your recordings are preserved.",
      },
      { status: 503, headers: noStore },
    );
  }
}
