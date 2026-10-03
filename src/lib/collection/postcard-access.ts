/** Public locator only. Story and media access still require the intended recipient's verified account. */
export function recipientPostcardUrl(
  collectionId: string,
  chapterId: string,
  origin: string,
) {
  const host = new URL(origin);
  if (
    host.protocol !== "https:" ||
    host.username ||
    host.password ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(collectionId) ||
    !/^q[1-4]$/.test(chapterId)
  )
    throw new Error("The postcard needs a valid secure story address.");
  return `${host.origin}/collection/${encodeURIComponent(collectionId)}/chapter/${chapterId}`;
}
