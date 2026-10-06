export type RecipientInvitation = { email: string; name?: string };

/** Keep entered names; an email address never supplies a guessed name. */
export function parseRecipientInvitations(
  value: string,
): RecipientInvitation[] {
  const recipients = new Map<string, RecipientInvitation>();
  for (const item of value
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    const named = item.match(/^(.+?)\s*<([^<>]+)>$/);
    const email = (named ? named[2] : item).trim().toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
      throw new Error(`Check this email address: ${item}`);
    const name = named?.[1].trim();
    if (name && name.length > 120)
      throw new Error("Keep each recipient name to 120 characters.");
    if (!recipients.has(email))
      recipients.set(email, { email, ...(name ? { name } : {}) });
  }
  if (!recipients.size) throw new Error("Add at least one email address.");
  return [...recipients.values()];
}

export function invitationBatches(recipients: RecipientInvitation[]) {
  const batches: RecipientInvitation[][] = [];
  for (let index = 0; index < recipients.length; index += 25)
    batches.push(recipients.slice(index, index + 25));
  return batches;
}

export function recipientReplyDraftKey(
  recipientId: string | undefined,
  email: string,
  chapterId: string,
) {
  return `recipient-reply:${recipientId || email.trim().toLowerCase()}:${chapterId}`;
}
