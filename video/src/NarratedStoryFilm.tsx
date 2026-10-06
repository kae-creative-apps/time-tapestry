import React, { useMemo } from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame } from "remotion";
import { Audio, Video } from "@remotion/media";
import type { NarratedFilmPlan } from "../../src/lib/collection/films/types";
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

export type NarratedStoryFilmProps = {
  plan: NarratedFilmPlan;
  audioSrc: string;
  audioEnvelope?: AudioEnvelope;
  closerSrc?: string;
  fontSrc?: string;
};

function Narration({ plan, audioSrc, audioEnvelope }: NarratedStoryFilmProps) {
  const timeMs = (useCurrentFrame() / FPS) * 1000;
  const pages = useMemo(() => narrationCaptionPages(plan.words), [plan.words]);
  return (
    <AbsoluteFill>
      {audioSrc && <Audio src={audioSrc} />}
      <TemplateOrbScene
        chapterNumber={plan.chapterNumber}
        title={plan.title}
        storytellerName={plan.storytellerName}
        attribution="Read by the Time Tapestry AI interviewer"
        caption={narrationCaptionAt(pages, timeMs)}
        level={audioEnvelopeLevel(audioEnvelope, timeMs)}
      />
    </AbsoluteFill>
  );
}

export function NarratedStoryFilm({
  plan,
  audioSrc,
  audioEnvelope,
  closerSrc,
  fontSrc,
}: NarratedStoryFilmProps) {
  const audioFrames = Math.ceil((plan.audioDurationMs / 1000) * FPS);
  return (
    <AbsoluteFill>
      <TemplateFont src={fontSrc} />
      <Sequence name="Chapter title" from={0} durationInFrames={INTRO * FPS}>
        <TemplateTitle
          chapterNumber={plan.chapterNumber}
          title={plan.title}
          storytellerName={plan.storytellerName}
          attribution="Their written words, read by the Time Tapestry AI interviewer"
        />
      </Sequence>
      <Sequence
        name="Their written story"
        from={INTRO * FPS}
        durationInFrames={audioFrames}
      >
        <Narration
          plan={plan}
          audioSrc={audioSrc}
          audioEnvelope={audioEnvelope}
        />
      </Sequence>
      <Sequence
        name="Animated Time Tapestry logo"
        from={INTRO * FPS + audioFrames}
        durationInFrames={CLOSER * FPS}
      >
        {closerSrc ? (
          <Video
            src={closerSrc}
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

export function NarratedFilmRoot() {
  return (
    <Composition
      id="NarratedStoryFilm"
      component={NarratedStoryFilm}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={510}
      defaultProps={{
        plan: {
          schemaVersion: 1,
          jobId: "preview",
          chapterId: "q1",
          chapterNumber: 1,
          storytellerName: "Sample storyteller",
          title: "Kindness received",
          script: "A fictional story for layout review.",
          sourceTakeIds: ["synthetic"],
          sourceSha256: "",
          scriptSha256: "",
          audioSha256: "",
          audioDurationMs: 10000,
          words: [
            {
              text: "A fictional story for layout review.",
              startMs: 0,
              endMs: 10000,
            },
          ],
          narrationKind: "ai_interviewer",
          templateVersion: "narrated-story-orb-v2",
        },
        audioSrc: "",
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames:
          (INTRO + CLOSER) * FPS +
          Math.ceil((props.plan.audioDurationMs / 1000) * FPS),
      })}
    />
  );
}
