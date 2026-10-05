import React from "react";
import { Composition, staticFile } from "remotion";
import {
  NarratedStoryFilm,
  type NarratedStoryFilmProps,
} from "../src/NarratedStoryFilm";
import manifest from "../../public/brand/story-templates-v1/manifest.json";
import {
  STORY_FILM_WIDTH,
  STORY_FILM_HEIGHT,
  STORY_FILM_FPS,
  STORY_FILM_INTRO_SECONDS,
  STORY_FILM_CLOSER_SECONDS,
} from "../../src/lib/story-film-template";

// These checked-in examples are fictional. Production jobs supply private source
// media and approved plans through the two existing render workers instead.
function sampleProps(index: number): NarratedStoryFilmProps {
  const sample = manifest.samples[index];
  return {
    plan: {
      ...sample.plan,
      schemaVersion: 1,
      chapterNumber: (index + 1) as 1 | 2 | 3 | 4,
      narrationKind: "ai_interviewer",
    },
    audioSrc: staticFile(sample.audioPath),
    audioEnvelope: sample.audioEnvelope,
    closerSrc: staticFile("brand/film-closer-v2.mp4"),
    fontSrc: staticFile("brand/fonts/quicksand-latin.woff2"),
  };
}

function metadata({ props }: { props: NarratedStoryFilmProps }) {
  return {
    durationInFrames:
      (STORY_FILM_INTRO_SECONDS + STORY_FILM_CLOSER_SECONDS) * STORY_FILM_FPS +
      Math.ceil((props.plan.audioDurationMs / 1000) * STORY_FILM_FPS),
  };
}

const size = {
  width: STORY_FILM_WIDTH,
  height: STORY_FILM_HEIGHT,
  fps: STORY_FILM_FPS,
};

export function StoryTemplatesRoot() {
  return (
    <>
      <Composition
        id="KindnessReceived"
        component={NarratedStoryFilm}
        {...size}
        durationInFrames={metadata({ props: sampleProps(0) }).durationInFrames}
        defaultProps={sampleProps(0)}
        calculateMetadata={metadata}
      />
      <Composition
        id="ALifeOfFaith"
        component={NarratedStoryFilm}
        {...size}
        durationInFrames={metadata({ props: sampleProps(1) }).durationInFrames}
        defaultProps={sampleProps(1)}
        calculateMetadata={metadata}
      />
      <Composition
        id="WhatYouSowed"
        component={NarratedStoryFilm}
        {...size}
        durationInFrames={metadata({ props: sampleProps(2) }).durationInFrames}
        defaultProps={sampleProps(2)}
        calculateMetadata={metadata}
      />
      <Composition
        id="WhatIHopeYouCarry"
        component={NarratedStoryFilm}
        {...size}
        durationInFrames={metadata({ props: sampleProps(3) }).durationInFrames}
        defaultProps={sampleProps(3)}
        calculateMetadata={metadata}
      />
    </>
  );
}
