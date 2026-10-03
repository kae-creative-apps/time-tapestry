import { NextRequest, NextResponse } from "next/server";
import { OrganizationError } from "./service";

export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export function organizationFailure(error: unknown) {
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
  const max = 64 * 1024;
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new OrganizationError(
      "These details are too long. Please shorten them and try again.",
      413,
    );
  const text = await req.text();
  if (Buffer.byteLength(text) > max)
    throw new OrganizationError(
      "These details are too long. Please shorten them and try again.",
      413,
    );
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OrganizationError("Please provide valid gift details.", 400);
  return value as Record<string, unknown>;
}
