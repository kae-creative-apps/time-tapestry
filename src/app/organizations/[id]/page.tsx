import type { Metadata } from "next";
import { OrganizationDashboard } from "@/components/organizations/OrganizationDashboard";

export const metadata: Metadata = {
  title: "Your group gifts | Time Tapestry",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const [{ id }, { key }] = await Promise.all([params, searchParams]);
  return (
    <OrganizationDashboard
      key={`${id}:${typeof key === "string" ? key : ""}`}
      id={id}
      accessKey={typeof key === "string" ? key : ""}
    />
  );
}
