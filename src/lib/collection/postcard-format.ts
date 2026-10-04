export type PostcardFormat = {
  readonly size: "4x6" | "6x9";
  readonly width: number;
  readonly height: number;
  readonly bleed: number;
};

const FORMATS: Record<PostcardFormat["size"], PostcardFormat> = {
  "4x6": { size: "4x6", width: 600, height: 408, bleed: 12 },
  "6x9": { size: "6x9", width: 888, height: 600, bleed: 12 },
};

/** Old approved proofs have no marker and retain their original 4 x 6 format. */
export function inferPostcardFormat(html: string): PostcardFormat {
  const body = html.match(/<body\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/i)?.[0];
  if (!body) return FORMATS["4x6"];
  const markers = [
    ...body
      .slice(5, -1)
      .matchAll(
        /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
      ),
  ].filter((attribute) => attribute[1].toLowerCase() === "data-postcard-size");
  if (markers.length === 0) return FORMATS["4x6"];
  if (markers.length !== 1)
    throw new Error("The saved postcard has an invalid print size marker.");
  const size = markers[0][2] ?? markers[0][3] ?? markers[0][4];
  if (size === undefined)
    throw new Error("The saved postcard has an invalid print size marker.");
  if (size !== "4x6" && size !== "6x9")
    throw new Error("The saved postcard uses an unsupported print size.");
  return FORMATS[size];
}

/** Use the frozen artwork's format, including for retries of historical mail. */
export function postcardArtworkFormat(artwork: {
  front: string;
  back: string;
}): PostcardFormat {
  const front = inferPostcardFormat(artwork.front);
  const back = inferPostcardFormat(artwork.back);
  if (front.size !== back.size)
    throw new Error(
      "The saved postcard front and back use different print sizes.",
    );
  return front;
}
