import { NextRequest, NextResponse } from "next/server";
import { getCollection, mutateCollection } from "@/lib/collection/store";
import {
  collectionAccessForRequest,
  type CollectionAccess,
} from "@/lib/collection/request-access";
import type { Collection } from "@/lib/collection/types";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { SecurityError } from "@/lib/security/policy";
import {
  pipelineContext,
  withPipelineStage,
} from "@/lib/observability/pipeline-logger";
import {
  AddressVerificationError,
  normalizePostalAddress,
  verifyPostalAddress,
} from "@/lib/lob/address-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function mayChangeAddress(c: Collection, access: CollectionAccess | null) {
  return (
    access?.role === "owner" ||
    (access?.role === "recipient" && access.isPrimaryRecipient) ||
    (access?.role === "requester" && c.requester.email === c.recipient.email)
  );
}

export async function POST(req: NextRequest) {
  const trace = pipelineContext(
    req.nextUrl.searchParams.get("collectionId") || undefined,
  );
  try {
    const id = req.nextUrl.searchParams.get("collectionId") || "";
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      throw new SecurityError(
        "Open your private address page to continue.",
        404,
      );
    const c = await getCollection(id);
    const access = c && (await collectionAccessForRequest(req, c));
    if (!c || !mayChangeAddress(c, access))
      throw new SecurityError(
        "Open your private address page or verify the recipient email to continue.",
        403,
      );
    const guard = await guardRequest(req, {
      action: "verify_address",
      resourceId: id,
    });
    const body = await readJsonBody(req, 4096);
    const address = normalizePostalAddress(body.address, c.recipient.name);
    const { result, receipt } = await withPipelineStage(
      "LOB_VERIFICATION",
      trace,
      () => verifyPostalAddress(id, address, guard.reserveProviderBudget),
      "lob",
    );
    if (receipt) {
      await mutateCollection(id, async (current) => {
        const currentAccess = await collectionAccessForRequest(req, current);
        if (
          !mayChangeAddress(current, currentAccess) ||
          current.recipient.email !== c.recipient.email ||
          current.recipient.name !== c.recipient.name
        )
          throw new SecurityError(
            "The recipient changed. Refresh this page before checking the address.",
            409,
          );
        current.pendingAddressVerification = receipt;
        return current;
      });
    }
    return NextResponse.json(
      { ...result, traceId: trace.traceId },
      { headers },
    );
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return security;
    return NextResponse.json(
      {
        error:
          error instanceof AddressVerificationError
            ? error.message
            : "Your address could not be checked. Please try again.",
        traceId: trace.traceId,
      },
      {
        status: error instanceof AddressVerificationError ? error.status : 503,
        headers,
      },
    );
  }
}
