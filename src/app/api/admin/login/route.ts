import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminSecret,
  createAdminSession,
  ADMIN_SESSION_SECONDS,
} from "@/lib/admin-auth";

const ADMIN_COOKIE = "admin_token";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: NextRequest) {
  try {
    await guardRequest(request, { action: "admin_login" });
    const { secret } = (await readJsonBody(request)) as { secret?: string };

    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );
    }

    if (!secret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );
    }

    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(ADMIN_COOKIE, createAdminSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ADMIN_SESSION_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    const protection = securityErrorResponse(error);
    if (protection) return protection;
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers },
    );
  }
}
