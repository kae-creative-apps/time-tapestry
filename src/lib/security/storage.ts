import { SecurityError } from "./policy";
const DEFAULT_METADATA_BYTES = 8 * 1024 * 1024;
export function metadataLimitBytes() {
  const value = Number(
    process.env.COLLECTION_METADATA_LIMIT_BYTES || DEFAULT_METADATA_BYTES,
  );
  if (!Number.isSafeInteger(value) || value < 1024)
    throw new SecurityError(
      "Saved-story storage needs a configuration check.",
      503,
    );
  return value;
}
/** Never truncate content. Reject the new write before replacing any existing record. */
export function serializeMetadata(value: unknown) {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string")
    throw new SecurityError("Please provide valid details to save.", 400);
  if (Buffer.byteLength(serialized, "utf8") > metadataLimitBytes())
    throw new SecurityError(
      "This story collection has reached its saved-text allowance. Existing stories and recordings remain available. Keep this draft open and contact the team for more space.",
      413,
    );
  return serialized;
}
