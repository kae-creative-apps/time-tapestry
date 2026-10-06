"use client";

import Image from "next/image";
import { useId, useState } from "react";
import styles from "./PostcardCollection.module.css";

const postcards = [
  {
    name: "Kindness",
    slug: "kindness",
    color: "#f1e6db",
    heading: "The afternoons they gave you.",
    description:
      "A reminder of the people who made time for you, and the kindness you hope your family will carry forward.",
    appearance: "warm cream with a sand-colored woven pattern",
  },
  {
    name: "Faith",
    slug: "faith",
    color: "#fbfaf8",
    heading: "What carried you through.",
    description:
      "The faith that met you in a hard season, shared in words your family can return to.",
    appearance: "soft white with a warm gray woven pattern",
  },
  {
    name: "Generosity",
    slug: "generosity",
    color: "#dadecf",
    heading: "The good that keeps growing.",
    description:
      "A small act of generosity can become part of someone else's story. Pass on what giving has meant in yours.",
    appearance: "sage with an oversized woven pattern",
  },
  {
    name: "Encouragement",
    slug: "encouragement",
    color: "#e5c8bb",
    heading: "There is room for one more.",
    description:
      "Words of welcome and encouragement, drawn from your story and offered to someone you love.",
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
            A little of your story, in their hands
          </p>
          <h2 id={headingId} className={styles.heading}>
            Four little reminders. So much to pass on.
          </h2>
          <p className={styles.introduction}>
            Each postcard carries a thought from your story to someone you love.
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
              alt={`${postcard.name} postcard in ${postcard.appearance}, with the Time Tapestry logo and sample dedication, From Gigi, for Sammie.`}
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

        <p className={styles.pilotNote}>
          Planned for weeks 0, 2, 4 and 6. Physical mailing is still being
          tested during the pilot.
        </p>
      </div>
    </section>
  );
}
