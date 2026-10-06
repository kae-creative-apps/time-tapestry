import type { Collection } from "./types";

export const PRIMARY_RECIPIENT_ID = "primary";
export const normalizeRecipientEmail = (email: string) =>
  email.trim().toLowerCase();
export type RecipientPrincipal = {
  id: string;
  email: string;
  name: string;
  primary: boolean;
};

/** Collection-scoped identity. Older untagged data belongs only to the primary. */
export const storedRecipientId = (value: { recipientId?: string }) =>
  value.recipientId || PRIMARY_RECIPIENT_ID;

export function recipientById(
  c: Collection,
  id = PRIMARY_RECIPIENT_ID,
  includeRevoked = false,
): RecipientPrincipal | null {
  if (id === PRIMARY_RECIPIENT_ID)
    return {
      id,
      email: normalizeRecipientEmail(c.recipient.email),
      name: c.recipient.name,
      primary: true,
    };
  const recipient = c.additionalRecipients?.find((item) => item.id === id);
  if (
    !recipient ||
    (!includeRevoked && (recipient.revokedAt || c.status !== "approved"))
  )
    return null;
  return {
    id: recipient.id,
    email: recipient.email,
    name: recipient.name || "",
    primary: false,
  };
}

export function recipientForEmail(
  c: Collection,
  email: string,
): RecipientPrincipal | null {
  const normalized = normalizeRecipientEmail(email);
  if (normalizeRecipientEmail(c.recipient.email) === normalized)
    return recipientById(c);
  const recipient = c.additionalRecipients?.find(
    (item) =>
      normalizeRecipientEmail(item.email) === normalized && !item.revokedAt,
  );
  return recipient ? recipientById(c, recipient.id) : null;
}
