import type { Contact, PostalAddress } from "./types";

export type StartDraft = {
  version: 1;
  expiresAt: number;
  step: number;
  me: Contact;
  other: Contact;
  recipient: Contact;
  recipientIsMe: boolean;
  addressLater: boolean;
  address: PostalAddress;
  note: string;
  submission?: { id: string; fingerprint: string };
};
export const startDraftKey = (mode: "share" | "request") =>
  `time-tapestry:setup:v1:${mode}`;
export const startDraftLifetime = 24 * 60 * 60 * 1000;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
const contact = (value: unknown): value is Contact =>
  object(value) &&
  text(value.name, 200) &&
  text(value.email, 254) &&
  (value.phone === undefined || text(value.phone, 40));

/** Only incomplete form details are restored. Consent and human verification are never retained. */
export function readStartDraft(
  raw: string | null,
  now = Date.now(),
): StartDraft | null {
  if (!raw || raw.length > 20000) return null;
  try {
    const v = JSON.parse(raw);
    if (
      !object(v) ||
      v.version !== 1 ||
      typeof v.expiresAt !== "number" ||
      v.expiresAt <= now ||
      v.expiresAt > now + startDraftLifetime ||
      !Number.isInteger(v.step) ||
      Number(v.step) < 0 ||
      Number(v.step) > 3 ||
      !contact(v.me) ||
      !contact(v.other) ||
      !contact(v.recipient) ||
      typeof v.recipientIsMe !== "boolean" ||
      typeof v.addressLater !== "boolean" ||
      !text(v.note, 2000) ||
      !object(v.address)
    )
      return null;
    for (const key of [
      "name",
      "line1",
      "city",
      "region",
      "postalCode",
      "country",
    ])
      if (!text(v.address[key], 200)) return null;
    if (v.address.line2 !== undefined && !text(v.address.line2, 200))
      return null;
    if (
      v.submission !== undefined &&
      (!object(v.submission) ||
        typeof v.submission.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v.submission.id,
        ) ||
        !text(v.submission.fingerprint, 12000))
    )
      return null;
    return {
      version: 1,
      expiresAt: v.expiresAt,
      step: Number(v.step),
      me: v.me,
      other: v.other,
      recipient: v.recipient,
      recipientIsMe: v.recipientIsMe,
      addressLater: v.addressLater,
      address: v.address as PostalAddress,
      note: v.note,
      ...(v.submission
        ? { submission: v.submission as StartDraft["submission"] }
        : {}),
    };
  } catch {
    return null;
  }
}
