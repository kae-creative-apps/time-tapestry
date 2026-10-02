import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend-client";

async function legacyPOST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const result = await sendEmail({
      to: email,
      subject: "Hello from Time Tapestry",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #faf6ef; color: #3a3530; }
              h1 { font-size: 28px; line-height: 1.3; margin-bottom: 24px; }
              p { font-size: 18px; line-height: 1.6; margin-bottom: 16px; }
              .footer { font-size: 14px; color: #8a7e6e; margin-top: 40px; border-top: 1px solid #d4ccc0; padding-top: 20px; }
            </style>
          </head>
          <body>
            <h1>Hello from Time Tapestry</h1>
            <p>This is a test email to confirm that Resend is working correctly.</p>
            <p>If you&apos;re reading this, the email integration is live and ready for the hackathon demo.</p>
            <p>With care,<br>The Time Tapestry team</p>
            <div class="footer">
              <p>Time Tapestry ... Weaving the stories that matter.</p>
            </div>
          </body>
        </html>
      `,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[TEST EMAIL ERROR]", error);
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 },
    );
  }
}

export const POST = withLegacyAdmin(legacyPOST);
