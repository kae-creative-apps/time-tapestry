"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { BrandArtwork } from "@/components/BrandArtwork";
import { BrandPattern } from "@/components/BrandPattern";
import styles from "./StoryMorphHero.module.css";

/**
 * Composition inspired by Prashant Som's Scroll Morph Hero:
 * https://21st.dev/@prashantsom75/components/scroll-morph-hero
 * Rewritten for a single opening sequence, native page scrolling, and a static fallback.
 * Entrance and scroll transforms live on separate layers. Content never waits for them.
 * No wheel interception, virtual scroll, or frame-by-frame React state.
 */

type CardPose = readonly [x: number, y: number, rotation: number];
type StoryCard = {
  label: string;
  tone: "paper" | "sage" | "clay" | "photo";
  stack: CardPose;
  ring: CardPose;
  fan: CardPose;
  mobileRotation: number;
};

const cards: readonly StoryCard[] = [
  {
    label: "kindness",
    tone: "photo",
    stack: [-50, -65, -10],
    ring: [-48, -52, -19],
    fan: [-68, 28, -20],
    mobileRotation: -5,
  },
  {
    label: "faith",
    tone: "paper",
    stack: [50, -40, 9],
    ring: [42, -60, 13],
    fan: [-23, -3, -7],
    mobileRotation: 4,
  },
  {
    label: "generosity",
    tone: "sage",
    stack: [-40, 55, -8],
    ring: [-45, 64, -12],
    fan: [23, -3, 7],
    mobileRotation: -3,
  },
  {
    label: "encouragement",
    tone: "clay",
    stack: [45, 75, 8],
    ring: [49, 55, 16],
    fan: [68, 28, 20],
    mobileRotation: 5,
  },
];

function cardVariables(card: StoryCard): CSSProperties {
  return {
    "--rest-x": `${card.stack[0]}%`,
    "--rest-y": `${card.stack[1]}%`,
    "--rest-rotation": `${card.stack[2]}deg`,
    "--mobile-rotation": `${card.mobileRotation}deg`,
  } as CSSProperties;
}

function PostcardFace({ card, index }: { card: StoryCard; index: number }) {
  return (
    <div className={`${styles.card} ${styles[card.tone]}`}>
      {card.tone === "photo" ? (
        <>
          <div className={styles.photograph}>
            <Image
              src="/brand/story-exchange-branded-v1.png"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 300px, 46vw"
              className={styles.image}
            />
          </div>
          <div className={styles.photoCaption}>
            <span>{card.label}</span>
            <BrandArtwork variant="mark" className={styles.photoMark} />
          </div>
        </>
      ) : (
        <>
          <div className={styles.cardTop}>
            <span className={styles.number}>0{index + 1}</span>
            <BrandArtwork variant="mark" className={styles.smallMark} />
          </div>
          <BrandPattern
            variant={card.tone === "sage" ? "ribbon" : "weave"}
            className={styles.cardPattern}
          />
          <span className={styles.cardLabel}>{card.label}</span>
          <BrandArtwork variant="wordmark" className={styles.wordmark} />
        </>
      )}
    </div>
  );
}

type MotionMode = "static" | "desktop" | "mobile";

