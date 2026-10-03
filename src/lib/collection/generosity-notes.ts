/** Private notebook values are never interview answers or generation sources. */
export type GenerosityNotesValues = {
  peopleAndCauses: string;
  involvement: string;
  years: string;
  amount: string;
  meaning: string;
  impact: string;
};

export type PrivateGenerosityNotes = {
  version: 1;
  updatedAt: string;
  revision: number;
  values: GenerosityNotesValues;
};

export const emptyValues: GenerosityNotesValues = {
  peopleAndCauses: "",
  involvement: "",
  years: "",
  amount: "",
  meaning: "",
  impact: "",
};

export const generosityNotesLimits: Record<
  keyof GenerosityNotesValues,
  number
> = {
  peopleAndCauses: 1000,
  involvement: 3000,
  years: 300,
  amount: 500,
  meaning: 3000,
  impact: 3000,
};

const labels: Record<keyof GenerosityNotesValues, string> = {
  peopleAndCauses: "People and causes",
  involvement: "How I was involved",
  years: "When",
  amount: "Amount or range",
  meaning: "Why this mattered to me",
  impact: "What I know about the impact",
};

export class GenerosityNotesInputError extends Error {}

/** Reject malformed input and overflow rather than silently losing saved words. */
export function normalizeGenerosityNotesValues(
  input: unknown,
): GenerosityNotesValues {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new GenerosityNotesInputError(
      "Check your private notes and try saving again.",
    );
  const values = input as Record<string, unknown>;
  const keys = Object.keys(emptyValues) as Array<keyof GenerosityNotesValues>;
  if (
    Object.keys(values).some(
      (key) => !keys.includes(key as keyof GenerosityNotesValues),
    )
  )
    throw new GenerosityNotesInputError(
      "These private notes contain an unrecognized field.",
    );
  const normalized = { ...emptyValues };
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    const value = values[key];
    if (typeof value !== "string")
      throw new GenerosityNotesInputError("Write your private notes as text.");
    if (value.length > generosityNotesLimits[key])
      throw new GenerosityNotesInputError(
        `Keep ${labels[key].toLowerCase()} within ${generosityNotesLimits[key]} characters. Your notes have not been changed.`,
      );
    normalized[key] = value.trim() ? value : "";
  }
  return normalized;
}

/** Only an explicit owner preview should call this. It supplies labels, never new facts. */
export function formatGenerosityNotes(values: GenerosityNotesValues): string {
  return (Object.keys(emptyValues) as Array<keyof GenerosityNotesValues>)
    .filter((key) => values[key].trim())
    .map((key) => `${labels[key]}: ${values[key]}`)
    .join("\n\n");
}
