import CollectionHome from "@/components/collection/CollectionHome";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;
  return <CollectionHome id={id} accessKey={key || ""} />;
}
