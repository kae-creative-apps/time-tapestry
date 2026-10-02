import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend-client";

async function legacyPOST(req: NextRequest) {
  try {
    const { to, subject, text, html } = await req.json();
    if (!to || !subject || !text) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const result = await sendEmail({ to, subject, text, html });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("email/send error", err);
    return NextResponse.json({ error: "Email failed" }, { status: 500 });
  }
}

export const POST = withLegacyAdmin(legacyPOST);
