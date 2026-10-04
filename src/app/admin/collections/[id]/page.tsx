import { CollectionAdminDetail } from "@/components/admin/CollectionAdmin";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CollectionAdminDetail id={id} />;
}
