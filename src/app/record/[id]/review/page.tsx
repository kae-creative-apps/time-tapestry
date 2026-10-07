import { redirect } from "next/navigation";

/**
 * The separate raw-recording review step was retired: finishing the
 * interview now submits it directly. Old links return to the interview,
 * which forwards to the completion page once the interview is submitted.
 */
export default async function RecordingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key = "" }] = await Promise.all([params, searchParams]);
  redirect(`/record/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`);
}
