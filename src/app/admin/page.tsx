import LegacyAdmin from "@/components/admin/LegacyAdmin";
import { requireAdminPage } from "@/lib/admin-page";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdminPage("/admin");
  return <LegacyAdmin />;
}
