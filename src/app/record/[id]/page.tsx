import type { Metadata } from "next";
import Interview from "@/components/collection/Interview";
import LiveInterview from "@/components/collection/LiveInterview";

export const metadata: Metadata = {
  title: "Your interview | Time Tapestry",
  robots: { index: false, follow: false },
};

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string; classic?: string }>;
}) {
  const [{ id }, { key = "", classic }] = await Promise.all([
    params,
    searchParams,
  ]);
  return classic === "1" ? (
    <Interview collectionId={id} accessKey={key} />
  ) : (
    <LiveInterview collectionId={id} accessKey={key} />
  );
}
