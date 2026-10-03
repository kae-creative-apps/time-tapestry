import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { appUrl, sendEmail } from "@/lib/resend-client";
import { BRAND_COLORS } from "@/lib/brand-art";

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
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background: ${BRAND_COLORS.paper}; color: ${BRAND_COLORS.espresso}; }
              h1 { font-family: 'Arial Rounded MT Bold', Arial, sans-serif; font-size: 28px; line-height: 1.3; margin-bottom: 24px; }
              p { font-size: 18px; line-height: 1.6; margin-bottom: 16px; }
              .footer { font-size: 14px; color: ${BRAND_COLORS.taupe}; margin-top: 40px; border-top: 1px solid #e5e2db; padding-top: 20px; }
            </style>
          </head>
          <body>
            <img src="${new URL("/brand/time-tapestry-lockup.png", appUrl).href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="Time Tapestry" width="190" height="57" style="display:block;width:190px;max-width:100%;height:auto;margin:0 0 32px;">
            <h1>Hello from Time Tapestry</h1>
            <p>This is a test email to confirm that Resend is working correctly.</p>
            <p>If you&apos;re reading this, the email integration is live and ready for the hackathon demo.</p>
            <p>With care,<br>The Time Tapestry team</p>
            <div class="footer">
              <p>Time Tapestry · Stories woven together</p>
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
