import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { createSession, InitiationPath } from "@/lib/session";
import { appUrl, invitationEmail, sendEmail } from "@/lib/resend-client";

async function legacyPOST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      initiationPath,
      grandchild,
      grandparent,
      familyId,
      familyName,
      invite,
    } = body;

    if (!initiationPath || !grandchild?.name || !grandparent?.name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const session = await createSession({
      initiationPath: initiationPath as InitiationPath,
      grandchild: {
        name: grandchild.name,
        email: grandchild.email || "",
      },
      grandparent: {
        name: grandparent.name,
        email: grandparent.email || "",
      },
      familyId: familyId || undefined,
      familyName: familyName || undefined,
      invite: invite
        ? {
            name: invite.name || "",
            email: invite.email || "",
            note: invite.note || "",
          }
        : undefined,
    });

    // deliberate: email failure must not block session creation
    if (session.initiationPath === "request" && session.grandparent.email) {
      try {
        const { subject, html, text } = invitationEmail(
          session.grandparent.name,
          session.grandchild.name,
          `${appUrl}/interview/${session.id}`,
        );
        const emailResult = await sendEmail({
          to: session.grandparent.email,
          subject,
          html,
          text,
        });
        console.log("[session/create] invitation email result:", emailResult);
      } catch (emailErr) {
        console.error(
          "[session/create] invitation email failed, session created anyway:",
          emailErr,
        );
      }
    }

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error("session/create error", err);
    const message =
      err instanceof Error ? err.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withLegacyAdmin(legacyPOST);
