const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const tokenPattern = new RegExp(
  `^(${uuid})\\.(${uuid})\\.([a-f0-9]{64})$`,
  "i",
);

/** IDs are public locators; the random capability is stored only as a hash for new gifts. */
export function parseOrganizationJoinToken(value: string) {
  const match = tokenPattern.exec(value);
  return match
    ? { organizationId: match[1], giftId: match[2], accessKey: match[3] }
    : null;
}

export function organizationJoinUrl(
  organizationId: string,
  giftId: string,
  accessKey: string,
) {
  const token = `${organizationId}.${giftId}.${accessKey}`;
  if (!parseOrganizationJoinToken(token))
    throw new Error("Invalid gift invitation.");
  return `/join/${token}`;
}
