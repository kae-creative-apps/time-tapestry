"use client";

import Image from "next/image";
import { useId, useState } from "react";
import styles from "./PostcardCollection.module.css";

const postcards = [
  {
    name: "Kindness",
    slug: "kindness",
    color: "#f1e6db",
    heading: "Who first showed them generosity.",
    description:
      "A reminder of the people who modeled a life of giving, and the kindness a donor hopes their family will carry.",
    appearance: "warm cream with a sand-colored woven pattern",
  },
  {
    name: "Faith",
    slug: "faith",
    color: "#fbfaf8",
    heading: "Why giving became a way of life.",
    description:
      "The faith and values behind a donor’s generosity, in words their children and grandchildren can return to.",
    appearance: "soft white with a warm gray woven pattern",
  },
  {
    name: "Generosity",
    slug: "generosity",
    color: "#dadecf",
    heading: "Lives they have seen flourish.",
    description:
      "The ministries they love, and the people whose stories became part of their own because they gave.",
    appearance: "sage with an oversized woven pattern",
  },
  {
    name: "Encouragement",
    slug: "encouragement",
    color: "#e5c8bb",
    heading: "What they hope you carry.",
    description:
      "A blessing for the next generation, drawn from a donor’s story and offered to their children and grandchildren.",
    appearance: "soft clay with a woven pattern",
  },
] as const;

/** Homepage artwork only. Mailing templates and story access stay separate. */
export function PostcardCollection() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const instanceId = useId();
  const headingId = `${instanceId}-heading`;
  const previewId = `${instanceId}-preview`;
  const postcard = postcards[selectedIndex];
  const postcardNumber = String(selectedIndex + 1).padStart(2, "0");

  return (
    <section
      id="postcards"
      className={styles.section}
      aria-labelledby={headingId}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>
            From a donor’s story, into a family’s hands
          </p>
          <h2 id={headingId} className={styles.heading}>
            Four reminders of a generous life.
          </h2>
          <p className={styles.introduction}>
            Each postcard carries a thought from a donor’s story to their
            children or grandchildren. The sample is from Gigi, for Sammie.
          </p>
        </header>

        <div
          className={styles.choices}
          role="group"
          aria-label="Choose a postcard theme"
        >
          {postcards.map((choice, index) => (
            <button
              key={choice.slug}
              type="button"
              className={styles.choice}
              aria-pressed={selectedIndex === index}
              aria-controls={previewId}
              onClick={() => setSelectedIndex(index)}
            >
              <span
                className={styles.swatch}
                style={{ backgroundColor: choice.color }}
                aria-hidden="true"
              />
              <span className={styles.choiceName}>{choice.name}</span>
              <span className={styles.choiceNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
            </button>
          ))}
        </div>

        <div id={previewId} className={styles.showcase}>
          <figure className={styles.figure}>
            <Image
              src={`/brand/postcards/designer-2026-10-06-v2/postcard-${postcardNumber}-${postcard.slug}-front.webp`}
              alt={`${postcard.name} postcard in ${postcard.appearance}, with the Time Tapestry logo and sample dedication from Gigi, a donor, for her granddaughter Sammie.`}
              width={1500}
              height={1000}
              loading="lazy"
              unoptimized
              className={styles.artwork}
            />
            <figcaption className={styles.caption}>
              <span>
                {postcardNumber} / 04 <span aria-hidden="true">·</span>{" "}
                {postcard.name}
              </span>
              <span>Sample designs shown.</span>
            </figcaption>
          </figure>

          <div className={styles.story} aria-live="polite" aria-atomic="true">
            <p className={styles.storyLabel}>
              Postcard {postcardNumber}: {postcard.name}
            </p>
            <h3 className={styles.storyHeading}>{postcard.heading}</h3>
            <p className={styles.description}>{postcard.description}</p>
          </div>
        </div>

        <p className={styles.assuranceNote}>
          Planned for weeks 0, 2, 4 and 6. Physical mailing is still being
          tested.
        </p>
      </div>
    </section>
  );
}
