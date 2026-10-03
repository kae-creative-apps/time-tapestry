import type { CSSProperties } from "react";
import { BRAND_VIEWBOX, brandSvgBody, type BrandArtworkVariant } from "../lib/brand-art";
/** No links or font dependencies. Used unchanged in UI and film. */
export function BrandArtwork({ variant = "lockup", className, style }: { variant?: BrandArtworkVariant; className?: string; style?: CSSProperties }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={BRAND_VIEWBOX[variant]} fill="currentColor" className={className} style={style} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: brandSvgBody(variant) }} />;
}
