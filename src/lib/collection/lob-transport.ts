import { createHash } from "node:crypto";

const TRANSPORT_FIELD = "__timeTapestryLobTransport";
const MULTIPART_VERSION = "multipart-html-v1";

export type LobPostcardPayload = {
  description: string;
  to: Record<string, string>;
  from: string | Record<string, string>;
  size: string;
  mail_type: string;
  use_type: string;
  front: string;
  back: string;
};

/** Freeze transport choice with the provider payload before its first attempt. */
export function serializeLobPostcardRequest(payload: LobPostcardPayload) {
  return JSON.stringify({ [TRANSPORT_FIELD]: MULTIPART_VERSION, payload });
}

/** Inline Lob HTML is capped at 10,000 characters. Upload the complete approved
 * HTML as files, using stable bytes and a stable boundary for every retry. */
export function lobPostcardTransport(serialized: string): {
  contentType: string;
  body: string | Uint8Array<ArrayBuffer>;
} {
  const envelope = JSON.parse(serialized);
  // Previously frozen requests retain their original wire format. The worker
  // holds these for reconciliation instead of silently migrating a retry.
  if (!envelope || !Object.hasOwn(envelope, TRANSPORT_FIELD))
    return { contentType: "application/json", body: serialized };
  if (envelope[TRANSPORT_FIELD] !== MULTIPART_VERSION)
    throw new Error("This saved postcard transport needs reconciliation.");
  const payload = envelope.payload as LobPostcardPayload;
  const fields = [
    "description",
    "to",
    "from",
    "size",
    "mail_type",
    "use_type",
    "front",
    "back",
  ] as const;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).some(
      (key) => !fields.includes(key as (typeof fields)[number]),
    )
  )
    throw new Error("This saved postcard payload needs reconciliation.");
  const boundary = `tt-${createHash("sha256").update(serialized).digest("hex")}`;
  if (serialized.includes(boundary))
    throw new Error("This saved postcard boundary needs reconciliation.");
  const chunks: Buffer[] = [];
  const part = (name: string, value: unknown, file = false) => {
    if (typeof value !== "string")
      throw new Error("This saved postcard field needs reconciliation.");
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"${file ? `; filename="${name}.html"` : ""}\r\n${file ? "Content-Type: text/html; charset=utf-8\r\n" : ""}\r\n${value}\r\n`,
        "utf8",
      ),
    );
  };
  for (const field of fields) {
    const value = payload[field];
    if ((field === "to" || field === "from") && typeof value !== "string") {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !Object.keys(value).length
      )
        throw new Error("This saved postcard address needs reconciliation.");
      for (const [key, entry] of Object.entries(value)) {
        if (!/^[a-z][a-z0-9_]*$/.test(key))
          throw new Error(
            "This saved postcard address field needs reconciliation.",
          );
        part(`${field}[${key}]`, entry);
      }
    } else part(field, value, field === "front" || field === "back");
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: new Uint8Array(Buffer.concat(chunks)),
  };
}