function PostcardArrival({
  card,
  index,
  mode,
  enter,
  onComplete,
}: {
  card: StoryCard;
  index: number;
  mode: MotionMode;
  enter: boolean;
  onComplete: () => void;
}) {
  const desktop = mode === "desktop";
  const shouldEnter = enter && mode !== "static";
  const restRotation = (card.stack[2] * Math.PI) / 180;
  // Undo the outer pose's rotation to place the opening cards in a shared central stack.
  // x/y percentages use different axes because each postcard has a 3:2 aspect ratio.
  const fromX =
    -card.stack[0] * Math.cos(restRotation) -
    card.stack[1] * (2 / 3) * Math.sin(restRotation);
  const fromY =
    card.stack[0] * (3 / 2) * Math.sin(restRotation) -
    card.stack[1] * Math.cos(restRotation);

  return (
    <motion.div
      className={styles.arrival}
      initial={
        shouldEnter
          ? {
              x: desktop ? `${fromX}%` : "0%",
              y: desktop ? `${fromY}%` : "8%",
              rotate: desktop
                ? -card.stack[2] + (index - 1.5) * 5
                : index % 2 === 0
                  ? 2
                  : -2,
              scale: desktop ? 0.79 : 0.96,
              opacity: index === 0 ? 1 : 0,
            }
          : false
      }
      animate={{ x: "0%", y: "0%", rotate: 0, scale: 1, opacity: 1 }}
      transition={{
        duration: shouldEnter ? (desktop ? 1.38 : 0.55) : 0,
        delay: shouldEnter ? index * (desktop ? 0.18 : 0.12) : 0,
        ease: [0.16, 1, 0.3, 1],
        opacity: {
          duration: shouldEnter ? 0.24 : 0,
          delay: shouldEnter ? index * (desktop ? 0.18 : 0.12) : 0,
        },
      }}
      onAnimationComplete={index === cards.length - 1 ? onComplete : undefined}
    >
      <PostcardFace card={card} index={index} />
    </motion.div>
  );
}

function MovingPostcard({
  card,
  index,
  progress,
  enter,
  onComplete,
}: {
  card: StoryCard;
  index: number;
  progress: MotionValue<number>;
  enter: boolean;
  onComplete: () => void;
}) {
  const stops = [0, 0.23, 0.68];
  const x = useTransform(
    progress,
    stops,
    [card.stack[0], card.ring[0], card.fan[0]].map((value) => `${value}%`),
  );
  const y = useTransform(
    progress,
    stops,
    [card.stack[1], card.ring[1], card.fan[1]].map((value) => `${value}%`),
  );
  const rotate = useTransform(progress, stops, [
    card.stack[2],
    card.ring[2],
    card.fan[2],
  ]);
  const scale = useTransform(progress, stops, [1, 0.95, 0.72]);

  return (
    <motion.div
      className={styles.position}
      style={{ ...cardVariables(card), x, y, rotate, scale }}
    >
      <PostcardArrival
        card={card}
        index={index}
        mode="desktop"
        enter={enter}
        onComplete={onComplete}
      />
    </motion.div>
  );
}

function MovingCards({
  target,
  enter,
  onComplete,
}: {
  target: RefObject<HTMLDivElement | null>;
  enter: boolean;
  onComplete: () => void;
}) {
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start start", "end start"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 32,
    mass: 0.5,
  });

  return cards.map((card, index) => (
    <MovingPostcard
      key={card.label}
      card={card}
      index={index}
      progress={progress}
      enter={enter}
      onComplete={onComplete}
    />
  ));
}

/** Decorative right-hand hero artwork. A 600 × 540 frame is the intended desktop size. */
export function StoryMorphVisual({ className = "" }: { className?: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<MotionMode>("static");
  const introductionComplete = useRef(false);
  const finishIntroduction = () => {
    introductionComplete.current = true;
  };

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setMode(
        reduced.matches ? "static" : desktop.matches ? "desktop" : "mobile",
      );
    update();
    desktop.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  return (
    <div
      ref={target}
      className={`${styles.visual} ${className}`}
      aria-hidden="true"
    >
      <div className={styles.halo} />
      <div className={styles.scene}>
        {mode === "desktop" ? (
          <MovingCards
            target={target}
            enter={!introductionComplete.current}
            onComplete={finishIntroduction}
          />
        ) : (
          cards.map((card, index) => (
            <div
              key={card.label}
              className={styles.position}
              style={cardVariables(card)}
            >
              {mode === "mobile" ? (
                <PostcardArrival
                  card={card}
                  index={index}
                  mode={mode}
                  enter={!introductionComplete.current}
                  onComplete={finishIntroduction}
                />
              ) : (
                <div className={styles.arrival}>
                  <PostcardFace card={card} index={index} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
