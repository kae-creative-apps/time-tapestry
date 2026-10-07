"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandArtwork } from "@/components/BrandArtwork";
import { AppIcon } from "@/components/icons";
import { BrandGrain } from "./BrandGrain";
import styles from "./brand-motion.module.css";

const threads = [
  {
    label: "Roots of generosity",
    color: "#e5d4be",
    path: "M0 25 C105 25 92 151 210 151 S330 108 440 108",
  },
  {
    label: "Why I give",
    color: "#bcc1a6",
    path: "M0 87 C106 87 147 40 225 96 S336 126 440 126",
  },
  {
    label: "Lives I’ve seen flourish",
    color: "#d6af9c",
    path: "M0 149 C89 149 118 225 224 175 S336 144 440 144",
  },
  {
    label: "What I hope you carry",
    color: "#fbfaf8",
    path: "M0 211 C83 211 155 116 247 139 S345 162 440 162",
  },
];

/**
 * Grid Pulse inspired the brief illumination and reduced-motion behavior.
 * This is an original SVG thread composition, not its rainbow canvas grid.
 * Reference: the 21st.dev Grid Pulse component supplied for this direction.
 */
export function ThreadAssembly() {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const node = section.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const shown = Boolean(entry?.isIntersecting);
        setVisible(shown);
        if (shown) setStarted(true);
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <section
        ref={section}
        className={styles.pitchCanvas}
        aria-labelledby="thread-pitch-title"
        data-started={started}
        data-visible={visible}
      >
        <BrandGrain tone="espresso" />
        <div className={styles.pitchTop}>
          <div>
            <p className={styles.pitchEyebrow}>Stories woven together</p>
            <h2 id="thread-pitch-title" className={styles.pitchTitle}>
              A life is made
              <br />
              of many threads.
            </h2>
          </div>
          <BrandArtwork variant="wordmark" className={styles.pitchWordmark} />
        </div>
        <div className={styles.threadScene}>
          <ol className={styles.threadLabels}>
            {threads.map((thread, index) => (
              <li key={thread.label}>
                <span className={styles.threadNumber}>0{index + 1}</span>
                {thread.label}
              </li>
            ))}
          </ol>
          <svg
            key={replay}
            className={styles.threads}
            viewBox="0 0 440 240"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            {threads.map((thread) => (
              <path
                key={`base-${thread.label}`}
                d={thread.path}
                stroke={thread.color}
                strokeWidth="9"
                strokeLinecap="round"
                opacity="0.14"
              />
            ))}
            {threads.map((thread, index) => (
              <path
                key={thread.label}
                className={styles.threadPath}
                style={{ "--thread-delay": `${index * 0.2}s` } as CSSProperties}
                d={thread.path}
                stroke={thread.color}
                strokeWidth="9"
                strokeLinecap="round"
                pathLength="1"
              />
            ))}
          </svg>
          <div className={styles.keepsake}>
            <BrandArtwork
              variant="mark"
              className="h-14 w-14 text-espresso sm:h-16 sm:w-16"
            />
            <p className="mt-5 font-display text-xl font-semibold leading-tight text-espresso sm:text-2xl">
              A story they
              <br />
              can carry.
            </p>
            <span className="mt-6 block h-px w-10 bg-clay" />
            <p className="mt-4 text-xs leading-5 text-ink-500">
              Your life, in your words.
              <br />
              For someone you love.
            </p>
          </div>
        </div>
        <div className={styles.pitchBottom}>
          <p>Pass on the stories, faith and values behind your life.</p>
          <span>Pitch concept · sample artwork</span>
        </div>
      </section>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-ink-500">
          The four threads gather into one keepsake. The scene settles after one
          reveal.
        </p>
        <button
          type="button"
          onClick={() => setReplay((value) => value + 1)}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-warmgray-300 bg-white px-5 text-sm font-medium text-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso"
        >
          <AppIcon name="play" size={16} /> Replay the reveal
        </button>
      </div>
    </div>
  );
}
