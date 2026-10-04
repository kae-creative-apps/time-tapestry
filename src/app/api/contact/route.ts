import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { writeRecord } from "@/lib/collection/store";
import { guardRequest, SecurityError } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    await guardRequest(request, {
      action: "contact",
      requireHuman: true,
      humanToken: body.humanToken,
    });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (
      !name ||
      name.length > 200 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      email.length > 254 ||
      !message ||
      message.length > 5000
    )
      throw new SecurityError(
        "Please add your name, a valid email and a message of up to 5,000 characters.",
        400,
      );
    const id = randomUUID();
    await writeRecord(`contact-${id}`, {
      recordType: "contact-inquiry",
      id,
      name,
      email,
      message,
      createdAt: new Date().toISOString(),
      status: "saved",
    });
    return NextResponse.json(
      { ok: true, status: "saved" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return (
      securityErrorResponse(error) ||
      NextResponse.json(
        { ok: false, error: "Unable to save your message. Please try again." },
        { status: 503 },
      )
    );
  }
}
