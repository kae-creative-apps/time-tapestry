import CollectionHome from "@/components/collection/CollectionHome";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id, chapterId } = await params;
  const { key } = await searchParams;
  return <CollectionHome id={id} chapterId={chapterId} accessKey={key || ""} />;
}
