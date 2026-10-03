import { RecipientAccessGate } from "@/components/account/RecipientAccessGate";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;
  return <RecipientAccessGate id={id} view="address" accessKey={key || ""} />;
}
