import { NextRequest, NextResponse } from "next/server";
import { securityErrorResponse, readJsonBody } from "../security/http";
import { OrganizationError } from "./service";

export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export function organizationFailure(error: unknown) {
  const protection = securityErrorResponse(error);
  if (protection) return protection;
  return NextResponse.json(
    {
      error:
        error instanceof OrganizationError
          ? error.message
          : error instanceof SyntaxError
            ? "Please provide valid gift details."
            : "We could not save or open this gift right now. Please try again.",
    },
    {
      status:
        error instanceof OrganizationError
          ? error.status
          : error instanceof SyntaxError
            ? 400
            : 503,
      headers: privateHeaders,
    },
  );
}

export async function organizationBody(
  req: NextRequest,
): Promise<Record<string, unknown>> {
  return readJsonBody(req);
}
