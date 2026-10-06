import { CollectionAdminDetail } from "@/components/admin/CollectionAdmin";
import { requireAdminPage } from "@/lib/admin-page";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminPage(`/admin/collections/${id}`);
  return <CollectionAdminDetail id={id} />;
}
