import type { Metadata } from "next";
import InterviewComplete from "@/components/collection/InterviewComplete";

export const metadata: Metadata = {
  title: "Your interview | Time Tapestry",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key = "" }] = await Promise.all([params, searchParams]);
  return <InterviewComplete collectionId={id} accessKey={key} />;
}
