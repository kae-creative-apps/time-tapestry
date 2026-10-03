import type { Metadata } from "next";
import { GiftClaim } from "@/components/organizations/GiftClaim";

export const metadata: Metadata = {
  title: "Your story gift | Time Tapestry",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; giftId: string }>;
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const [{ organizationId, giftId }, { key }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <GiftClaim
      key={`${organizationId}:${giftId}:${typeof key === "string" ? key : ""}`}
      organizationId={organizationId}
      giftId={giftId}
      accessKey={typeof key === "string" ? key : ""}
    />
  );
}
