import { metadataLimitBytes } from "./storage";
import { accountEmailAvailable } from "../accounts/mail";
import path from "node:path";
import { dataRoot } from "../collection/store";
import { MAX_MEDIA_BYTES, collectionStorageLimit } from "../collection/usage";
/** Operational readiness only. Never returns credentials, contact details, or filesystem paths. */
export function getSecurityHealth() {
  const durableMetadataConfigured = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );
  const mediaStoreConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const temporaryLocalStorage =
    !mediaStoreConfigured &&
    /^\/(private\/)?(tmp|var\/folders)(\/|$)/.test(path.resolve(dataRoot));
  const protectionConfigured = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
    process.env.TURNSTILE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") &&
    durableMetadataConfigured,
  );
  let storageLimitBytes: number | null = null;
  let metadataBytes: number | null = null;
  try {
    metadataBytes = metadataLimitBytes();
  } catch {
    /* Keep existing records and readiness visible when a limit needs repair. */
  }
  try {
    storageLimitBytes = collectionStorageLimit();
  } catch {
    /* Explicitly mark invalid configuration. */
  }
  return {
    metadataStore: durableMetadataConfigured ? "cloud-kv" : "local-filesystem",
    mediaStore: mediaStoreConfigured
      ? "blob-configured"
      : process.env.VERCEL
        ? "unconfigured"
        : "local-filesystem",
    temporaryLocalStorage,
    durableMetadataConfigured,
    mediaStoreConfigured,
    cloudStorageConfigured: durableMetadataConfigured && mediaStoreConfigured,
    protectionConfigured,
    adminConfigured: accountEmailAvailable(),
    limits: {
      collectionBytes: storageLimitBytes,
      fileBytes: MAX_MEDIA_BYTES,
      metadataBytes,
      sessionMinutes: 45,
    },
    retention:
      "No automatic draft deletion. Storage must remain configured and backed up.",
    caveats: [
      ...(temporaryLocalStorage
        ? [
            "Local recordings are in a temporary directory. Move them only during a planned, stopped-server migration.",
          ]
        : []),
      ...(mediaStoreConfigured
        ? [
            "Private Blob access is verified during uploads. Configuration alone does not confirm provider availability.",
          ]
        : []),
      "Metadata listing and usage bootstrap currently scan records. A database/index migration is required before terabyte-scale operations.",
    ],
  };
}
