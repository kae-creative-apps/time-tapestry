import type { Metadata } from "next";
import { VerifyAccount } from "@/components/account/VerifyAccount";
export const metadata: Metadata = {
  title: "Open your account | Time Tapestry",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function VerifyPage() {
  return <VerifyAccount />;
}
