import React from "react";
import { APPROVED_BRAND_PATTERNS } from "../lib/brand-patterns";

/** Locked v39 artwork. Decorative patterns keep their approved geometry and colors. */
export function BrandPattern({
  variant = "weave",
  className = "",
}: {
  variant?: "weave" | "ribbon";
  className?: string;
}) {
  const artwork = APPROVED_BRAND_PATTERNS[variant];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={artwork.viewBox}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none ${className}`}
      dangerouslySetInnerHTML={{ __html: artwork.body }}
    />
  );
}
