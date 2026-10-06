import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCOUNT_COOKIE } from "@/lib/accounts/http";
import { adminFromSession } from "@/lib/admin-auth";
import { adminReturnPath } from "@/lib/admin-policy";
import AdminLogin from "@/components/admin/AdminLogin";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const destination = adminReturnPath((await searchParams).redirect);
  if (await adminFromSession((await cookies()).get(ACCOUNT_COOKIE)?.value))
    redirect(destination);
  return <AdminLogin redirect={destination} />;
}
