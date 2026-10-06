import CollectionHome from "@/components/collection/CollectionHome";

/** Uses the existing access-checked collection API. The flag never grants a role. */
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;
  return <CollectionHome id={id} accessKey={key || ""} previewRecipient />;
}
