import { RecipientAccessGate } from "@/components/account/RecipientAccessGate";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id, chapterId } = await params;
  const { key } = await searchParams;
  return (
    <RecipientAccessGate id={id} chapterId={chapterId} accessKey={key || ""} />
  );
}
