import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Composition,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import type { FilmWord } from "../../src/lib/collection/films/types";
import {
  audioEnvelopeLevel,
  type AudioEnvelope,
} from "../../src/lib/film-audio-envelope";
import {
  narrationCaptionAt,
  narrationCaptionPages,
} from "../../src/lib/story-film-captions";
import {
  TemplateFont,
  TemplateTitle,
  TemplateOrbScene,
  TemplateLogoCloser,
} from "../templates/StoryTemplate";
import {
  STORY_FILM_FPS as FPS,
  STORY_FILM_INTRO_SECONDS as INTRO,
  STORY_FILM_CLOSER_SECONDS as CLOSER,
} from "../../src/lib/story-film-template";

/** One spoken turn, placed on the conversation timeline at startMs. */
export type DemoFilmTurn = {
  speaker: "interviewer" | "gigi";
  audioSrc: string;
  startMs: number;
  durationMs: number;
  words: FilmWord[];
  audioEnvelope?: AudioEnvelope;
};

export type HackathonDemoFilmProps = {
  chapterNumber: 1 | 2 | 3 | 4;
  title: string;
  question: string;
  storytellerName: string;
  turns: DemoFilmTurn[];
  conversationMs: number;
  closerSrc?: string;
  fontSrc?: string;
};

// The generator passes staged file names; absolute URLs pass through.
const asset = (src: string) =>
  /^(https?:|data:|\/)/.test(src) ? src : staticFile(src);

const SPEAKER = {
  gigi: "Gigi",
  interviewer: "Time Tapestry interviewer",
} as const;

// Mirrors a real audio-interview film: question card, the orb with the
// recorded voice and timed captions, then the animated logo. The only
// addition is that the interviewer's turns stay in, so it plays as a conversation.
function Conversation({
  chapterNumber,
  title,
  storytellerName,
  turns,
}: HackathonDemoFilmProps) {
  const timeMs = (useCurrentFrame() / FPS) * 1000;
  // Page each turn separately so a caption never spans two speakers.
  const pages = useMemo(
    () => turns.flatMap((turn) => narrationCaptionPages(turn.words)),
    [turns],
  );
  const current =
    turns.find(
      (turn) =>
        timeMs >= turn.startMs && timeMs < turn.startMs + turn.durationMs,
    ) ?? turns.findLast((turn) => timeMs >= turn.startMs);
  const level = current
    ? audioEnvelopeLevel(current.audioEnvelope, timeMs - current.startMs)
    : 0;
  return (
    <AbsoluteFill>
      {turns.map((turn) => (
        <Sequence
          key={turn.audioSrc}
          from={Math.round((turn.startMs / 1000) * FPS)}
          durationInFrames={Math.ceil((turn.durationMs / 1000) * FPS)}
          layout="none"
        >
          <Audio src={asset(turn.audioSrc)} />
        </Sequence>
      ))}
      <TemplateOrbScene
        chapterNumber={chapterNumber}
        title={title}
        storytellerName={
          current?.speaker === "interviewer"
            ? SPEAKER.interviewer
            : storytellerName
        }
        attribution="Illustrative example, AI voices"
        caption={narrationCaptionAt(pages, timeMs)}
        level={level}
      />
    </AbsoluteFill>
  );
}

export function HackathonDemoFilm(props: HackathonDemoFilmProps) {
  const talkFrames = Math.ceil((props.conversationMs / 1000) * FPS);
  return (
    <AbsoluteFill>
      <TemplateFont src={props.fontSrc && asset(props.fontSrc)} />
      <Sequence name="Question" from={0} durationInFrames={INTRO * FPS}>
        <TemplateTitle
          chapterNumber={props.chapterNumber}
          title={props.title}
          chapterLabel="A story to keep"
          storytellerName={props.storytellerName}
          promptQuestion={props.question}
        />
      </Sequence>
      <Sequence
        name="Conversation"
        from={INTRO * FPS}
        durationInFrames={talkFrames}
      >
        <Conversation {...props} />
      </Sequence>
      <Sequence
        name="Animated Time Tapestry logo"
        from={INTRO * FPS + talkFrames}
        durationInFrames={CLOSER * FPS}
      >
        {props.closerSrc ? (
          <Video
            src={asset(props.closerSrc)}
            muted
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <TemplateLogoCloser />
        )}
      </Sequence>
    </AbsoluteFill>
  );
}

export function HackathonDemoFilmRoot() {
  return (
    <Composition
      id="HackathonDemoFilm"
      component={HackathonDemoFilm}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={(INTRO + CLOSER + 10) * FPS}
      defaultProps={{
        chapterNumber: 1,
        title: "Kindness received",
        question: "Tell me about someone whose kindness has stayed with you.",
        storytellerName: "Gigi",
        turns: [],
        conversationMs: 10000,
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames:
          (INTRO + CLOSER) * FPS +
          Math.ceil((props.conversationMs / 1000) * FPS),
      })}
    />
  );
}
