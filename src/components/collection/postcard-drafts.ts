/** Refresh only untouched fields. A delayed server response must never erase typing. */
export function mergePostcardDrafts(
  current: Record<string, string>,
  baseline: Record<string, string>,
  incoming: Record<string, string>,
) {
  return Object.fromEntries(
    Object.keys(incoming).map((id) => [
      id,
      current[id] === baseline[id]
        ? incoming[id]
        : (current[id] ?? incoming[id]),
    ]),
  );
}

export function postcardDraftsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((id) => a[id] === b[id])
  );
}
