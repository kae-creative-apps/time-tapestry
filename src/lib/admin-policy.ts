/** Exact server-owned membership. Client form values never grant this role. */
const ADMIN_EMAILS = new Set(["team@foronestudios.com", "kbrooks@gloo.us"]);
export function isAdminEmail(value: unknown): value is string {
  return (
    typeof value === "string" && ADMIN_EMAILS.has(value.trim().toLowerCase())
  );
}

/** Only known admin destinations, never arbitrary URLs or credentials. */
export function adminReturnPath(value: unknown): string {
  return typeof value === "string" &&
    /^\/admin(?:\/collections(?:\/[a-zA-Z0-9_-]{8,80})?|\/session\/[a-zA-Z0-9_-]{8,80})?$/.test(
      value,
    )
    ? value
    : "/admin/collections";
}
