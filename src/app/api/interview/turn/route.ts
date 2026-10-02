import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/session";
import { mockTranscribe, transcribeAudio } from "@/lib/whisper-client";
import { chat } from "@/lib/gloo-client";
import { interviewerSystemPrompt } from "@/prompts/interviewer-system";
import {
  CORE_QUESTIONS,
  OPTIONAL_QUESTIONS,
  detectPauseIntent,
  detectStopIntent,
} from "@/lib/interview-state";

async function legacyPOST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      questionIndex,
      audioBase64: rawAudioBase64,
      mimeType,
      transcript: providedTranscript,
    } = body;
    if (!sessionId || questionIndex === undefined) {
      return NextResponse.json(
        { error: "Missing sessionId or questionIndex" },
        { status: 400 },
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let transcript: string;
    if (typeof providedTranscript === "string" && providedTranscript.trim()) {
      transcript = providedTranscript.trim();
    } else {
      const audioBase64 = rawAudioBase64 as string | undefined;
      const base64Payload = audioBase64?.includes(",")
        ? audioBase64.split(",")[1]
        : audioBase64;
      const audioBlob = base64Payload
        ? new Blob([Buffer.from(base64Payload, "base64")], {
            type: mimeType || "audio/webm",
          })
        : null;
      transcript = audioBlob
        ? await transcribeAudio(audioBlob)
        : await mockTranscribe();
    }

    if (detectPauseIntent(transcript) || detectStopIntent(transcript)) {
      const pausedSession = await updateSession(sessionId, (s) => ({
        ...s,
        interview: {
          ...s.interview,
          currentQuestion: questionIndex,
          transcript: [
            ...s.interview.transcript,
            {
              role: "grandparent" as const,
              content: transcript,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }));

      if (!pausedSession) {
        return NextResponse.json(
          { error: "Failed to save your place. Please try again." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        transcript,
        aiResponse:
          "I have saved your place. Come back whenever you are ready.",
        paused: true,
      });
    }

    const allQuestions = [...CORE_QUESTIONS, ...OPTIONAL_QUESTIONS];
    const question = allQuestions[questionIndex];
    const questionText = question?.text.replace(
      /\[grandchildName\]/g,
      session.grandchild.name,
    );

    const messages = [
      { role: "system", content: interviewerSystemPrompt },
      { role: "assistant", content: questionText || "" },
      { role: "user", content: transcript },
    ];

    const response: any = await chat(messages);
    const aiResponse =
      response?.choices?.[0]?.message?.content ||
      "Thank you for sharing that. Take your time. I am listening.";

    const updatedSession = await updateSession(sessionId, (s) => ({
      ...s,
      status: "interview_started",
      interview: {
        ...s.interview,
        currentQuestion: questionIndex + 1,
        startedAt: s.interview.startedAt || new Date().toISOString(),
        transcript: [
          ...s.interview.transcript,
          {
            role: "ai" as const,
            content: questionText || "",
            timestamp: new Date().toISOString(),
          },
          {
            role: "grandparent" as const,
            content: transcript,
            timestamp: new Date().toISOString(),
          },
          {
            role: "ai" as const,
            content: aiResponse,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    }));

    if (!updatedSession) {
      return NextResponse.json(
        { error: "Failed to save answer. Please try again." },
        { status: 500 },
      );
    }

    const isMock = !process.env.GLOO_API_KEY || !process.env.OPENAI_API_KEY;
    return NextResponse.json({
      transcript,
      aiResponse,
      mimeType,
      mock: isMock,
    });
  } catch (err) {
    console.error("interview/turn error", err);
    const message =
      err instanceof Error ? err.message : "Interview turn failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withLegacyAdmin(legacyPOST);
