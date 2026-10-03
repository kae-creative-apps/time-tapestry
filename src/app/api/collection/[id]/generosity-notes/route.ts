import { NextRequest, NextResponse } from "next/server";
import { publicView } from "@/lib/collection/access";
import { collectionRoleForRequest } from "@/lib/collection/request-access";
import { getCollection, mutateCollection } from "@/lib/collection/store";
import {
  GenerosityNotesInputError,
  normalizeGenerosityNotesValues,
} from "@/lib/collection/generosity-notes";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { assertOrigin, SecurityError } from "@/lib/security/policy";
import { guardRequest } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const initial = await getCollection(id);
    if (!initial || (await collectionRoleForRequest(req, initial)) !== "owner")
      return NextResponse.json(
        { error: "Open your private storyteller link to save these notes." },
        { status: 403, headers },
      );
    assertOrigin(req);
    await guardRequest(req, { action: "collection_write", resourceId: id });
    const body = await readJsonBody(req, 64 * 1024);
    if (Object.keys(body).some((key) => !["revision", "values"].includes(key)))
      throw new GenerosityNotesInputError(
        "These private notes contain an unrecognized field.",
      );
    if (
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0 ||
      (body.revision as number) >= Number.MAX_SAFE_INTEGER
    )
      throw new GenerosityNotesInputError(
        "Reopen your saved notes before saving changes.",
      );
    const values = normalizeGenerosityNotesValues(body.values);
    const next = await mutateCollection(id, async (c) => {
      if ((await collectionRoleForRequest(req, c)) !== "owner")
        throw new SecurityError(
          "Open your private storyteller link to save these notes.",
          403,
        );
      const revision = c.privateGenerosityNotes?.revision || 0;
      if (body.revision !== revision)
        throw new SecurityError(
          "Your saved notes changed in another session. Check the saved notes before saving again.",
          409,
        );
      // Approved family stories stay frozen. This separate notebook can still be updated.
      c.privateGenerosityNotes = {
        version: 1,
        updatedAt: new Date().toISOString(),
        revision: revision + 1,
        values,
      };
      return c;
    });
    return NextResponse.json(
      { collection: publicView(next, "owner") },
      { headers },
    );
  } catch (error) {
    return (
      securityErrorResponse(error) ||
      NextResponse.json(
        {
          error:
            error instanceof GenerosityNotesInputError
              ? error.message
              : "Your private notes could not be saved. Keep this page open and try again.",
        },
        {
          status: error instanceof GenerosityNotesInputError ? 400 : 503,
          headers,
        },
      )
    );
  }
}
