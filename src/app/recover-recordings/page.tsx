import type { Metadata } from "next";
import { DeviceRecordingRecovery } from "@/components/collection/DeviceRecordingRecovery";

export const metadata: Metadata = {
  title: "Find recordings on this device | Time Tapestry",
  robots: { index: false, follow: false },
};

export default function RecoverRecordingsPage() {
  return <DeviceRecordingRecovery />;
}
