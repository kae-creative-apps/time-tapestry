import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GiftClaim } from "@/components/organizations/GiftClaim";
import { parseOrganizationJoinToken } from "@/lib/organizations/join-token";

export const metadata: Metadata = {
  title: "Your story gift | Time Tapestry",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const invitation = parseOrganizationJoinToken(orgToken);
  if (!invitation) notFound();
  return <GiftClaim key={orgToken} {...invitation} />;
}
