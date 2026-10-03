import type { Metadata } from "next";
import { AccountHome } from "@/components/account/AccountHome";
export const metadata: Metadata = {
  title: "Your story collections | Time Tapestry",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return <AccountHome />;
}
