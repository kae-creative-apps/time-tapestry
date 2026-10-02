import AddressPage from "@/components/collection/AddressPage";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;
  return <AddressPage id={id} accessKey={key || ""} />;
}
