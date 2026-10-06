import { CollectionAdminList } from "@/components/admin/CollectionAdmin";
import { requireAdminPage } from "@/lib/admin-page";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdminPage("/admin/collections");
  return <CollectionAdminList />;
}
