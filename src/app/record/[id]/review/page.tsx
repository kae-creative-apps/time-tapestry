import type { Metadata } from "next";
import InterviewRecordingReview from "@/components/collection/InterviewRecordingReview";

export const metadata: Metadata = {
  title: "Your recordings | Time Tapestry",
  robots: { index: false, follow: false },
};

export default async function RecordingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string; chapter?: string }>;
}) {
  const [{ id }, { key = "", chapter }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <InterviewRecordingReview
      collectionId={id}
      accessKey={key}
      initialChapterId={chapter}
    />
  );
}
