import type { ReactNode } from "react";
import LegacyAccessNotice from "@/components/LegacyAccessNotice";
import { legacyPageAllowed } from "@/lib/legacy-access";

export default async function LegacyInterviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await legacyPageAllowed())) return <LegacyAccessNotice />;
  return children;
}
