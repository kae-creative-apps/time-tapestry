import React, { useId } from "react";

// Geometric reconstruction of the brown-and-white ribbon on the supplied board.
// Square cut ends sit beneath the crossing band. The curled ends stay visible.
const RIBBON_OVERPASS =
  "M0 0C-7 -1 -12 5 -12 13C-12 25 -4 32 10 32H70C81 32 86 35 95 44L150 96C158 104 160 112 160 124V149H187V124C187 104 181 93 167 79L113 28C100 14 90 7 71 7H11C4 7 2 4 0 0Z";
const RIBBON_LOWER_PASS =
  "M36 39H63V68C63 80 68 84 80 84H109C116 84 120 89 120 96C120 103 115 107 108 107H78C51 107 36 88 36 68Z";
const RIBBON_RISING_PASS =
  "M-58 2L-28 -28C-20 -36 -11 -40 -1 -40C5 -40 8 -34 7 -27C6 -20 1 -17 -5 -16C-11 -15 -15 -11 -20 -6L-39 21Z";

/** Decorative ribbons from the brand board. The logo is never used as a pattern. */
export function BrandPattern({
  variant = "weave",
  className = "",
}: {
  variant?: "weave" | "ribbon";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (variant === "ribbon") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 600 360"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className={`pointer-events-none ${className}`}
      >
        <defs>
          <g id={`ribbon-motif-${id}`} fill="currentColor">
            <path d={RIBBON_OVERPASS} />
            <path d={RIBBON_LOWER_PASS} />
            <path d={RIBBON_RISING_PASS} />
          </g>
          <pattern
            id={`ribbon-${id}`}
            width="155"
            height="750"
            patternUnits="userSpaceOnUse"
          >
            {/* Five 150-unit rows shift 31 units each, closing one 155-unit repeat.
                The extra boundary row and columns keep every tile edge seamless. */}
            {Array.from({ length: 6 }, (_, index) => {
              const row = index - 1;
              return [-1, 0, 1, 2].map((column) => (
                <use
                  key={`${row}-${column}`}
                  href={`#ribbon-motif-${id}`}
                  transform={`translate(${column * 155 - row * 31 - 39} ${row * 150 + 80})`}
                />
              ));
            })}
          </pattern>
        </defs>
        <rect width="600" height="360" fill={`url(#ribbon-${id})`} />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 480"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none ${className}`}
    >
      <path d="M500 -100L820 195" stroke="currentColor" strokeWidth="100" />
      <path
        d="M-100 68H60C230 68 265 185 340 275S500 422 670 288L800 190"
        stroke="var(--weave-secondary, #939480)"
        strokeWidth="106"
      />
      <path
        d="M-100 387H40C175 387 254 300 352 230L438 168C516 112 587 167 583 245"
        stroke="var(--weave-gap, #fbfaf8)"
        strokeWidth="132"
        strokeLinecap="round"
      />
      <path
        d="M-100 387H40C175 387 254 300 352 230L438 168C516 112 587 167 583 245"
        stroke="currentColor"
        strokeWidth="100"
        strokeLinecap="round"
      />
    </svg>
  );
}
