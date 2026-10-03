/** Shared vector geometry based on the approved October 2 brand references. */
export const BRAND_COLORS = { espresso: "#432e23", paper: "#fbfaf8", sage: "#939480", clay: "#c18f7b", taupe: "#756454" } as const;
export const BRAND_MARK_PATHS = [
  "M106 168V97C106 74 124 56 147 56C170 56 185 74 185 97V168H198C239 168 270 201 270 242V257L226 237C207 229 202 226 184 226H51C35 226 23 214 23 198C23 181 35 168 51 168Z",
  "M106 240H185V372C185 384 191 390 204 390H221C237 390 248 402 248 417C248 433 236 446 221 446H169C134 446 106 420 106 384Z",
  "M199 240C225 251 253 272 284 270V212C284 191 300 174 322 174C346 174 362 191 362 215V270H425C441 270 452 283 452 299C452 315 440 327 424 327H277C233 327 199 293 199 258Z",
  "M284 341H362V438C362 452 369 460 384 460H414C430 460 441 472 441 487C441 504 429 517 412 517H356C315 517 284 487 284 447Z",
] as const;
// All three wordmark t letters use one rounded stem, crossbar and turned foot.
export const BRAND_T_PATH = "M10 4C10 1.8 11.8 0 14 0S18 1.8 18 4V12H24C26.2 12 28 13.8 28 16S26.2 20 24 20H18V30C18 33 19.3 34 22 34H24C26.2 34 28 35.8 28 38S26.2 42 24 42H21C13.7 42 10 37.8 10 31V20H4C1.8 20 0 18.2 0 16S1.8 12 4 12H10Z";
const glyphs: Record<string, { width: number; path?: string; dot?: boolean }> = {
  t: { width: 28 }, i: { width: 7, path: "M3.5 17V38", dot: true },
  m: { width: 34, path: "M3 38V17M3 25C3 12 17 12 17 25V38M17 25C17 12 31 12 31 25V38" },
  e: { width: 26, path: "M3 26H23C23 12 3 12 3 26C3 40 17 42 23 34" },
  a: { width: 27, path: "M23 17V38M23 27C23 12 3 12 3 27C3 42 23 42 23 27" },
  p: { width: 27, path: "M3 49V17M3 27C3 12 24 12 24 27C24 42 3 42 3 27" },
  s: { width: 25, path: "M22 19C15 12 2 15 3 22C4 29 23 24 23 32C23 40 8 43 2 35" },
  r: { width: 20, path: "M3 38V17M3 26C3 18 11 14 18 18" },
  y: { width: 26, path: "M3 17V28C3 42 23 42 23 28V17M23 28V39C23 51 9 52 4 47" },
};
function wordPaths(word: string, y: number) {
  let x = 0;
  return [...word].map((letter) => {
    const glyph = glyphs[letter];
    const shape = letter === "t" ? `<path fill="currentColor" d="${BRAND_T_PATH}"/>` : `<path fill="none" stroke="currentColor" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round" d="${glyph.path}"/>${glyph.dot ? '<circle fill="currentColor" cx="3.5" cy="7" r="3.2"/>' : ""}`;
    const result = `<g transform="translate(${x} ${y})">${shape}</g>`;
    x += glyph.width + 5;
    return result;
  }).join("");
}
export type BrandArtworkVariant = "mark" | "wordmark" | "lockup";
export const BRAND_MARKUP = BRAND_MARK_PATHS.map((d) => `<path d="${d}"/>`).join("");
export const BRAND_WORDMARK = wordPaths("time", 0) + wordPaths("tapestry", 49);
export const BRAND_VIEWBOX: Record<BrandArtworkVariant, string> = { mark: "20 53 436 470", wordmark: "-3 -3 248 105", lockup: "0 0 354 106" };
export function brandSvgBody(variant: BrandArtworkVariant) {
  if (variant === "mark") return BRAND_MARKUP;
  if (variant === "wordmark") return BRAND_WORDMARK;
  return `<g transform="translate(0 3) scale(.21) translate(-20 -53)">${BRAND_MARKUP}</g><g transform="translate(110 3)">${BRAND_WORDMARK}</g>`;
}
export function brandSvg(variant: BrandArtworkVariant, color: string = BRAND_COLORS.espresso) {
  if (!/^#[a-fA-F0-9]{6}$/.test(color)) throw new Error("Brand color must be a six-digit hex value.");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_VIEWBOX[variant]}" fill="currentColor" color="${color}" role="img" aria-label="Time Tapestry">${brandSvgBody(variant)}</svg>`;
}
