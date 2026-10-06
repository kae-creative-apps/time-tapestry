import LegacyAdminSession from "@/components/admin/LegacyAdminSession";
import { requireAdminPage } from "@/lib/admin-page";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdminPage("/admin");
  return <LegacyAdminSession />;
}
