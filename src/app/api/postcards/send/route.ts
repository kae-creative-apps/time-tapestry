import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/session";
import { createPostcard } from "@/lib/lob-client";

async function legacyPOST(req: NextRequest) {
  try {
    const { sessionId, toAddress, schedule } = await req.json();
    if (!sessionId || !toAddress) {
      return NextResponse.json(
        { error: "Missing sessionId or toAddress" },
        { status: 400 },
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const scheduled: Array<{
      pscId: string;
      sendDate: string;
      chapterIndex: number;
    }> = [];
    for (const item of schedule || []) {
      const chapter = session.story.chapters[item.chapterIndex];
      const postcard = await createPostcard(
        toAddress,
        `<html><body style="background:#faf6ef;color:#3a3a3a;font-family:Georgia,serif;padding:40px;"><h1>${chapter?.title || "Time Tapestry"}</h1><p>${chapter?.content?.slice(0, 200) || ""}...</p></body></html>`,
        `<html><body style="background:#faf6ef;color:#3a3a3a;font-family:Georgia,serif;padding:40px;"><p>${session.story.welcomeNote}</p><p>Read the full keepsake at ${process.env.NEXT_PUBLIC_APP_URL}/keepsake/${sessionId}</p></body></html>`,
        item.sendDate,
      );
      scheduled.push({
        pscId: postcard?.id || `mock-psc-${Date.now()}-${item.chapterIndex}`,
        sendDate: item.sendDate,
        chapterIndex: item.chapterIndex,
      });
    }

    await updateSession(sessionId, (s) => ({
      ...s,
      postcardsScheduled: [...(s.postcardsScheduled || []), ...scheduled],
    }));

    return NextResponse.json({ success: true, scheduled });
  } catch (err) {
    console.error("postcards/send error", err);
    return NextResponse.json(
      { error: "Postcard scheduling failed" },
      { status: 500 },
    );
  }
}

export const POST = withLegacyAdmin(legacyPOST);
