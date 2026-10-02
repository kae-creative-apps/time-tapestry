import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { putCollection } from "@/lib/collection/store";
import { appOrigin, linksFor, publicView } from "@/lib/collection/access";
import type {
  Collection,
  Contact,
  PostalAddress,
} from "@/lib/collection/types";
const clean = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
function contact(value: any): Contact {
  const name = clean(value?.name);
  const email = clean(value?.email).toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Name and a valid email are required for each person.");
  return { name, email, phone: clean(value?.phone, 40) };
}
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!["share", "request"].includes(b.initiationPath))
      throw new Error("Choose share or request.");
    const storyteller = contact(b.storyteller),
      recipient = contact(b.recipient),
      requester = contact(
        b.requester ||
          (b.initiationPath === "share" ? b.storyteller : b.recipient),
      );
    let address: PostalAddress | undefined;
    if (b.address?.line1) {
      address = {
        name: recipient.name,
        line1: clean(b.address.line1),
        line2: clean(b.address.line2),
        city: clean(b.address.city),
        region: clean(b.address.region),
        postalCode: clean(b.address.postalCode, 30),
        country: clean(b.address.country, 2).toUpperCase() || "US",
      };
      if (!address.city || !address.region || !address.postalCode)
        throw new Error(
          "Please complete the address, or choose to collect it later.",
        );
    }
    const now = new Date().toISOString();
    const key = () => randomBytes(32).toString("hex");
    const c: Collection = {
      schemaVersion: 2,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: b.initiationPath === "request" ? "invited" : "recording",
      ownerKey: key(),
      recipientKey: key(),
      requesterKey: key(),
      initiationPath: b.initiationPath,
      storyteller,
      recipient,
      requester,
      address,
      addressConfirmed: Boolean(address),
      invitationNote: clean(b.invitationNote, 2000),
      faithFraming: b.faithFraming === "beliefs" ? "beliefs" : "faith",
      currentQuestion: 0,
      chapterBlessings: {},
      takes: [],
      selectedTakeIds: {},
      followUps: {},
      chapters: [],
      deliveries: [],
      replies: [],
      notifications: [],
      recipientViewedChapters: {},
      replyRemindersEnabled: true,
    };
    if (c.initiationPath === "request")
      c.notifications.push({
        id: `${c.id}:invitation`,
        kind: "invitation",
        to: storyteller.email,
        subject: `${requester.name} would like to hear your story`,
        text: `${requester.name} has invited you to share stories from your life. ${c.invitationNote}\nYou can speak, type or record video. You review everything before it is shared.`,
        url: appOrigin() + linksFor(c).interview,
        dueAt: now,
        status: "pending",
      });
    await putCollection(c);
    // Sending is performed by the authenticated delivery worker, never represented as sent here.
    return NextResponse.json(
      {
        collection: publicView(
          c,
          b.initiationPath === "share" ? "owner" : "requester",
        ),
        nextUrl:
          b.initiationPath === "share"
            ? linksFor(c).interview
            : `/collection/${c.id}?key=${c.requesterKey}`,
        invitationStatus:
          c.initiationPath === "request" ? "pending" : undefined,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to create collection" },
      { status: 400 },
    );
  }
}
