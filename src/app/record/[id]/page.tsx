import type { Metadata } from "next";
import Interview from "@/components/collection/Interview";

export const metadata: Metadata = {
  title: "Your interview | Time Tapestry",
  robots: { index: false, follow: false },
};

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key = "" }] = await Promise.all([params, searchParams]);
  return <Interview collectionId={id} accessKey={key} />;
}
