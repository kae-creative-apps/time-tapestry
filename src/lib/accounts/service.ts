import { createHash, randomBytes } from "node:crypto";
import {
  listCollections,
  getCollection,
  mutateRecord,
  readRecord,
  writeRecord,
} from "../collection/store";
import { secretMatches } from "../collection/access";
import type { Collection } from "../collection/types";
import {
  normalizeRecipientEmail,
  recipientForEmail,
} from "../collection/recipients";
import { SecurityError } from "../security/policy";
import { adminReturnPath, isAdminEmail } from "../admin-policy";
import {
  accountEmailAvailable,
  accountOrigin,
  requireAccountMail,
  sendAccountLink,
  type AccountMailer,
} from "./mail";
import type {
  Account,
  AccountRole,
  AccountSession,
  EmailVerification,
  LibraryItem,
  RecipientLocator,
} from "./types";
export const LOGIN_LIFETIME_SECONDS = 15 * 60;
export const ACCOUNT_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const randomCredential = () => randomBytes(32).toString("hex");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const validCredential = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const tokenKey = (token: string) => `login-${hash(token)}`;
const accountKey = (id: string) => `account-${id}`;
const sessionKey = (token: string) => `account-session-${hash(token)}`;
const timestamp = (value: number) => new Date(value).toISOString();
export function normalizeAccountEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new SecurityError("Enter a valid email address.", 400);
  return email;
}
export function emailHint(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.min(5, Math.max(2, local.length - 1)))}@${domain}`;
}
/** Accept route parts only, never a caller-provided redirect or private key. */
export function normalizeRecipientLocator(
  value: unknown,
): RecipientLocator | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SecurityError("This story link is not valid.", 400);
  const locator = value as Record<string, unknown>;
  if (
    Object.keys(locator).some(
      (key) => !["collectionId", "chapterId", "view"].includes(key),
    ) ||
    typeof locator.collectionId !== "string" ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(locator.collectionId) ||
    (locator.view !== undefined &&
      !["address", "stories"].includes(String(locator.view))) ||
    (locator.view !== undefined && locator.chapterId !== undefined) ||
    (locator.chapterId !== undefined &&
      (typeof locator.chapterId !== "string" ||
        !/^q[1-4]$/.test(locator.chapterId)))
  )
    throw new SecurityError("This story link is not valid.", 400);
  if (locator.view === "address" || locator.view === "stories")
    return { collectionId: locator.collectionId, view: locator.view };
  return {
    collectionId: locator.collectionId,
    ...(locator.chapterId === undefined
      ? {}
      : { chapterId: locator.chapterId as RecipientLocator["chapterId"] }),
  };
}
function recipientReturnPath(locator: RecipientLocator | undefined) {
  return locator
    ? `/collection/${locator.collectionId}${locator.view ? `/${locator.view}` : locator.chapterId ? `/chapter/${locator.chapterId}` : ""}`
    : "/account";
}
/** Dependencies may be injected by tests only. Public routes never expose the token or nonce. */
export async function beginAccountLogin(
  emailValue: unknown,
  nonce: string,
  testOptions?: { sendMail?: AccountMailer; now?: number },
  recipientLocatorValue?: unknown,
  adminDestination?: string,
) {
  if (testOptions && process.env.NODE_ENV !== "test")
    throw new Error("Account test overrides are disabled.");
  const email = normalizeAccountEmail(emailValue);
  const recipientLocator = normalizeRecipientLocator(recipientLocatorValue);
  if (
    adminDestination !== undefined &&
    (!isAdminEmail(email) || recipientLocator)
  )
    throw new SecurityError(
      "Use an approved team email to request admin access.",
      403,
    );
  if (!validCredential(nonce))
    throw new SecurityError("Please request a new sign-in link.", 400);
  if (!testOptions?.sendMail) {
    if (recipientLocator && !accountEmailAvailable())
      throw new SecurityError(
        "Email sign-in is temporarily unavailable. Please try again when email setup is complete.",
        503,
      );
    requireAccountMail();
  }
  const now = testOptions?.now ?? Date.now(),
    token = randomCredential(),
    tokenId = hash(token);
  const record: EmailVerification = {
    recordType: "account-email-verification",
    email,
    nonceHash: hash(nonce),
    createdAt: timestamp(now),
    expiresAt: timestamp(now + LOGIN_LIFETIME_SECONDS * 1000),
    ...(recipientLocator ? { recipientLocator } : {}),
    ...(adminDestination !== undefined
      ? { adminReturnPath: adminReturnPath(adminDestination) }
      : {}),
  };
  await writeRecord(tokenKey(token), record);
  try {
    await (testOptions?.sendMail ?? sendAccountLink)({
      email,
      url: `${accountOrigin()}/account/verify#token=${token}`,
      tokenId,
    });
  } catch (error) {
    await mutateRecord<EmailVerification>(tokenKey(token), (current) => ({
      ...(current || record),
      cancelledAt: timestamp(Date.now()),
    }));
    throw error;
  }
  return {
    ok: true as const,
    message:
      "Check your email for a sign-in link. It expires in 15 minutes. Open it in this browser to continue.",
  };
}
export async function verificationView(
  token: unknown,
  nonce: unknown,
  now = Date.now(),
) {
  if (!validCredential(token))
    throw new SecurityError(
      "This sign-in link is not valid. Please request a new one.",
      400,
    );
  const record = await readRecord<EmailVerification>(tokenKey(token));
  if (
    !record ||
    record.recordType !== "account-email-verification" ||
    record.cancelledAt
  )
    throw new SecurityError(
      "This sign-in link is no longer available. Please request a new one.",
      404,
    );
  const common = {
    emailHint: emailHint(record.email),
    expiresAt: record.expiresAt,
  };
  if (record.usedAt)
    return { ...common, canConfirm: false, reason: "already_used" as const };
  if (
    !Number.isFinite(Date.parse(record.expiresAt)) ||
    Date.parse(record.expiresAt) <= now
  )
    return { ...common, canConfirm: false, reason: "expired" as const };
  if (!validCredential(nonce) || !secretMatches(hash(nonce), record.nonceHash))
    return {
      ...common,
      canConfirm: false,
      reason: "different_browser" as const,
    };
  return { ...common, canConfirm: true, reason: undefined };
}
export async function confirmAccountLogin(
  token: unknown,
  nonce: unknown,
  now = Date.now(),
) {
  if (!validCredential(token) || !validCredential(nonce))
    throw new SecurityError(
      "Open the link in the browser where you requested it, or request a new sign-in link here.",
      400,
    );
  const sessionToken = randomCredential();
  let verified: Account | undefined;
  let nextUrl = "/account";
  const expiresAt = timestamp(now + ACCOUNT_SESSION_SECONDS * 1000);
  await mutateRecord<EmailVerification>(tokenKey(token), async (record) => {
    if (
      !record ||
      record.recordType !== "account-email-verification" ||
      !Number.isFinite(Date.parse(record.expiresAt)) ||
      record.cancelledAt ||
      record.usedAt ||
      Date.parse(record.expiresAt) <= now
    )
      throw new SecurityError(
        "This sign-in link expired or was already used. Please request a new one.",
        400,
      );
    if (!secretMatches(hash(nonce), record.nonceHash))
      throw new SecurityError(
        "Open the link in the browser where you requested it, or request a new sign-in link here.",
        400,
      );
    nextUrl = recipientReturnPath(
      normalizeRecipientLocator(record.recipientLocator),
    );
    if (record.adminReturnPath && isAdminEmail(record.email))
      nextUrl = adminReturnPath(record.adminReturnPath);
    const id = hash(record.email);
    verified = await mutateRecord<Account>(accountKey(id), (existing) => ({
      recordType: "verified-account",
      id,
      email: record.email,
      createdAt: existing?.createdAt || timestamp(now),
      verifiedAt: timestamp(now),
    }));
    const session: AccountSession = {
      recordType: "account-session",
      accountId: id,
      createdAt: timestamp(now),
      expiresAt,
    };
    await writeRecord(sessionKey(sessionToken), session);
    return { ...record, usedAt: timestamp(now) };
  });
  return { account: verified!, sessionToken, expiresAt, nextUrl };
}
export async function accountFromSession(token: unknown, now = Date.now()) {
  if (!validCredential(token)) return null;
  const session = await readRecord<AccountSession>(sessionKey(token));
  if (
    !session ||
    session.recordType !== "account-session" ||
    session.revokedAt ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= now ||
    !/^[a-f0-9]{64}$/.test(session.accountId)
  )
    return null;
  const account = await readRecord<Account>(accountKey(session.accountId));
  if (
    !account ||
    account.recordType !== "verified-account" ||
    account.id !== session.accountId ||
    !account.verifiedAt ||
    !Number.isFinite(Date.parse(account.verifiedAt))
  )
    return null;
  return { account, expiresAt: session.expiresAt };
}
export async function revokeAccountSession(token: unknown, now = Date.now()) {
  if (!validCredential(token)) return;
  const existing = await readRecord<AccountSession>(sessionKey(token));
  if (!existing) return;
  await mutateRecord<AccountSession>(sessionKey(token), (current) => ({
    ...(current || existing),
    revokedAt: timestamp(now),
  }));
}
export function accountRole(c: Collection, email: string): AccountRole | null {
  const matches = (value?: string) =>
    value?.trim().toLowerCase() === normalizeRecipientEmail(email);
  if (matches(c.storyteller.email)) return "owner";
  if (recipientForEmail(c, email)) return "recipient";
  if (matches(c.requester.email)) return "requester";
  return null;
}
function ownerInterviewState(
  c: Collection,
): NonNullable<LibraryItem["interviewState"]> {
  if (c.status === "approved") return "approved";
  const prepared =
    !c.draftOutdated &&
    c.chapters.length === 4 &&
    c.chapters.every(
      (chapter) =>
        chapter.videoStatus === "ready" &&
        chapter.videoMediaId &&
        chapter.film?.narrationKind === "original_recording" &&
        (!c.interviewPreparation?.filmJobId ||
          chapter.film.jobId === c.interviewPreparation.filmJobId),
    );
  if (c.interviewPreparation && !prepared) return "preparing";
  return c.chapters.length || c.status === "draft" ? "review" : "recording";
}

