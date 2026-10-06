import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCollection, mutateCollection } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { appOrigin, linksFor, publicView } from "@/lib/collection/access";
import { normalizeRecipientEmail } from "@/lib/collection/recipients";
import { guardRequest } from "@/lib/security/request";
import { assertOrigin } from "@/lib/security/policy";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const initial = await getCollection(id);
    if (
      !initial ||
      (await collectionAccessForRequest(req, initial))?.role !== "owner"
    )
      return NextResponse.json(
        { error: "Open your storyteller account to manage invitations." },
        { status: 403, headers },
      );
    assertOrigin(req);
    await guardRequest(req, { action: "collection_write", resourceId: id });
    const body = await readJsonBody(req, 32 * 1024);
    if (!["invite", "revoke"].includes(String(body.action)))
      throw new Error("Choose an invitation action.");
    const recipients = body.action === "invite" ? body.recipients : [];
    if (
      !Array.isArray(recipients) ||
      (body.action === "invite" &&
        (recipients.length < 1 || recipients.length > 25))
    )
      throw new Error(
        "Add between 1 and 25 email addresses at a time. You can invite more people in another batch.",
      );
    const invitations = recipients.map((value: unknown) => {
      if (!value || typeof value !== "object")
        throw new Error("Enter a valid recipient email address.");
      const item = value as Record<string, unknown>;
      const email =
        typeof item.email === "string"
          ? normalizeRecipientEmail(item.email)
          : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Enter a valid recipient email address.");
      if (
        item.name !== undefined &&
        (typeof item.name !== "string" || item.name.length > 120)
      )
        throw new Error("Keep recipient names under 120 characters.");
      return {
        email,
        name: typeof item.name === "string" ? item.name.trim() : "",
      };
    });
    const next = await mutateCollection(id, async (c) => {
      if ((await collectionAccessForRequest(req, c))?.role !== "owner")
        throw new Error("Open your storyteller account to manage invitations.");
      if (c.status !== "approved")
        throw new Error(
          "Submit your approved collection before inviting additional people.",
        );
      const now = new Date().toISOString();
      c.additionalRecipients ??= [];
      if (body.action === "revoke") {
        const recipient = c.additionalRecipients.find(
          (item) => item.id === body.recipientId,
        );
        if (!recipient)
          throw new Error("That additional recipient could not be found.");
        recipient.revokedAt ??= now;
        for (const notification of c.notifications)
          if (
            notification.kind === "recipient_invitation" &&
            notification.recipientId === recipient.id &&
            ["pending", "failed"].includes(notification.status)
          ) {
            notification.status = "suppressed";
            notification.error = "This recipient's access was removed.";
          }
        return c;
      }
      for (const invitation of invitations) {
        if (
          [c.recipient.email, c.storyteller.email].some(
            (email) => normalizeRecipientEmail(email) === invitation.email,
          )
        )
          continue;
        let recipient = c.additionalRecipients.find(
          (item) => normalizeRecipientEmail(item.email) === invitation.email,
        );
        if (recipient && !recipient.revokedAt) continue;
        if (recipient) {
          recipient.revokedAt = undefined;
          recipient.invitationVersion = (recipient.invitationVersion || 1) + 1;
          recipient.invitedAt = now;
          if (invitation.name) recipient.name = invitation.name;
        } else {
          recipient = {
            id: randomUUID(),
            email: invitation.email,
            name: invitation.name || undefined,
            invitedAt: now,
            invitationVersion: 1,
          };
          c.additionalRecipients.push(recipient);
        }
        c.notifications.push({
          id: `${c.id}:recipient:${recipient.id}:invitation:${recipient.invitationVersion}`,
          kind: "recipient_invitation",
          recipientId: recipient.id,
          to: recipient.email,
          subject: `${c.storyteller.name} has shared a Time Tapestry collection with you`,
          text: `${c.storyteller.name} has shared four recorded stories with you. Open the collection and sign in with ${recipient.email} to watch. Your replies are shared privately with ${c.storyteller.name}.`,
          url: appOrigin() + linksFor(c).collection,
          dueAt: now,
          status: "pending",
        });
      }
      return c;
    });
    return NextResponse.json(
      { collection: publicView(next, "owner") },
      { headers },
    );
  } catch (error) {
    const protection = securityErrorResponse(error);
    if (protection) return protection;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Your invitations could not be saved. Please try again.",
      },
      { status: 400, headers },
    );
  }
}
