import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminFromSession } from "./admin-auth";
import { ACCOUNT_COOKIE } from "./accounts/http";
import { adminReturnPath } from "./admin-policy";
export async function requireAdminPage(path: string) {
  const session = await adminFromSession(
    (await cookies()).get(ACCOUNT_COOKIE)?.value,
  );
  if (!session)
    redirect(
      `/admin/login?redirect=${encodeURIComponent(adminReturnPath(path))}`,
    );
  return session;
}
