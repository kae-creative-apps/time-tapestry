import type { Collection, PostcardCadence } from "./types";

type ScheduledCollection = Pick<Collection, "postcardCadence">;

/** Missing cadence belongs to an older collection and retains its quarterly journey. */
export function collectionPostcardCadence(
  c: ScheduledCollection,
): PostcardCadence {
  return c.postcardCadence === "biweekly" ? "biweekly" : "quarterly";
}
export function postcardCadenceLabel(c: ScheduledCollection) {
  return collectionPostcardCadence(c) === "biweekly"
    ? "every two weeks"
    : "every three months";
}
export function addCalendarMonths(iso: string, months: number) {
  const original = new Date(iso);
  if (!Number.isFinite(original.getTime()))
    throw new Error("Invalid schedule date");
  const target = new Date(original);
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString();
}
export function postcardScheduledDate(
  c: ScheduledCollection,
  firstDate: string,
  intervalIndex: number,
) {
  if (!Number.isSafeInteger(intervalIndex) || intervalIndex < 0)
    throw new Error("Invalid postcard interval");
  if (collectionPostcardCadence(c) === "quarterly")
    return addCalendarMonths(firstDate, intervalIndex * 3);
  const date = new Date(firstDate);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid schedule date");
  date.setUTCDate(date.getUTCDate() + intervalIndex * 14);
  return date.toISOString();
}