function libraryItem(
  c: Collection,
  role: AccountRole,
  email: string,
): LibraryItem {
  const approved = c.status === "approved",
    owner = role === "owner";
  const recipient = role === "recipient" ? recipientForEmail(c, email) : null;
  const deliveries =
    role === "recipient" && !recipient?.primary ? [] : c.deliveries;
  return {
    id: c.id,
    role,
    status: c.status,
    storytellerName: c.storyteller.name,
    recipientName: recipient ? recipient.name : c.recipient.name,
    updatedAt: c.updatedAt,
    storyCount:
      owner || (approved && role === "recipient") ? c.chapters.length : 0,
    recordingCount: owner
      ? new Set([
          ...c.takes.flatMap((t) =>
            [t.mediaId, t.audioMediaId].filter(Boolean),
          ),
          ...(c.interviews || []).flatMap((s) =>
            s.segments.flatMap((segment) =>
              [segment.mediaId, segment.audioMediaId].filter(Boolean),
            ),
          ),
        ]).size
      : approved && role === "recipient"
        ? c.chapters.filter(
            (chapter) =>
              chapter.videoMediaId &&
              chapter.film?.mediaId === chapter.videoMediaId &&
              chapter.film.narrationKind === "original_recording",
          ).length
        : 0,
    postcards: {
      scheduled: deliveries.filter((d) => d.status === "scheduled").length,
      mailed: deliveries.filter((d) => d.status === "mailed").length,
      needsAttention: owner
        ? c.deliveries.filter((d) => ["failed", "returned"].includes(d.status))
            .length
        : 0,
    },
    ...(owner ? { interviewState: ownerInterviewState(c) } : {}),
    openUrl: `/api/account/library/${c.id}/open`,
  };
}
export async function accountLibrary(account: Account) {
  const items: LibraryItem[] = [];
  for (const c of await listCollections()) {
    const role = accountRole(c, account.email);
    if (role) items.push(libraryItem(c, role, account.email));
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { email: account.email, items, total: items.length };
}
export async function accountCollectionPath(account: Account, id: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
    throw new SecurityError("Story not found in your account.", 404);
  const c = await getCollection(id),
    role = c && accountRole(c, account.email);
  if (!c || !role)
    throw new SecurityError("Story not found in your account.", 404);
  if (role === "owner") {
    const key = `?key=${c.ownerKey}`;
    if (c.status === "approved") return `/collection/${c.id}/review${key}`;
    if (ownerInterviewState(c) === "preparing")
      return `/collection/${c.id}/complete${key}`;
    if (c.chapters.length || c.status === "draft")
      return `/collection/${c.id}/review${key}`;
    const classic =
      !c.interviews?.length && c.takes.some((take) => take.kind !== "text");
    return `/record/${c.id}${key}${classic ? "&classic=1" : ""}`;
  }
  return role === "recipient"
    ? `/collection/${c.id}`
    : `/collection/${c.id}?key=${c.requesterKey}`;
}
