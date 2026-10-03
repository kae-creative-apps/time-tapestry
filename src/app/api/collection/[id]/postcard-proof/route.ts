import { NextRequest, NextResponse } from "next/server";
import { getCollection, mutateCollection } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import {
  normalizePublicPostcardMessages,
  publicPostcardMessage,
} from "@/lib/collection/postcard-public-message";
import { PostcardLayoutError } from "@/lib/collection/postcard-fit";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import {
  approvePostcardProof,
  buildPostcardProof,
  postcardDeliveryReadiness,
  postcardProofIsCurrent,
  postcardFirstDate,
  postcardPublicMessagesHash,
  prepareAutomaticPostcards,
  PostcardProofError,
  releasePostcardProof,
} from "@/lib/collection/postcard-proofs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  return (
    securityErrorResponse(error) ||
    NextResponse.json(
      {
        error:
          error instanceof PostcardProofError ||
          error instanceof PostcardLayoutError
            ? error.message
            : "The print proof could not be saved.",
      },
      {
        status: error instanceof PostcardProofError ? error.status : 400,
        headers,
      },
    )
  );
}
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || roleFor(c, req.nextUrl.searchParams.get("key") || "") !== "owner")
      return NextResponse.json(
        {
          error:
            "Open your private storyteller link to review the print proof.",
        },
        { status: 403, headers },
      );
    const first =
      req.nextUrl.searchParams.get("firstMailingAt") ||
      c.postcardProof?.firstMailingAt ||
      new Date().toISOString();
    const current = postcardProofIsCurrent(c);
    const proof =
      current &&
      c.postcardProof &&
      postcardFirstDate(first) === c.postcardProof.firstMailingAt
        ? c.postcardProof
        : await buildPostcardProof(c, first);
    return NextResponse.json(
      {
        proof,
        approvedProof: c.postcardProof || null,
        current,
        readiness: postcardDeliveryReadiness(),
        publicMessages: Object.fromEntries(
          c.chapters.map((chapter) => [
            chapter.id,
            publicPostcardMessage(c, chapter.id),
          ]),
        ),
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const key = req.nextUrl.searchParams.get("key") || "";
    const initial = await getCollection(id);
    if (!initial || roleFor(initial, key) !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required." },
        { status: 403, headers },
      );
    await guardRequest(req, { action: "collection_write", resourceId: id });
    const body = await readJsonBody(req, 4096);
    if (body.action === "save_messages") {
      const next = await mutateCollection(id, async (c) => {
        if (roleFor(c, key) !== "owner")
          throw new PostcardProofError("Storyteller access required.", 403);
        if (c.status !== "approved" || c.chapters.length !== 4)
          throw new PostcardProofError(
            "Approve your four private stories before preparing postcards.",
          );
        if (
          c.deliveries.some(
            (delivery) =>
              delivery.providerId || (delivery.dispatch?.attempts || 0) > 0,
          )
        )
          throw new PostcardProofError(
            "A mailing is in progress. Ask the team to check it before changing the printed words.",
            409,
          );
        try {
          c.postcardPublicMessages = normalizePublicPostcardMessages(
            body.messages,
            c.chapters.map((chapter) => chapter.id),
          );
        } catch (error) {
          throw new PostcardProofError(
            error instanceof Error
              ? error.message
              : "Check the public postcard messages.",
          );
        }
        c.postcardPublicConsent = undefined;
        c.deliveries = [];
        c.postcardPreparation = {
          status: "needs_attention",
          message:
            "Review and approve the public postcard messages before mailing.",
          updatedAt: new Date().toISOString(),
        };
        return c;
      });
      return NextResponse.json(
        { saved: true, publicMessages: next.postcardPublicMessages },
        { headers },
      );
    }
    if (body.action !== "approve" && body.action !== "release")
      throw new PostcardProofError(
        "Choose whether to approve the proof or release the approved mailing.",
      );
    if (typeof body.proofHash !== "string")
      throw new PostcardProofError("Open the print proof before approving it.");
    if (body.action === "approve" && body.reviewed !== true)
      throw new PostcardProofError(
        "Check all four cards, the address and the schedule before approving the proof.",
      );
    if (body.action === "approve" && body.publicMessageApproved !== true)
      throw new PostcardProofError(
        "Confirm that these postcard messages and printed names may be read by anyone handling the mail.",
      );
    if (body.action === "release" && body.confirmRelease !== true)
      throw new PostcardProofError(
        "Confirm that the approved postcards should be released for mailing.",
      );
    const next = await mutateCollection(id, async (c) => {
      if (roleFor(c, key) !== "owner")
        throw new PostcardProofError("Storyteller access required.", 403);
      if (body.action === "release")
        return releasePostcardProof(c, body.proofHash as string);
      const proof = await buildPostcardProof(
        c,
        String(body.firstMailingAt || ""),
      );
      if (proof.hash !== body.proofHash)
        throw new PostcardProofError(
          "The print proof changed. Open and review the current cards again.",
          409,
        );
      c.postcardPublicConsent = {
        version: 2,
        messagesHash: postcardPublicMessagesHash(c),
        approvedAt: new Date().toISOString(),
      };
      c.autoPostcards = true;
      approvePostcardProof(c, proof, body.proofHash as string);
      return prepareAutomaticPostcards(c);
    });
    return NextResponse.json(
      {
        approvedProof: next.postcardProof,
        current: postcardProofIsCurrent(next),
        readiness: postcardDeliveryReadiness(),
        deliveries: next.deliveries,
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
